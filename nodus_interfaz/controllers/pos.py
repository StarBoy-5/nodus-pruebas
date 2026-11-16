# Copyright 2026 Hadeon
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
"""API de la pantalla Punto de Venta de hadeon_ui, sobre el Punto de Venta de Odoo.

Mismas rutas y mismo sobre {"ok": true, "data": ...} que usa el JavaScript de la pantalla
(bajo /nodus/api/v1). El motor de Odoo sigue haciendo lo difícil: sesiones de caja, pedidos,
pagos, impuestos, factura, inventario y, si está instalado, la impresora fiscal.

- Catálogo: productos "disponible en PdV"; el precio se muestra en dólares y sin IVA
  (el IVA de cada producto viaja aparte para calcular el total igual que Odoo).
- Cajas: cada punto de venta de Odoo; abrir y cerrar caja con efectivo contado.
- Mesas: las de Configuración; se "bloquean" al generar la comanda y se liberan al cobrar.
- Orden: crea el pedido, cobra, descuenta inventario y factura si el cliente tiene RIF.
"""
import json
import logging
import time
import zlib

from odoo import Command, fields, http
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.http import request

_logger = logging.getLogger(__name__)

PREFIJO = "nodus.cfg."
BLOQUEO_SEGUNDOS = 4 * 3600
TIPOS_DOC = ("V", "E", "J", "G", "P")


def cuerpo():
    return json.loads(request.httprequest.data or b"{}")


def ok(datos=None):
    return request.make_json_response({"ok": True, "data": datos if datos is not None else {}})


def fallo(codigo, mensaje, estado=400):
    return request.make_json_response({"ok": False, "error": {"code": codigo, "message": mensaje}}, status=estado)


def mensaje_de(e, por_defecto):
    return e.args[0] if e.args and isinstance(e.args[0], str) else por_defecto


class NodusPosAPI(http.Controller):

    # ------------------------------------------------------------------ utilidades
    def _param(self, clave, defecto=""):
        return request.env["ir.config_parameter"].sudo().get_param(PREFIJO + clave, defecto)

    def _usd(self):
        return request.env.ref("base.USD", raise_if_not_found=False) or request.env.company.currency_id

    def _ves(self):
        return request.env.ref("base.VES", raise_if_not_found=False) or request.env.company.currency_id

    def _hoy(self):
        return fields.Date.context_today(request.env["res.partner"])

    def _a_usd(self, monto, moneda):
        usd = self._usd()
        return monto if moneda == usd else moneda._convert(monto, usd, request.env.company, self._hoy())

    def _de_usd(self, monto, moneda):
        usd = self._usd()
        return monto if moneda == usd else usd._convert(monto, moneda, request.env.company, self._hoy())

    def _tasa(self):
        """Bolívares por dólar (la tasa BCV que tenga cargada la empresa)."""
        return round(self._usd()._convert(1.0, self._ves(), request.env.company, self._hoy()), 4)

    def _cajas(self):
        return request.env["pos.config"].search([("company_id", "=", request.env.company.id)], order="id")

    def _caja(self, caja_id=None):
        cajas = self._cajas()
        caja = cajas.filtered(lambda c: c.id == int(caja_id or 0)) if caja_id else cajas[:1]
        return caja[:1]

    def _sesion_abierta(self, caja):
        sesion = caja.sudo().current_session_id
        return sesion if sesion and sesion.state == "opened" else request.env["pos.session"]

    # ------------------------------------------------------------------ sesión y catálogo
    @http.route("/nodus/api/v1/sesion", type="http", auth="user", methods=["GET"], csrf=False)
    def sesion(self, **kw):
        u = request.env.user
        roles = [r for r in ("admin", "supervisor", "contador", "cajero", "mesero") if u.has_group(f"nodus_interfaz.group_nodus_{r}")]
        return ok({"autenticado": True, "csrf_token": "", "usuario": {"id": u.id, "nombre": u.name, "login": u.login, "roles": roles or ["cajero"]}})

    def _precio_producto(self, producto, caja):
        """(precio sin IVA en USD, fracción de IVA) de una unidad, con la lista de precios de la caja."""
        moneda = caja.currency_id or request.env.company.currency_id
        try:
            precio = caja.pricelist_id._get_product_price(producto, 1.0) if caja.pricelist_id else producto.lst_price
        except Exception:
            precio = producto.lst_price
        impuestos = producto.taxes_id.filtered(lambda t: t.company_id == request.env.company)
        calculo = impuestos.compute_all(precio, currency=moneda, quantity=1.0, product=producto)
        sin_iva, con_iva = calculo["total_excluded"], calculo["total_included"]
        fraccion = (con_iva - sin_iva) / sin_iva if sin_iva else 0.0
        return round(self._a_usd(sin_iva, moneda), 2), round(fraccion, 6)

    @http.route("/nodus/api/v1/catalogo", type="http", auth="user", methods=["GET"], csrf=False)
    def catalogo(self, **kw):
        caja = self._caja(kw.get("caja_id"))
        productos = request.env["product.product"].sudo().search(
            [("available_in_pos", "=", True), ("sale_ok", "=", True),
             "|", ("default_code", "=", False), "&", ("default_code", "not ilike", "POS_SETTLE"), ("default_code", "!=", "NODUS-PROPINA")],
            order="name", limit=600)
        salida, categorias = [], []
        for p in productos:
            precio, iva = self._precio_producto(p, caja)
            categoria = (p.pos_categ_ids[:1].name or "General")
            if categoria not in categorias:
                categorias.append(categoria)
            salida.append({"id": p.id, "nombre": p.display_name, "desc": p.description_sale or "", "precio": precio, "iva": iva,
                           "categoria": categoria, "imagen": f"/web/image/product.product/{p.id}/image_256" if p.image_256 else ""})
        return ok({"productos": salida, "categorias": categorias, "moneda": "USD", "tasa": self._tasa()})

    # ------------------------------------------------------------------ cajas y mesas
    def _estado_caja(self, caja):
        sesion = self._sesion_abierta(caja)
        datos = {"id": caja.id, "nombre": caja.name, "moneda": (caja.currency_id or request.env.company.currency_id).name, "abierta": bool(sesion)}
        if sesion:
            s = sesion.sudo()
            moneda = s.currency_id
            datos["sesion"] = {
                "id": s.id, "nombre": s.name, "inicio": fields.Datetime.to_string(s.start_at) if s.start_at else "",
                "efectivo_inicial": round(self._a_usd(s.cash_register_balance_start, moneda), 2),
                "ordenes": len(s.order_ids.filtered(lambda o: o.state in ("paid", "done", "invoiced"))),
                "ventas": round(self._a_usd(sum(o.amount_total for o in s.order_ids.filtered(lambda o: o.state in ("paid", "done", "invoiced"))), moneda), 2),
                "efectivo_esperado": round(self._a_usd(s.cash_register_balance_end, moneda), 2),
                "controla_efectivo": bool(s.cash_journal_id),
                "pendientes": len(s.get_session_orders().filtered(lambda o: o.state == "draft")),
            }
        return datos

    def _bloqueos(self):
        try:
            datos = json.loads(self._param("mesas_bloqueadas") or "{}")
        except ValueError:
            datos = {}
        ahora = time.time()
        return {k: v for k, v in datos.items() if ahora - v.get("ts", 0) < BLOQUEO_SEGUNDOS}

    def _guardar_bloqueos(self, datos):
        request.env["ir.config_parameter"].sudo().set_param(PREFIJO + "mesas_bloqueadas", json.dumps(datos))

    def _solo_mesero(self):
        u = request.env.user
        return u.has_group("nodus_interfaz.group_nodus_mesero") and not u.has_group("nodus_interfaz.group_nodus_cajero") and not u._is_admin()

    def _sin_permiso_mesero(self):
        if self._solo_mesero():
            return fallo("SIN_PERMISO", "Eso lo hace la caja.", 403)
        return None

    def _hay_caja_abierta(self):
        return any(self._sesion_abierta(c) for c in self._cajas())

    def _lista_mesas(self):
        try:
            lista = json.loads(self._param("mesas") or "null")
        except ValueError:
            lista = None
        if not isinstance(lista, list):
            lista = [{"id": "mesa-1", "nombre": "Mesa 1"}, {"id": "mesa-2", "nombre": "Mesa 2"}, {"id": "mesa-3", "nombre": "Mesa 3"}]
        return lista

    def _cuenta_abierta(self, mesa):
        return request.env["nodus.cuenta"].sudo().search(
            [("company_id", "=", request.env.company.id), ("mesa", "=", str(mesa)), ("state", "=", "abierta")], limit=1)

    def _total_cuenta(self, cuenta):
        caja = self._caja()
        total = 0.0
        for l in cuenta.line_ids.filtered(lambda x: x.qty > 0):
            precio, iva = self._precio_producto(l.producto_id, caja)
            total += precio * l.qty * (1 + iva)
        propina = total * (cuenta.propina_pct or 0) / 100.0
        return round(total + propina, 2)

    @http.route("/nodus/api/v1/mesas", type="http", auth="user", methods=["GET"], csrf=False)
    def mesas(self, **kw):
        solo_mesero = self._solo_mesero()
        abiertas = {c.mesa: c for c in request.env["nodus.cuenta"].sudo().search(
            [("company_id", "=", request.env.company.id), ("state", "=", "abierta")])}
        mesas = []
        for m in self._lista_mesas():
            c = abiertas.get(str(m["id"]))
            if c and c.line_ids.filtered(lambda x: x.qty > 0):
                total = self._total_cuenta(c)
                quien = (c.mesero_id.name or "").split(" ")[0]
                estado = f"Ocupada · ${total:.2f}" + (f" · {quien}" if quien else "")
            else:
                estado = "Disponible"
            mesas.append({"id": m["id"], "nombre": m["nombre"], "estado": estado, "ocupada": bool(c and c.line_ids.filtered(lambda x: x.qty > 0)), "puestos": m.get("puestos", 4)})
        cajas = [] if solo_mesero else [self._estado_caja(c) for c in self._cajas()]
        abierta = next((c for c in cajas if c["abierta"]), None)
        actual = (abierta or (cajas[0] if cajas else {})).get("id")
        return ok({"mesas": mesas, "cajas": cajas, "caja_actual": actual, "rol": "mesero" if solo_mesero else "caja",
                   "caja_abierta": self._hay_caja_abierta()})

    @http.route("/nodus/api/v1/cuentas/<string:mid>", type="http", auth="user", methods=["GET"], csrf=False)
    def cuenta_leer(self, mid, **kw):
        c = self._cuenta_abierta(mid)
        lineas = c.line_ids.filtered(lambda l: l.qty > 0)
        return ok({"lineas": [{"producto_id": l.producto_id.id, "cantidad": l.qty, "enviado": l.enviado} for l in lineas],
                   "propina_pct": c.propina_pct if c else 0, "nota": (c.nota or "") if c else ""})

    @http.route("/nodus/api/v1/cuentas/<string:mid>", type="http", auth="user", methods=["POST"], csrf=False)
    def cuenta_guardar(self, mid, **kw):
        """Guarda la cuenta de la mesa. Con enviar=True manda a cocina lo nuevo y avisa lo cancelado;
        lo que ya salió a cocina se recuerda para no repetirlo."""
        env, d = request.env, cuerpo()
        if self._solo_mesero() and not self._hay_caja_abierta():
            return fallo("CAJA_CERRADA", "Para trabajar, primero hay que abrir la caja.", 409)
        # una sola petición a la vez por mesa y empresa
        env.cr.execute("SELECT pg_advisory_xact_lock(%s)", (zlib.crc32(f"{env.company.id}:{mid}".encode()) & 0x7FFFFFFF,))
        mesa = next((m for m in self._lista_mesas() if str(m["id"]) == str(mid)), None)
        if not mesa:
            return fallo("NO_ENCONTRADO", "Esa mesa no existe.", 404)
        pedidas = {}
        for l in d.get("lineas") or []:
            try:
                q = float(l.get("cantidad") or 0)
            except (TypeError, ValueError):
                continue
            if q > 0:
                pedidas[int(l["producto_id"])] = pedidas.get(int(l["producto_id"]), 0) + q
        cuenta = self._cuenta_abierta(mid)
        from .comandas import NodusComandasAPI
        comandas_api = NodusComandasAPI()
        if not pedidas:
            # Se quitó todo: si ya había salido algo a cocina, se le avisa y la cuenta se cancela
            if cuenta:
                sacados = [(l.producto_id, l.enviado) for l in cuenta.line_ids if l.enviado > 0.0001]
                if sacados:
                    comandas_api._avisar_cancelacion(mesa["nombre"], d.get("caja_id"), sacados)
                cuenta.state = "cancelada"
            return ok({"emitidas": [], "canceladas": 0})
        propina = max(0.0, float(d.get("propina_pct") or 0))
        if not cuenta:
            cuenta = env["nodus.cuenta"].sudo().create({"mesa": str(mid), "mesa_nombre": mesa["nombre"], "mesero_id": env.uid})
        actuales = {l.producto_id.id: l for l in cuenta.line_ids}
        nuevas_lineas = []
        for pid, q in pedidas.items():
            if pid in actuales:
                actuales[pid].qty = q          # "enviado" no se toca hasta mandar la comanda
            else:
                nuevas_lineas.append({"cuenta_id": cuenta.id, "producto_id": pid, "qty": q})
        for pid, l in actuales.items():
            if pid not in pedidas:
                if l.enviado > 0.0001:
                    l.qty = 0                  # queda pendiente de avisar a cocina
                else:
                    l.unlink()
        if nuevas_lineas:
            env["nodus.cuenta.line"].sudo().create(nuevas_lineas)
        cuenta.write({"propina_pct": propina, "nota": (d.get("nota") or "").strip() or False})
        emitidas, canceladas = [], 0
        if d.get("enviar"):
            nuevas, cancelar = [], []
            for l in cuenta.line_ids:
                diff = l.qty - l.enviado
                if diff > 0.0001:
                    nuevas.append({"producto_id": l.producto_id.id, "cantidad": diff})
                elif diff < -0.0001:
                    cancelar.append((l.producto_id, -diff))
            try:
                if nuevas:
                    emitidas = comandas_api._emitir(mesa["nombre"], d.get("caja_id"), nuevas, d.get("nota"))
                if cancelar:
                    comandas_api._avisar_cancelacion(mesa["nombre"], d.get("caja_id"), cancelar)
                    canceladas = len(cancelar)
            except (UserError, ValidationError, AccessError) as e:
                return fallo("NO_ENVIADA", mensaje_de(e, "No se pudo enviar la comanda."))
            for l in cuenta.line_ids:
                if l.qty <= 0.0001:
                    l.unlink()
                else:
                    l.enviado = l.qty
        return ok({"emitidas": emitidas, "canceladas": canceladas})

    @http.route("/nodus/api/v1/mesas/<string:mid>/bloquear", type="http", auth="user", methods=["POST"], csrf=False)
    def mesa_bloquear(self, mid, **kw):
        bloqueos = self._bloqueos()
        actual = bloqueos.get(mid)
        if actual and actual.get("uid") != request.env.uid:
            return fallo("MESA_OCUPADA", "Esa mesa la está atendiendo otra persona.", 409)
        bloqueos[mid] = {"uid": request.env.uid, "ts": time.time()}
        self._guardar_bloqueos(bloqueos)
        return ok({"mesa_id": mid, "bloqueada": True})

    @http.route("/nodus/api/v1/caja", type="http", auth="user", methods=["GET"], csrf=False)
    def caja_estado(self, **kw):
        caja = self._caja(kw.get("caja_id"))
        if not caja:
            return fallo("NO_ENCONTRADO", "Caja no encontrada.", 404)
        return ok(self._estado_caja(caja))

    @http.route("/nodus/api/v1/caja/abrir", type="http", auth="user", methods=["POST"], csrf=False)
    def caja_abrir(self, **kw):
        if (error := self._sin_permiso_mesero()):
            return error
        d = cuerpo()
        caja = self._caja(d.get("caja_id"))
        if not caja:
            return fallo("NO_ENCONTRADO", "Caja no encontrada.", 404)
        if self._sesion_abierta(caja):
            return fallo("CAJA_ABIERTA", "Esa caja ya está abierta.")
        try:
            efectivo = self._de_usd(float(d.get("efectivo_inicial") or 0), caja.currency_id or request.env.company.currency_id)
        except (TypeError, ValueError):
            return fallo("DATOS_INVALIDOS", "El efectivo inicial no es un número.")
        try:
            with request.env.cr.savepoint():
                caja_s = caja.sudo()
                if not caja_s.current_session_id:
                    aviso = caja_s._check_before_creating_new_session()
                    if aviso:
                        return fallo("NO_SE_PUEDE_ABRIR", "La caja no está lista para abrirse. Pide ayuda a soporte.")
                    sesion = request.env["pos.session"].sudo().create({"user_id": request.env.uid, "config_id": caja.id})
                else:
                    sesion = caja_s.current_session_id
                sesion.set_opening_control(efectivo, (d.get("notas") or "").strip())
        except (UserError, ValidationError, AccessError) as e:
            return fallo("NO_SE_PUEDE_ABRIR", mensaje_de(e, "No se pudo abrir la caja."))
        return ok(self._estado_caja(caja))

    @http.route("/nodus/api/v1/caja/cerrar", type="http", auth="user", methods=["POST"], csrf=False)
    def caja_cerrar(self, **kw):
        if (error := self._sin_permiso_mesero()):
            return error
        d = cuerpo()
        caja = self._caja(d.get("caja_id"))
        sesion = self._sesion_abierta(caja) if caja else None
        if not sesion:
            return fallo("CAJA_CERRADA", "Esa caja no está abierta.")
        sesion = sesion.sudo()
        pendientes = len(sesion.get_session_orders().filtered(lambda o: o.state == "draft"))
        if pendientes:
            return fallo("PEDIDOS_PENDIENTES", f"Hay {pendientes} pedido(s) sin cobrar en esta caja. Hay que cobrarlos o cancelarlos antes de cerrarla.")
        try:
            with request.env.cr.savepoint():
                if sesion.cash_journal_id:
                    contado = self._de_usd(float(d.get("efectivo_contado") if d.get("efectivo_contado") not in (None, "") else self._a_usd(sesion.cash_register_balance_end, sesion.currency_id)), sesion.currency_id)
                    resultado = sesion.post_closing_cash_details(contado)
                    if not resultado.get("successful"):
                        return fallo("NO_SE_PUEDE_CERRAR", resultado.get("message") or "No se pudo cerrar la caja.")
                sesion.update_closing_control_state_session((d.get("notas") or "").strip())
                resultado = sesion.close_session_from_ui()
                if not resultado.get("successful"):
                    return fallo("NO_SE_PUEDE_CERRAR", resultado.get("message") or "Hay pedidos sin cobrar o diferencias por revisar.")
        except (UserError, ValidationError, AccessError, ValueError) as e:
            return fallo("NO_SE_PUEDE_CERRAR", mensaje_de(e, "No se pudo cerrar la caja."))
        return ok(self._estado_caja(caja))

    # ------------------------------------------------------------------ métodos de pago y clientes
    @http.route("/nodus/api/v1/metodos-pago", type="http", auth="user", methods=["GET"], csrf=False)
    def metodos_pago(self, **kw):
        caja = self._caja(kw.get("caja_id"))
        salida = []
        for m in caja.payment_method_ids if caja else []:
            moneda = (m.hadeon_currency_id if "hadeon_currency_id" in m._fields and m.hadeon_currency_id else False)                 or m.journal_id.currency_id or caja.currency_id or request.env.company.currency_id
            salida.append({"id": m.id, "nombre": m.name, "efectivo": bool(m.is_cash_count), "moneda": moneda.name,
                           "sin_conexion": "si" if m.is_cash_count else "no"})
        return ok(salida)

    def _buscar_cliente(self, tipo, numero):
        digitos = "".join(c for c in str(numero or "") if c.isdigit())
        if not digitos:
            return request.env["res.partner"]
        Partner = request.env["res.partner"]
        candidatos = [f"{tipo}-{digitos}", f"{tipo}{digitos}", digitos] if tipo else [digitos]
        for vat in candidatos:
            partner = Partner.search([("vat", "=ilike", vat)], limit=1)
            if partner:
                return partner
        return Partner.search([("vat", "=ilike", f"%{digitos}")], limit=1)

    @http.route("/nodus/api/v1/clientes", type="http", auth="user", methods=["GET"], csrf=False)
    def cliente(self, **kw):
        tipo = (kw.get("tipo") or "").upper()
        partner = self._buscar_cliente(tipo, kw.get("numero"))
        if not partner:
            return fallo("NO_ENCONTRADO", "Cliente no registrado.", 404)
        return ok({"id": partner.id, "nombre": partner.name or "", "telefono": partner.phone or "", "tipoDoc": tipo,
                   "numero": "".join(c for c in (partner.vat or "") if c.isdigit())})

    # ------------------------------------------------------------------ orden
    def _producto_propina(self, caja):
        if "tip_product_id" in caja._fields and caja.tip_product_id:
            return caja.tip_product_id
        Producto = request.env["product.product"].sudo()
        propina = Producto.search([("default_code", "=", "NODUS-PROPINA")], limit=1)
        if not propina:
            propina = Producto.create({"name": "Propina", "default_code": "NODUS-PROPINA", "type": "service", "list_price": 0.0,
                                       "sale_ok": True, "available_in_pos": True, "taxes_id": [Command.clear()]})
        return propina

    def _cliente_de_orden(self, datos):
        tipo = (datos.get("tipoDoc") or "V").upper()
        numero = "".join(c for c in str(datos.get("numero") or "") if c.isdigit())
        nombre = (datos.get("nombre") or "").strip()
        if not numero:
            return request.env["res.partner"]
        partner = self._buscar_cliente(tipo, numero)
        if partner:
            return partner
        if not nombre:
            return request.env["res.partner"]
        # sudo: el cajero registra al cliente nuevo sin necesitar permisos de Contactos
        vat = f"{tipo}-{numero}" if tipo in TIPOS_DOC else numero
        return request.env["res.partner"].sudo().create({"name": nombre, "vat": vat, "phone": datos.get("telefono") or False, "customer_rank": 1})

    @http.route("/nodus/api/v1/ordenes", type="http", auth="user", methods=["POST"], csrf=False)
    def orden(self, **kw):
        if (error := self._sin_permiso_mesero()):
            return error
        env, d = request.env, cuerpo()
        caja = self._caja(d.get("caja_id"))
        if not caja:
            return fallo("NO_ENCONTRADO", "Caja no encontrada.", 404)
        lineas = [l for l in d.get("lineas") or [] if float(l.get("cantidad") or 0) > 0]
        if not lineas:
            return fallo("CARRITO_VACIO", "El carrito está vacío.")
        pagos = d.get("pagos") or []
        if not pagos:
            return fallo("METODO_PAGO_INVALIDO", "Falta el método de pago.")
        sesion = self._sesion_abierta(caja)
        if not sesion:
            return fallo("CAJA_CERRADA", "La caja está cerrada. Ábrela para empezar a vender.")
        metodos = []
        for pago in pagos:
            m = caja.payment_method_ids.filtered(lambda x: x.id == int(pago.get("metodo_id") or 0))[:1]
            if not m:
                return fallo("METODO_PAGO_INVALIDO", "Ese método de pago no está disponible en esta caja.")
            metodos.append(m)
        metodo = metodos[0]
        moneda = sesion.currency_id
        descuento = max(0.0, min(100.0, float(d.get("descuento_pct") or 0)))
        propina_pct = max(0.0, float(d.get("propina_pct") or 0))
        try:
            with env.cr.savepoint():
                partner = self._cliente_de_orden(d.get("cliente") or {})
                productos = env["product.product"].browse([int(l["producto_id"]) for l in lineas]).exists()
                vals_lineas, base, total_con_iva = [], 0.0, 0.0
                for l in lineas:
                    p = productos.filtered(lambda x: x.id == int(l["producto_id"]))
                    if not p:
                        return fallo("PRODUCTO_INVALIDO", "Un producto del carrito ya no existe.")
                    qty = float(l["cantidad"])
                    precio = caja.pricelist_id._get_product_price(p, qty) if caja.pricelist_id else p.lst_price
                    impuestos = p.taxes_id.filtered(lambda t: t.company_id == env.company)
                    c = impuestos.compute_all(precio * (1 - descuento / 100.0), currency=moneda, quantity=qty, product=p, partner=partner or None)
                    base += c["total_excluded"]
                    total_con_iva += c["total_included"]
                    vals_lineas.append(Command.create({
                        "product_id": p.id, "qty": qty, "price_unit": precio, "discount": descuento, "tax_ids": [Command.set(impuestos.ids)],
                        "price_subtotal": c["total_excluded"], "price_subtotal_incl": c["total_included"], "full_product_name": p.display_name,
                        "name": p.display_name}))
                propina = round(base * propina_pct / 100.0, moneda.decimal_places) if propina_pct else 0.0
                if propina:
                    prod_propina = self._producto_propina(caja)
                    vals_lineas.append(Command.create({
                        "product_id": prod_propina.id, "qty": 1, "price_unit": propina, "price_subtotal": propina,
                        "price_subtotal_incl": propina, "tax_ids": [Command.clear()], "full_product_name": "Propina", "name": "Propina"}))
                total = round(total_con_iva + propina, moneda.decimal_places)
                referencia, seguimiento = caja.sudo()._get_next_order_refs()
                pedido = env["pos.order"].sudo().create({
                    "session_id": sesion.id, "company_id": env.company.id, "partner_id": partner.id or False, "user_id": env.uid,
                    "pricelist_id": caja.pricelist_id.id or False, "amount_tax": round(total_con_iva - base, moneda.decimal_places),
                    "amount_total": total, "amount_paid": 0.0, "amount_return": 0.0, "date_order": fields.Datetime.now(),
                    "pos_reference": referencia, "tracking_number": seguimiento, "lines": vals_lineas,
                    "general_customer_note": (d.get("nota") or "").strip() or False})
                # Montos de cada pago (en dólares) llevados a la moneda de la caja. Con un solo pago se cobra
                # el total exacto; con varios, deben sumar el total y el último absorbe el redondeo.
                if len(pagos) == 1:
                    montos = [total]
                else:
                    montos = [round(self._de_usd(float(p_.get("monto") or 0), moneda), moneda.decimal_places) for p_ in pagos]
                    if any(m_ <= 0 for m_ in montos):
                        return fallo("PAGO_INVALIDO", "Cada pago debe tener un monto mayor que cero.")
                    margen = self._de_usd(0.05, moneda)
                    if abs(sum(montos) - total) > margen:
                        return fallo("PAGOS_NO_SUMAN", "Los pagos no suman el total de la orden.")
                    montos[-1] = round(total - sum(montos[:-1]), moneda.decimal_places)
                for pago, metodo_p, monto_p in zip(pagos, metodos, montos):
                    datos_pago = {"pos_order_id": pedido.id, "amount": monto_p, "payment_method_id": metodo_p.id,
                                  "name": (pago.get("referencia") or "").strip() or False}
                    # Doble moneda (hadeon_pos_dual_currency): un pago en divisa lleva la tasa BCV con la que se cobra
                    moneda_metodo = metodo_p.hadeon_currency_id if "hadeon_currency_id" in metodo_p._fields else False
                    if moneda_metodo and moneda_metodo != env.company.currency_id:
                        tasa_vigente = moneda_metodo._hadeon_operative_rates(env.company)[0]
                        if not tasa_vigente:
                            return fallo("SIN_TASA", f"No hay tasa del día para cobrar en {moneda_metodo.name}. Pide a soporte que la cargue.")
                        datos_pago["hadeon_rate"] = tasa_vigente
                    pedido.add_payment(datos_pago)
                pedido.action_pos_order_paid()
                try:
                    with env.cr.savepoint():
                        pedido._create_order_picking()
                except Exception:
                    _logger.warning("No se pudo crear la salida de inventario del pedido %s", pedido.name, exc_info=True)
                factura = env["account.move"]
                if partner and partner.vat:
                    try:
                        with env.cr.savepoint():
                            pedido.write({"to_invoice": True})
                            # sin generar el PDF ni enviarlo: el ticket es el de la pantalla
                            pedido.with_context(generate_pdf=False)._generate_pos_order_invoice()
                            factura = pedido.account_move
                    except Exception:
                        _logger.warning("No se pudo facturar el pedido %s", pedido.name, exc_info=True)
        except (UserError, ValidationError, AccessError) as e:
            return fallo("ORDEN_NO_REGISTRADA", mensaje_de(e, "No se pudo registrar la orden."))

        mesa = d.get("mesa_id")
        if mesa:
            cuenta_mesa = self._cuenta_abierta(mesa)
            if cuenta_mesa:
                cuenta_mesa.state = "cobrada"
            bloqueos = self._bloqueos()
            if bloqueos.pop(str(mesa), None) is not None:
                self._guardar_bloqueos(bloqueos)
        empresa = env.company
        tasa = self._tasa()
        total_usd = round(self._a_usd(total, moneda), 2)
        base_usd = round(self._a_usd(base, moneda), 2)
        return ok({
            "id": pedido.id,
            "factura": {"numero": factura.name or pedido.pos_reference or pedido.name, "control": None, "fecha": fields.Datetime.to_string(pedido.date_order)},
            "cliente": {"nombre": partner.name or (d.get("cliente") or {}).get("nombre", ""), "rif": partner.vat or ""},
            "totales": {"subtotal": base_usd, "baseImponible": base_usd, "iva": round(self._a_usd(total_con_iva - base, moneda), 2),
                        "propina": round(self._a_usd(propina, moneda), 2), "total": total_usd, "total_bs": round(total_usd * tasa, 2)},
            "tasa": tasa, "moneda": "USD", "estado": pedido.state, "vuelto": 0,
            "empresa": {"nombre": empresa.name or "", "rif": empresa.vat or "", "direccion": ", ".join(x for x in (empresa.street, empresa.city) if x),
                        "telefono": empresa.phone or "", "logo_url": f"/web/image/res.company/{empresa.id}/logo" if empresa.logo else ""},
        })

    # ------------------------------------------------------------------ devoluciones
    @http.route("/nodus/api/v1/ordenes", type="http", auth="user", methods=["GET"], csrf=False)
    def ordenes_buscar(self, **kw):
        if (error := self._sin_permiso_mesero()):
            return error
        """Ventas recientes que se pueden devolver, buscadas por factura, ticket o cliente."""
        env = request.env
        texto = (kw.get("buscar") or "").strip()
        dominio = [("company_id", "=", env.company.id), ("state", "in", ("paid", "done", "invoiced")), ("is_refund", "=", False)]
        if texto:
            dominio += ["|", "|", "|", ("name", "ilike", texto), ("pos_reference", "ilike", texto),
                        ("account_move.name", "ilike", texto), ("partner_id.name", "ilike", texto)]
        salida = []
        for o in env["pos.order"].search(dominio, order="date_order desc, id desc", limit=12):
            moneda = o.currency_id
            lineas = []
            for l in o.lines:
                disponible = l.qty - l.refunded_qty
                if disponible > 0.0001 and l.qty:
                    lineas.append({"id": l.id, "nombre": l.full_product_name or l.product_id.display_name, "disponible": disponible,
                                   "precio": round(self._a_usd(l.price_subtotal_incl / l.qty, moneda), 4)})
            if not lineas:
                continue
            salida.append({"id": o.id, "numero": o.account_move.name or o.pos_reference or o.name,
                           "fecha": fields.Datetime.to_string(o.date_order), "cliente": o.partner_id.name or "Consumidor final",
                           "total": round(self._a_usd(o.amount_total, moneda), 2), "lineas": lineas,
                           "metodos": o.payment_ids.mapped("payment_method_id").ids})
        return ok({"ordenes": salida})

    @http.route("/nodus/api/v1/devoluciones", type="http", auth="user", methods=["POST"], csrf=False)
    def devolucion(self, **kw):
        if (error := self._sin_permiso_mesero()):
            return error
        env, d = request.env, cuerpo()
        original = env["pos.order"].browse(int(d.get("orden_id") or 0)).exists()
        if not original or original.company_id != env.company:
            return fallo("NO_ENCONTRADO", "No se encontró la venta.", 404)
        elegidas = {int(l["linea_id"]): float(l["cantidad"]) for l in d.get("lineas") or [] if float(l.get("cantidad") or 0) > 0}
        if not elegidas:
            return fallo("SIN_PRODUCTOS", "Elige qué productos se devuelven.")
        caja = original.config_id
        sesion = self._sesion_abierta(caja)
        if not sesion:
            return fallo("CAJA_CERRADA", f"Para devolver hay que abrir la caja {caja.name}.")
        metodo = caja.payment_method_ids.filtered(lambda m: m.id == int(d.get("metodo_id") or 0))[:1]
        if not metodo:
            return fallo("METODO_PAGO_INVALIDO", "Elige cómo se devuelve el dinero.")
        disponible = {l.id: l.qty - l.refunded_qty for l in original.lines}
        for lid, cant in elegidas.items():
            if lid not in disponible or cant > disponible[lid] + 0.0001:
                return fallo("CANTIDAD_INVALIDA", "Una cantidad supera lo que se puede devolver.")
        try:
            with env.cr.savepoint():
                reembolso = original.sudo()._refund()[:1]
                for linea in reembolso.lines:
                    origen = linea.refunded_orderline_id
                    cant = elegidas.get(origen.id)
                    if not cant:
                        linea.unlink()
                    else:
                        linea.qty = -cant
                        linea._onchange_amount_line_all()
                reembolso._compute_prices()
                datos_pago = {"pos_order_id": reembolso.id, "amount": reembolso.amount_total, "payment_method_id": metodo.id,
                              "name": (d.get("motivo") or "").strip() or False}
                moneda_metodo = metodo.hadeon_currency_id if "hadeon_currency_id" in metodo._fields else False
                if moneda_metodo and moneda_metodo != env.company.currency_id:
                    tasa_vigente = moneda_metodo._hadeon_operative_rates(env.company)[0]
                    if not tasa_vigente:
                        return fallo("SIN_TASA", f"No hay tasa del día para devolver en {moneda_metodo.name}.")
                    datos_pago["hadeon_rate"] = tasa_vigente
                reembolso.add_payment(datos_pago)
                reembolso.action_pos_order_paid()
                if d.get("motivo"):
                    reembolso.general_customer_note = (d["motivo"] or "").strip()
                try:
                    with env.cr.savepoint():
                        reembolso._create_order_picking()
                except Exception:
                    _logger.warning("No se pudo devolver el inventario de %s", reembolso.name, exc_info=True)
                nota = env["account.move"]
                if original.account_move:
                    try:
                        with env.cr.savepoint():
                            reembolso.write({"to_invoice": True})
                            reembolso.with_context(generate_pdf=False)._generate_pos_order_invoice()
                            nota = reembolso.account_move
                    except Exception:
                        _logger.warning("No se pudo generar la nota de crédito de %s", reembolso.name, exc_info=True)
        except (UserError, ValidationError, AccessError) as e:
            return fallo("DEVOLUCION_NO_REGISTRADA", mensaje_de(e, "No se pudo registrar la devolución."))
        return ok({"numero": nota.name or reembolso.pos_reference or reembolso.name,
                   "total": round(self._a_usd(abs(reembolso.amount_total), reembolso.currency_id), 2),
                   "nota_credito": bool(nota)})
