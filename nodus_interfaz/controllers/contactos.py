# Copyright 2026 Hadeon
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
"""API de la pantalla Contactos de hadeon_ui, sobre los contactos de Odoo.

- Cliente = contacto con ventas, o sin ser proveedor. Proveedor = contacto con compras.
- ID Fiscal = vat de Odoo; el tipo de documento (V, E, J, G, P) va como prefijo: J-12345678-9.
- Días de crédito = plazo de pago "Crédito N días" (se crea la primera vez que se usa).
- Historial = facturas publicadas del contacto y, en clientes, pedidos del POS sin factura.
"""
import html
import json
import logging
import re

from odoo import fields, http
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.http import request
from odoo.tools import html2plaintext

_logger = logging.getLogger(__name__)

TIPOS_DOC = ("V", "E", "J", "G", "P")
ESTADOS_POS = ("paid", "done", "invoiced")


def cuerpo():
    return json.loads(request.httprequest.data or b"{}")


def responder(datos, estado=200):
    return request.make_json_response(datos, status=estado)


def esc(texto):
    """Los textos se muestran dentro de plantillas HTML: se escapan en el servidor y se
    entrega aparte el valor original (campo "crudo") para los formularios."""
    return html.escape(texto or "", quote=True)


def separar_documento(vat):
    """'J-12345678-9' -> ('J', '12345678-9'); sin prefijo -> ('', vat)."""
    m = re.match(r"^\s*([VEJGPvejgp])\s*-?\s*(.*)$", vat or "")
    if m and m.group(2):
        return m.group(1).upper(), m.group(2).strip()
    return "", (vat or "").strip()


class NodusContactosAPI(http.Controller):

    # ------------------------------------------------------------------ lectura
    def _dominio_base(self):
        env = request.env
        return [("user_ids", "=", False), ("type", "=", "contact"),
                ("id", "not in", env["res.company"].sudo().search([]).partner_id.ids)]

    def _usd(self):
        return request.env.ref("base.USD", raise_if_not_found=False)

    def _a_usd(self, monto, moneda, fecha):
        usd, empresa = self._usd(), request.env.company
        if not usd or moneda == usd:
            return monto
        return moneda._convert(monto, usd, empresa, fecha or fields.Date.context_today(request.env["res.partner"]))

    def _dias_credito(self, partner, proveedor):
        plazo = partner.property_supplier_payment_term_id if proveedor else partner.property_payment_term_id
        linea = plazo.line_ids[:1] if plazo else False
        return int(linea.nb_days) if linea else 0

    def _historial(self, partners, proveedor):
        """{partner_id: [factura...]} con folio, fecha, total en $, estado y método de pago."""
        env, hoy = request.env, fields.Date.context_today(request.env["res.partner"])
        salida = {p.id: [] for p in partners}
        tipos = ("in_invoice", "in_refund") if proveedor else ("out_invoice", "out_refund")
        try:
            movimientos = env["account.move"].search([
                ("partner_id", "in", partners.ids), ("state", "=", "posted"), ("move_type", "in", tipos)],
                order="invoice_date desc, id desc", limit=400)
        except AccessError:
            movimientos = env["account.move"]
        for mv in movimientos:
            signo = -1 if mv.move_type.endswith("refund") else 1
            pagos = mv._get_reconciled_payments()[:1]
            if mv.payment_state in ("paid", "in_payment"):
                estado = "pagada"
            elif mv.invoice_date_due and mv.invoice_date_due < hoy:
                estado = "vencida"
            else:
                estado = "pendiente"
            salida[mv.partner_id.id].append({
                "folio": esc(mv.name or mv.ref or ""), "fecha": str(mv.invoice_date or ""),
                "total": round(signo * self._a_usd(mv.amount_total, mv.currency_id, mv.invoice_date), 2),
                "estado": estado, "metodoPago": esc(pagos.journal_id.name if pagos else ""),
                "referencia": esc((pagos.memo or "") if pagos else ""),
            })
        if not proveedor and "pos.order" in env:
            try:
                pedidos = env["pos.order"].search([
                    ("partner_id", "in", partners.ids), ("state", "in", ("paid", "done")), ("account_move", "=", False)],
                    order="date_order desc", limit=400)
            except AccessError:
                pedidos = env["pos.order"]
            for po in pedidos:
                pago = po.payment_ids[:1]
                salida[po.partner_id.id].append({
                    "folio": esc(po.name), "fecha": str(po.date_order.date()),
                    "total": round(self._a_usd(po.amount_total, po.currency_id, po.date_order.date()), 2),
                    "estado": "pagada", "metodoPago": esc(pago.payment_method_id.name if pago else ""), "referencia": "",
                })
        for lista in salida.values():
            lista.sort(key=lambda f: f["fecha"], reverse=True)
        return salida

    def _a_dict(self, p, proveedor, facturas):
        tipo_doc, numero = separar_documento(p.vat)
        telefono = p.phone or ""
        notas = html2plaintext(p.comment or "").strip()
        return {
            "id": p.id, "nombre": esc(p.name), "idFiscal": esc(p.vat), "telefono": esc(telefono), "email": esc(p.email),
            "direccion": esc(p.street), "notas": esc(notas), "estado": "activo" if p.active else "inactivo",
            "contribuyenteEspecial": bool(p.nodus_contribuyente_especial),
            "diasCredito": self._dias_credito(p, proveedor), "facturas": facturas,
            "crudo": {"nombre": p.name or "", "idFiscal": p.vat or "", "tipoDocumento": tipo_doc, "numeroDocumento": numero,
                      "telefono": telefono, "email": p.email or "", "direccion": p.street or "", "notas": notas},
        }

    @http.route("/nodus/api/contactos", type="http", auth="user", methods=["GET"], csrf=False)
    def listar(self, **kw):
        Partner = request.env["res.partner"].with_context(active_test=False)
        base = self._dominio_base()
        clientes = Partner.search(base + ["|", ("customer_rank", ">", 0), ("supplier_rank", "=", 0)], order="name", limit=1000)
        proveedores = Partner.search(base + [("supplier_rank", ">", 0)], order="name", limit=1000)
        hist_c, hist_p = self._historial(clientes, False), self._historial(proveedores, True)
        return responder({
            "clientes": [self._a_dict(p, False, hist_c[p.id]) for p in clientes],
            "proveedores": [self._a_dict(p, True, hist_p[p.id]) for p in proveedores],
        })

    # ------------------------------------------------------------------ escritura
    def _plazo_credito(self, dias):
        """Plazo de pago 'Crédito N días' (se crea la primera vez); 0 días = sin plazo."""
        dias = int(dias or 0)
        if dias <= 0:
            return False
        # sudo: el plazo lo crea el sistema (solo nombre y días); el usuario del negocio no
        # necesita ser administrador de Contabilidad para darle crédito a un cliente
        Plazo = request.env["account.payment.term"].sudo()
        nombre = f"Crédito {dias} días"
        plazo = Plazo.search([("name", "=", nombre)], limit=1)
        if not plazo:
            plazo = Plazo.create({"name": nombre, "line_ids": [(0, 0, {"value": "percent", "value_amount": 100.0,
                                                                         "delay_type": "days_after", "nb_days": dias})]})
        return plazo.id

    def _vals(self, datos, proveedor):
        tipo_doc = (datos.get("tipoDocumento") or "").upper()
        numero = (datos.get("idFiscal") or "").strip()
        vat = numero
        if tipo_doc in TIPOS_DOC and not re.match(r"^[VEJGPvejgp]\s*-", numero):
            vat = f"{tipo_doc}-{numero}"
        notas = (datos.get("notas") or "").strip()
        vals = {
            "name": (datos.get("nombre") or "").strip(),
            "vat": vat or False,
            "phone": (datos.get("telefono") or "").strip() or False,
            "email": (datos.get("email") or "").strip() or False,
            "street": (datos.get("direccion") or "").strip() or False,
            "comment": f"<p>{html.escape(notas)}</p>" if notas else False,
            "active": datos.get("estado") != "inactivo",
            "nodus_contribuyente_especial": bool(datos.get("contribuyenteEspecial")),
        }
        campo_plazo = "property_supplier_payment_term_id" if proveedor else "property_payment_term_id"
        vals[campo_plazo] = self._plazo_credito(datos.get("diasCredito"))
        return vals

    def _guardar(self, partner, datos):
        proveedor = datos.get("tipo") == "proveedor"
        vals = self._vals(datos, proveedor)
        try:
            with request.env.cr.savepoint():
                if partner:
                    if proveedor and partner.supplier_rank < 1:
                        vals["supplier_rank"] = 1
                    elif not proveedor and partner.customer_rank < 1:
                        vals["customer_rank"] = 1
                    partner.write(vals)
                else:
                    vals["supplier_rank" if proveedor else "customer_rank"] = 1
                    partner = request.env["res.partner"].create(vals)
        except (ValidationError, UserError) as e:
            return None, responder({"error": e.args[0] if e.args else "No se pudo guardar el contacto."}, 400)
        return partner, None

    @http.route("/nodus/api/contactos", type="http", auth="user", methods=["POST"], csrf=False)
    def crear(self, **kw):
        datos = cuerpo()
        if not (datos.get("nombre") or "").strip():
            return responder({"error": "El nombre es obligatorio."}, 400)
        partner, error = self._guardar(None, datos)
        return error or responder({"id": partner.id})

    @http.route("/nodus/api/contactos/<int:cid>", type="http", auth="user", methods=["POST"], csrf=False)
    def editar(self, cid, **kw):
        partner = request.env["res.partner"].with_context(active_test=False).browse(cid).exists()
        if not partner:
            return responder({"error": "Contacto no encontrado."}, 404)
        datos = cuerpo()
        if not (datos.get("nombre") or "").strip():
            return responder({"error": "El nombre es obligatorio."}, 400)
        partner, error = self._guardar(partner, datos)
        return error or responder({"id": partner.id})

    @http.route("/nodus/api/contactos/<int:cid>/eliminar", type="http", auth="user", methods=["POST"], csrf=False)
    def eliminar(self, cid, **kw):
        partner = request.env["res.partner"].with_context(active_test=False).browse(cid).exists()
        if not partner:
            return responder({"eliminado": True})
        try:
            with request.env.cr.savepoint():
                partner.unlink()
            return responder({"eliminado": True})
        except Exception:
            # Con facturas, ventas o compras no se puede borrar: se archiva (queda como inactivo)
            partner.active = False
            return responder({"eliminado": False, "archivado": True})
