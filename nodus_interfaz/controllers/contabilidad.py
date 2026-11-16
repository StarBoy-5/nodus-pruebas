# Copyright 2026 Hadeon
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
"""API de la pantalla Contabilidad de hadeon_ui, sobre la contabilidad de Odoo.

Una sola lectura (/nodus/api/contabilidad/datos) entrega todo lo que dibujan las pestañas:
- lineas: apuntes de asientos publicados, con su cuenta y grupo (Mayor, Diario, Balances).
- cxc / cxp: facturas de clientes y proveedores con lo abonado.
- asientos: lista de asientos (publicados y borradores) con sus líneas.
- catálogos: cuentas, diarios y diarios de banco/caja.
Los montos salen en dólares o en bolívares según el parámetro `moneda` (usd por defecto, como el
diseño); se convierten con la tasa de la fecha de cada movimiento.

Acciones: registrar un asiento, asentar un borrador, cobrar/pagar una factura y registrar un gasto.
"""
import json
import logging

from odoo import fields, http
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.http import request

_logger = logging.getLogger(__name__)

MESES = ("Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic")
LIMITE_LINEAS = 20000

# tipo de cuenta de Odoo -> grupo del balance
GRUPOS = {
    "asset_receivable": "activo_corriente", "asset_cash": "activo_corriente", "asset_current": "activo_corriente",
    "asset_prepayments": "activo_corriente", "asset_non_current": "activo_no_corriente", "asset_fixed": "activo_no_corriente",
    "liability_payable": "pasivo_corriente", "liability_credit_card": "pasivo_corriente", "liability_current": "pasivo_corriente",
    "liability_non_current": "pasivo_no_corriente", "equity": "patrimonio", "equity_unaffected": "patrimonio",
    "income": "ingreso", "income_other": "ingreso", "expense_direct_cost": "costo", "expense": "gasto",
    "expense_depreciation": "gasto", "off_balance": "fuera",
}
ACREEDORAS = ("pasivo_corriente", "pasivo_no_corriente", "patrimonio", "ingreso")


def cuerpo():
    return json.loads(request.httprequest.data or b"{}")


def responder(datos, estado=200):
    return request.make_json_response(datos, status=estado)


def texto_fecha(f):
    return f"{f.day:02d} {MESES[f.month - 1]} {f.year}" if f else ""


class NodusContabilidadAPI(http.Controller):

    # ------------------------------------------------------------------ monedas
    def _moneda(self, clave):
        env = request.env
        usd = env.ref("base.USD", raise_if_not_found=False)
        ves = env.ref("base.VES", raise_if_not_found=False)
        if clave == "bs" or not usd:
            return ves or env.company.currency_id, "Bs "
        return usd, "$"

    def _convertir(self, monto, origen, destino, fecha):
        if origen == destino or not monto:
            return monto
        return origen._convert(monto, destino, request.env.company, fecha or fields.Date.context_today(request.env["res.partner"]))

    # ------------------------------------------------------------------ lectura
    def _cuentas(self):
        Cuenta = request.env["account.account"]
        cuentas = Cuenta.search([("deprecated", "=", False)], order="code") if "deprecated" in Cuenta._fields else Cuenta.search([], order="code")
        empresa = request.env.company
        cambio_g = empresa.income_currency_exchange_account_id
        cambio_p = empresa.expense_currency_exchange_account_id
        datos = {}
        for c in cuentas:
            grupo = GRUPOS.get(c.account_type, "otro")
            if c == cambio_g:
                grupo = "cambio_ganancia"
            elif c == cambio_p:
                grupo = "cambio_perdida"
            datos[c.id] = {"id": c.id, "codigo": c.code or "", "nombre": c.name, "tipo": c.account_type, "grupo": grupo,
                           "naturaleza": "acreedora" if grupo in ACREEDORAS + ("cambio_ganancia",) else "deudora"}
        return datos

    def _lineas(self, destino, cuentas):
        Linea = request.env["account.move.line"]
        try:
            apuntes = Linea.search([("parent_state", "=", "posted"), ("display_type", "not in", ("line_section", "line_note"))],
                                   order="date desc, id desc", limit=LIMITE_LINEAS)
        except AccessError:
            return []
        empresa_moneda = request.env.company.currency_id
        salida = []
        for a in reversed(apuntes):
            cta = cuentas.get(a.account_id.id)
            if not cta:
                continue
            d = self._convertir(a.debit, empresa_moneda, destino, a.date)
            c = self._convertir(a.credit, empresa_moneda, destino, a.date)
            salida.append({
                "id": a.id, "asiento": a.move_name or a.move_id.name or "", "diario": a.journal_id.name or "",
                "fecha": texto_fecha(a.date), "anio": a.date.year, "mes": a.date.month - 1, "dia": a.date.day,
                "codigo": cta["codigo"], "cuenta": cta["nombre"], "grupo": cta["grupo"], "naturaleza": cta["naturaleza"],
                "desc": a.name or a.move_id.ref or a.move_id.name or "", "debito": round(d, 2), "credito": round(c, 2),
            })
        return salida

    def _facturas(self, proveedor, destino):
        Move = request.env["account.move"]
        tipo = "in_invoice" if proveedor else "out_invoice"
        try:
            moves = Move.search([("move_type", "=", tipo), ("state", "=", "posted")], order="invoice_date_due desc, id desc", limit=500)
        except AccessError:
            return []
        salida = []
        for m in moves:
            total = self._convertir(m.amount_total, m.currency_id, destino, m.invoice_date)
            ratio = (m.amount_residual / m.amount_total) if m.amount_total else 0
            venc = m.invoice_date_due or m.invoice_date or m.date
            salida.append({
                "id": m.id, "tercero": m.partner_id.name or "", "rif": m.partner_id.vat or "", "factura": m.name or m.ref or "",
                "emision": texto_fecha(m.invoice_date or m.date), "venc": [venc.year, venc.month - 1, venc.day],
                "total": round(total, 2), "abonado": round(total * (1 - ratio), 2),
            })
        return salida

    def _asientos(self, destino, cuentas):
        Move = request.env["account.move"]
        try:
            moves = Move.search([("state", "in", ("draft", "posted"))], order="date desc, id desc", limit=150)
        except AccessError:
            return []
        empresa_moneda = request.env.company.currency_id
        salida = []
        for m in moves:
            lineas = []
            for l in m.line_ids.filtered(lambda x: x.display_type not in ("line_section", "line_note")):
                cta = cuentas.get(l.account_id.id) or {"codigo": l.account_id.code or "", "nombre": l.account_id.name}
                lineas.append({"codigo": cta["codigo"], "cuenta": cta["nombre"], "glosa": l.name or "",
                               "debito": round(self._convertir(l.debit, empresa_moneda, destino, m.date), 2),
                               "credito": round(self._convertir(l.credit, empresa_moneda, destino, m.date), 2)})
            posted = m.state == "posted"
            salida.append({"id": m.id, "num": m.name if posted and m.name else "Borrador", "fecha": texto_fecha(m.date), "diario": m.journal_id.name or "",
                           "concepto": m.ref or m.narration and str(m.narration) or m.partner_id.name or m.name or "",
                           "estado": "Asentado" if posted else "Borrador", "lineas": lineas})
        return salida

    @http.route("/nodus/api/contabilidad/datos", type="http", auth="user", methods=["GET"], csrf=False)
    def datos(self, **kw):
        env = request.env
        destino, simbolo = self._moneda(kw.get("moneda") or "usd")
        cuentas = self._cuentas()
        diarios = env["account.journal"].search([("type", "in", ("sale", "purchase", "bank", "cash", "general"))])
        hoy = fields.Date.context_today(env["res.partner"])
        return responder({
            "moneda": "usd" if simbolo == "$" else "bs", "simbolo": simbolo, "hoy": [hoy.year, hoy.month - 1, hoy.day],
            "lineas": self._lineas(destino, cuentas), "cxc": self._facturas(False, destino), "cxp": self._facturas(True, destino),
            "asientos": self._asientos(destino, cuentas),
            "cuentas": [{"codigo": c["codigo"], "nombre": c["nombre"], "grupo": c["grupo"]} for c in cuentas.values()],
            "cuentasGasto": [{"codigo": c["codigo"], "nombre": c["nombre"]} for c in cuentas.values() if c["grupo"] in ("gasto", "costo")],
            "diarios": [{"id": j.id, "nombre": j.name, "tipo": j.type} for j in diarios],
        })

    # ------------------------------------------------------------------ asientos
    def _cuenta_por_codigo(self, codigo):
        cuenta = request.env["account.account"].search([("code", "=", str(codigo).strip())], limit=1)
        if not cuenta:
            raise UserError(f"No existe la cuenta {codigo}.")
        return cuenta

    @http.route("/nodus/api/contabilidad/asientos", type="http", auth="user", methods=["POST"], csrf=False)
    def crear_asiento(self, **kw):
        env, d = request.env, cuerpo()
        destino, _ = self._moneda(d.get("moneda") or "usd")
        lineas = [l for l in d.get("lineas") or [] if (float(l.get("debito") or 0) or float(l.get("credito") or 0))]
        if len(lineas) < 2:
            return responder({"error": "Un asiento necesita al menos dos líneas con monto."}, 400)
        total_d = round(sum(float(l.get("debito") or 0) for l in lineas), 2)
        total_c = round(sum(float(l.get("credito") or 0) for l in lineas), 2)
        if d.get("asentar") and abs(total_d - total_c) > 0.005:
            return responder({"error": "Para asentar, los débitos deben ser iguales a los créditos."}, 400)
        try:
            with env.cr.savepoint():
                diario = env["account.journal"].browse(int(d.get("diarioId") or 0)).exists() or \
                    env["account.journal"].search([("type", "=", "general")], limit=1)
                vals = {"move_type": "entry", "journal_id": diario.id, "date": d.get("fecha") or fields.Date.context_today(env["res.partner"]),
                        "ref": (d.get("referencia") or d.get("concepto") or "").strip() or False, "line_ids": []}
                en_usd = destino != env.company.currency_id
                if en_usd:
                    vals["currency_id"] = destino.id
                for l in lineas:
                    monto = float(l.get("debito") or 0) - float(l.get("credito") or 0)
                    linea = {"account_id": self._cuenta_por_codigo(l.get("codigo")).id, "name": (l.get("glosa") or d.get("concepto") or "/").strip()}
                    if en_usd:
                        linea.update({"currency_id": destino.id, "amount_currency": monto})
                    else:
                        linea.update({"debit": max(monto, 0), "credit": max(-monto, 0)})
                    vals["line_ids"].append((0, 0, linea))
                asiento = env["account.move"].create(vals)
                if d.get("asentar"):
                    asiento.action_post()
        except (UserError, ValidationError) as e:
            return responder({"error": e.args[0] if e.args else "No se pudo registrar el asiento."}, 400)
        return responder({"id": asiento.id})

    @http.route("/nodus/api/contabilidad/asientos/<int:mid>/asentar", type="http", auth="user", methods=["POST"], csrf=False)
    def asentar(self, mid, **kw):
        move = request.env["account.move"].browse(mid).exists()
        if not move:
            return responder({"error": "Asiento no encontrado."}, 404)
        try:
            with request.env.cr.savepoint():
                move.action_post()
        except (UserError, ValidationError) as e:
            return responder({"error": e.args[0] if e.args else "No se pudo asentar."}, 400)
        return responder({"id": move.id})

    # ------------------------------------------------------------------ cobros y pagos
    def _registrar_pago(self, factura, monto_destino, destino, diario, fecha, referencia, liquidar=False):
        """Registra el pago de una factura con el asistente de Odoo. `monto_destino` viene en la
        moneda que ve el usuario y se convierte a la moneda de la factura; si `liquidar`, paga
        exactamente lo que falta (evita diferencias de redondeo al convertir)."""
        if liquidar:
            monto = factura.amount_residual
        else:
            monto = round(self._convertir(float(monto_destino), destino, factura.currency_id, fecha), 2)
            monto = min(monto, factura.amount_residual)
        if monto <= 0:
            raise UserError("El monto debe ser mayor que cero.")
        asistente = request.env["account.payment.register"].with_context(
            active_model="account.move", active_ids=factura.ids).create({
                "amount": monto, "journal_id": diario.id, "payment_date": fecha, "communication": referencia or factura.name})
        return asistente._create_payments()

    @http.route("/nodus/api/contabilidad/pagar", type="http", auth="user", methods=["POST"], csrf=False)
    def pagar(self, **kw):
        env, d = request.env, cuerpo()
        destino, _ = self._moneda(d.get("moneda") or "usd")
        factura = env["account.move"].browse(int(d.get("facturaId") or 0)).exists()
        diario = env["account.journal"].browse(int(d.get("diarioId") or 0)).exists()
        if not factura or not diario:
            return responder({"error": "Elige la factura y la cuenta de banco o caja."}, 400)
        try:
            with env.cr.savepoint():
                self._registrar_pago(factura, d.get("monto"), destino, diario, d.get("fecha") or fields.Date.context_today(env["res.partner"]), d.get("referencia"), bool(d.get("liquidar")))
        except (UserError, ValidationError) as e:
            return responder({"error": e.args[0] if e.args else "No se pudo registrar el pago."}, 400)
        return responder({"ok": True})

    @http.route("/nodus/api/contabilidad/gasto", type="http", auth="user", methods=["POST"], csrf=False)
    def gasto(self, **kw):
        """Registra un gasto como factura de proveedor con una línea; si se pagó, también el pago."""
        env, d = request.env, cuerpo()
        destino, _ = self._moneda(d.get("moneda") or "usd")
        monto = float(d.get("monto") or 0)
        if monto <= 0 or not (d.get("concepto") or "").strip():
            return responder({"error": "Escribe el concepto y el monto del gasto."}, 400)
        try:
            with env.cr.savepoint():
                socio = env["res.partner"]
                if str(d.get("proveedorId") or "").isdigit():
                    socio = socio.browse(int(d["proveedorId"])).exists()
                if not socio and (d.get("proveedorNombre") or "").strip():
                    socio = socio.search([("name", "=ilike", d["proveedorNombre"].strip())], limit=1)
                if not socio and (d.get("proveedorNombre") or "").strip():
                    # sudo: el negocio crea el proveedor desde el gasto sin necesitar permisos de Contactos
                    socio = socio.sudo().create({"name": d["proveedorNombre"].strip(), "supplier_rank": 1}).sudo(False)
                if not socio:
                    return responder({"error": "Indica el proveedor."}, 400)
                fecha = d.get("fecha") or fields.Date.context_today(env["res.partner"])
                vals = {"move_type": "in_invoice", "partner_id": socio.id, "invoice_date": fecha, "date": fecha,
                        "ref": (d.get("referencia") or "").strip() or False,
                        "invoice_line_ids": [(0, 0, {"name": d["concepto"].strip(), "quantity": 1, "price_unit": monto,
                                                     "account_id": self._cuenta_por_codigo(d.get("cuentaGasto")).id if d.get("cuentaGasto") else False})]}
                if destino != env.company.currency_id:
                    vals["currency_id"] = destino.id
                if not vals["invoice_line_ids"][0][2]["account_id"]:
                    del vals["invoice_line_ids"][0][2]["account_id"]
                factura = env["account.move"].create(vals)
                factura.action_post()
                if d.get("pagado"):
                    diario = env["account.journal"].browse(int(d.get("diarioId") or 0)).exists()
                    if not diario:
                        return responder({"error": "Elige la cuenta de banco o caja con la que pagaste."}, 400)
                    self._registrar_pago(factura, monto, destino, diario, fecha, d.get("referencia"), True)
        except (UserError, ValidationError) as e:
            return responder({"error": e.args[0] if e.args else "No se pudo registrar el gasto."}, 400)
        return responder({"ok": True, "factura": factura.name})
