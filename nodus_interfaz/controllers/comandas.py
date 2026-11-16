# Copyright 2026 Hadeon
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
"""API de la pantalla Comandas de hadeon_ui.

El Punto de Venta crea las comandas (POST /comandas) con los productos que acaba de pedir el
cliente; se reparten por estación según la categoría del producto en el Punto de Venta. La
pantalla las lista en vivo (se refresca cada pocos segundos) y las avanza:
nuevo -> preparando -> listo. "Repicar" la devuelve a nuevo y reinicia el cronómetro.
"""
import json
import unicodedata
from datetime import datetime, timedelta, timezone

from odoo import fields, http
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.http import request

PREFIJO = "nodus.cfg."
ESTACIONES_POR_DEFECTO = [{"id": "cocina", "nombre": "Cocina"}, {"id": "barra", "nombre": "Barra"}, {"id": "parrilla", "nombre": "Parrilla"}]
HORAS_COMPLETADAS = 24


def cuerpo():
    return json.loads(request.httprequest.data or b"{}")


def ok(datos=None):
    return request.make_json_response({"ok": True, "data": datos if datos is not None else {}})


def fallo(codigo, mensaje, estado=400):
    return request.make_json_response({"ok": False, "error": {"code": codigo, "message": mensaje}}, status=estado)


def normalizar(texto):
    sin_acentos = unicodedata.normalize("NFD", texto or "")
    return "".join(c for c in sin_acentos if unicodedata.category(c) != "Mn").lower().strip()


def en_ms(fecha):
    return int(fecha.replace(tzinfo=timezone.utc).timestamp() * 1000) if fecha else 0


class NodusComandasAPI(http.Controller):

    def _estaciones(self):
        crudo = request.env["ir.config_parameter"].sudo().get_param(PREFIJO + "estaciones")
        try:
            lista = json.loads(crudo) if crudo else None
        except ValueError:
            lista = None
        return lista if isinstance(lista, list) and lista else ESTACIONES_POR_DEFECTO

    def _estacion_de(self, producto, estaciones):
        """La estación cuyo nombre coincide con la categoría del producto en el Punto de Venta
        (así se escoge en Inventario); si no coincide, va a la primera (cocina)."""
        for categoria in producto.pos_categ_ids:
            nombre = normalizar(categoria.name)
            for e in estaciones:
                if normalizar(e["nombre"]) == nombre or normalizar(e["id"]) == nombre:
                    return e["id"]
        return estaciones[0]["id"]

    def _a_dict(self, c):
        lineas = []
        for ix, l in enumerate(c.line_ids, start=1):
            nombre = f"{int(l.qty) if float(l.qty).is_integer() else l.qty}× {l.name}" if l.qty != 1 else l.name
            mods = []
            if l.nota:
                tipo = "alergia" if "alerg" in normalizar(l.nota) else "nota"
                mods.append({"t": l.nota.upper() if tipo == "nota" else l.nota, "tipo": tipo})
            lineas.append({"id": l.id, "nombre": nombre, "listo": l.listo, "mods": mods})
        return {"id": c.id, "mesa": c.mesa or "Mostrador", "pedido": c.name, "mesero": c.mesero or "", "estacion": c.estacion,
                "vip": c.vip, "cancelacion": c.cancelacion, "iniciado": en_ms(c.fecha_inicio), "terminado": en_ms(c.fecha_listo), "estado": c.estado, "items": lineas}

    # ------------------------------------------------------------------ lectura
    @http.route("/nodus/api/v1/comandas", type="http", auth="user", methods=["GET"], csrf=False)
    def listar(self, **kw):
        limite = fields.Datetime.now() - timedelta(hours=HORAS_COMPLETADAS)
        Comanda = request.env["nodus.comanda"]
        dominio = [("company_id", "=", request.env.company.id), "|", ("estado", "!=", "listo"), ("fecha_listo", ">=", limite)]
        comandas = Comanda.search(dominio, order="fecha_inicio asc", limit=300)
        return ok({"comandas": [self._a_dict(c) for c in comandas], "ahora": en_ms(datetime.now(timezone.utc).replace(tzinfo=None))})

    # ------------------------------------------------------------------ crear (desde el Punto de Venta)
    @http.route("/nodus/api/v1/comandas", type="http", auth="user", methods=["POST"], csrf=False)
    def crear(self, **kw):
        d = cuerpo()
        lineas = [l for l in d.get("lineas") or [] if float(l.get("cantidad") or 0) > 0]
        if not lineas:
            return fallo("COMANDA_VACIA", "No hay productos nuevos para enviar.")
        try:
            nombres = self._emitir(d.get("servicio"), d.get("caja_id"), lineas, d.get("nota"), d.get("token"))
        except (ValidationError, UserError, AccessError) as e:
            return fallo("NO_ENVIADA", e.args[0] if e.args and isinstance(e.args[0], str) else "No se pudo enviar la comanda.")
        return ok({"comandas": nombres})

    def _emitir(self, servicio, caja_id, lineas, nota_texto, token=None):
        """Crea una comanda por estación con los productos dados; devuelve sus números."""
        env, d = request.env, {"servicio": servicio, "caja_id": caja_id, "nota": nota_texto}
        # Misma petición repetida (doble clic, reintento de red): se devuelve lo ya enviado, no se duplica
        if token:
            previas = env["nodus.comanda"].sudo().search([("token", "=like", f"{token}:%")])
            if previas:
                return [x.name for x in previas]
        productos = env["product.product"].sudo().browse([int(l["producto_id"]) for l in lineas]).exists()
        estaciones = self._estaciones()
        por_estacion = {}
        nota = (d.get("nota") or "").strip()
        for l in lineas:
            p = productos.filtered(lambda x: x.id == int(l["producto_id"]))
            if not p:
                continue
            por_estacion.setdefault(self._estacion_de(p, estaciones), []).append((p, float(l["cantidad"])))
        caja = env["pos.config"].browse(int(d.get("caja_id") or 0)).exists()
        mesero = (env.user.name or "").split(" ")[0]
        creadas = env["nodus.comanda"]
        with env.cr.savepoint():
            for estacion, items in por_estacion.items():
                creadas |= env["nodus.comanda"].sudo().create({
                    "token": f"{token}:{estacion}" if token else False,
                    "estacion": estacion, "mesa": (d.get("servicio") or "").strip() or "Mostrador", "mesero": mesero,
                    "config_id": caja.id or False, "user_id": env.uid,
                    # la nota del pedido viaja en el primer producto de cada estación
                    "line_ids": [(0, 0, {"producto_id": p.id, "name": p.display_name, "qty": q, "nota": nota if i == 0 else False})
                                 for i, (p, q) in enumerate(items)]})
        return [c.name for c in creadas]

    def _avisar_cancelacion(self, servicio, caja_id, items):
        """Avisa a cada estación que se quitaron productos que ya habían salido. items = [(producto, cantidad)]."""
        env = request.env
        estaciones = self._estaciones()
        por_estacion = {}
        for p, q in items:
            por_estacion.setdefault(self._estacion_de(p, estaciones), []).append((p, q))
        mesero = (env.user.name or "").split(" ")[0]
        for estacion, lista in por_estacion.items():
            env["nodus.comanda"].sudo().create({
                "estacion": estacion, "mesa": (servicio or "").strip() or "Mostrador", "mesero": mesero, "cancelacion": True,
                "config_id": int(caja_id) if caja_id else False, "user_id": env.uid,
                "line_ids": [(0, 0, {"producto_id": p.id, "name": f"{int(q) if float(q).is_integer() else q}× {p.display_name}", "qty": 1, "nota": "CANCELADO"})
                             for p, q in lista]})

    # ------------------------------------------------------------------ avanzar
    def _comanda(self, cid):
        return request.env["nodus.comanda"].sudo().search([("id", "=", cid), ("company_id", "=", request.env.company.id)], limit=1)

    def _marcar_lista(self, comanda):
        comanda.line_ids.write({"listo": True})
        comanda.write({"estado": "listo", "fecha_listo": fields.Datetime.now()})

    @http.route("/nodus/api/v1/comandas/<int:cid>/avanzar", type="http", auth="user", methods=["POST"], csrf=False)
    def avanzar(self, cid, **kw):
        c = self._comanda(cid)
        if not c:
            return fallo("NO_ENCONTRADO", "La comanda ya no existe.", 404)
        if c.cancelacion and c.estado != "listo":
            self._marcar_lista(c)
        elif c.estado == "nuevo":
            c.estado = "preparando"
        elif c.estado == "preparando":
            self._marcar_lista(c)
        return ok(self._a_dict(c))

    @http.route("/nodus/api/v1/comandas/<int:cid>/repicar", type="http", auth="user", methods=["POST"], csrf=False)
    def repicar(self, cid, **kw):
        """Vuelve a mandar la comanda: queda como nueva, sin productos marcados y con el cronómetro en cero."""
        c = self._comanda(cid)
        if not c:
            return fallo("NO_ENCONTRADO", "La comanda ya no existe.", 404)
        c.line_ids.write({"listo": False})
        c.write({"estado": "nuevo", "fecha_inicio": fields.Datetime.now(), "fecha_listo": False})
        return ok(self._a_dict(c))

    @http.route("/nodus/api/v1/comandas/<int:cid>/item/<int:lid>", type="http", auth="user", methods=["POST"], csrf=False)
    def item(self, cid, lid, **kw):
        c = self._comanda(cid)
        linea = c.line_ids.filtered(lambda l: l.id == lid)[:1] if c else None
        if not linea:
            return fallo("NO_ENCONTRADO", "El producto ya no existe.", 404)
        if c.estado == "listo":
            return ok(self._a_dict(c))
        linea.listo = not linea.listo
        if c.estado == "nuevo":
            c.estado = "preparando"
        return ok(self._a_dict(c))

    @http.route("/nodus/api/v1/comandas/listas", type="http", auth="user", methods=["POST"], csrf=False)
    def marcar_listas(self, **kw):
        estacion = cuerpo().get("estacion")
        dominio = [("company_id", "=", request.env.company.id), ("estado", "!=", "listo")]
        if estacion and estacion != "todas":
            dominio.append(("estacion", "=", estacion))
        comandas = request.env["nodus.comanda"].sudo().search(dominio)
        for c in comandas:
            self._marcar_lista(c)
        return ok({"marcadas": len(comandas)})
