# Copyright 2026 Hadeon
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
"""Datos y acciones de la pantalla Nodus del Taller.

Cada paso usa los métodos del Taller (action_*, el asistente de recepción, _create_quotation):
nada escribe ``state`` directamente, así se respetan las mismas reglas que en el formulario.
"""

import re

from odoo import Command, api, fields, models
from odoo.exceptions import UserError

ABIERTAS = ("draft", "reception", "photos_signed", "diagnosis", "quoted", "approved",
            "in_repair", "quality_check", "ready")

# Paso de la pantalla según el estado de la orden
PASO = {
    "draft": "recepcion",
    "reception": "fotos",
    "photos_signed": "diagnostico",
    "diagnosis": "diagnostico",
    "quoted": "cotizacion",
    "approved": "cotizacion",
    "in_repair": "reparacion",
    "quality_check": "reparacion",
    "ready": "listo",
    "delivered": "listo",
}


class WorkshopOrder(models.Model):
    _inherit = "workshop.order"

    # ------------------------------------------------------------------ lectura
    def _nodus_foto_url(self):
        self.ensure_one()
        fotos = self.photo_ids.filtered(lambda p: p.image_1920)
        frente = fotos.filtered(lambda p: p.photo_type == "front")[:1] or fotos[:1]
        if frente:
            return "/web/image/workshop.order.photo/%s/image_512" % frente.id
        return False

    def _nodus_tarjeta(self):
        self.ensure_one()
        estados = dict(self._fields["state"]._description_selection(self.env))
        return {
            "id": self.id,
            "nombre": self.name,
            "placa": self.license_plate or "",
            "vehiculo": self.vehicle_id.model_id.display_name or "",
            "cliente": self.partner_id.name or "",
            "estado": self.state,
            "estado_txt": estados.get(self.state, self.state),
            "paso": PASO.get(self.state, "recepcion"),
            "foto": self._nodus_foto_url(),
        }

    @api.model
    def nodus_taller_cola(self):
        ordenes = self.search([("state", "in", ABIERTAS)], order="date_received desc, id desc", limit=60)
        return [o._nodus_tarjeta() for o in ordenes]

    @api.model
    def nodus_taller_placa(self, placa):
        """Busca el vehículo por placa (sin espacios ni guiones) y devuelve lo que ya se sabe de él."""
        limpia = re.sub(r"[^A-Z0-9]", "", (placa or "").upper())
        if not limpia:
            raise UserError(self.env._("Escribe la placa del vehículo."))
        vehiculo = self.env["fleet.vehicle"].search([]).filtered(
            lambda v: re.sub(r"[^A-Z0-9]", "", (v.license_plate or "").upper()) == limpia
        )[:1]
        if not vehiculo:
            return {"encontrado": False, "placa": placa.strip().upper()}
        abierta = self.search([("vehicle_id", "=", vehiculo.id), ("state", "in", ABIERTAS)], limit=1)
        return {
            "encontrado": True,
            "placa": vehiculo.license_plate,
            "modelo_id": vehiculo.model_id.id,
            "modelo": vehiculo.model_id.display_name or "",
            "color": vehiculo.color or "",
            "cliente": vehiculo.customer_id.name or "",
            "telefono": vehiculo.customer_id.phone or "",
            "km": vehiculo.odometer or 0,
            "orden_abierta": abierta.id or False,
        }

    @api.model
    def nodus_taller_modelos(self):
        modelos = self.env["fleet.vehicle.model"].search([], order="brand_id, name", limit=400)
        return [{"id": m.id, "nombre": m.display_name} for m in modelos]

    @api.model
    def nodus_taller_servicios(self):
        productos = self.env["product.product"].search(
            [("sale_ok", "=", True), ("type", "=", "service")], order="categ_id, name", limit=200
        )
        return [
            {"id": p.id, "nombre": p.name, "precio": p.lst_price, "categoria": p.categ_id.name or "",
             "descripcion": p.description_sale or ""}
            for p in productos
        ]

    def nodus_taller_orden(self):
        self.ensure_one()
        o = self
        cot = o.sale_order_ids.filtered(lambda q: q.state != "cancel").sorted("id", reverse=True)[:1]
        lineas = [
            {"nombre": l.product_id.name or l.name, "cantidad": l.product_uom_qty,
             "precio": l.price_unit, "subtotal": l.price_subtotal}
            for l in cot.order_line if not l.display_type
        ]
        combustible = dict(o._fields["fuel_level"]._description_selection(self.env))
        fotos = o.photo_ids.filtered(lambda p: p.stage == "reception" and p.image_1920)
        tipos = dict(o.photo_ids._fields["photo_type"]._description_selection(self.env))
        datos = o._nodus_tarjeta()
        datos.update({
            "color": o.vehicle_id.color or "",
            "telefono": o.partner_phone or "",
            "foto_cliente": "/web/image/res.partner/%s/image_256" % o.partner_id.id
            if o.partner_id.image_1920 else False,
            "km": o.odometer_in or 0,
            "combustible": combustible.get(o.fuel_level, ""),
            "falla": o.reported_issue or "",
            "hallazgos": o.findings or "",
            "solucion": o.proposed_solution or "",
            "observaciones": o.observations or "",
            "fotos": [{"id": f.id, "clave": f.photo_type, "tipo": tipos.get(f.photo_type, f.photo_type),
                       "url": "/web/image/workshop.order.photo/%s/image_512" % f.id} for f in fotos],
            "fotos_opcionales": o._is_step_optional("photos"),
            "calidad_opcional": o._is_step_optional("quality"),
            "cotizacion": {
                "id": cot.id, "nombre": cot.name, "estado": cot.state, "lineas": lineas,
                "subtotal": cot.amount_untaxed, "impuestos": cot.amount_tax, "total": cot.amount_total,
                "moneda": cot.currency_id.symbol or "$",
            } if cot else False,
            "pendiente": o.has_pending_quotation,
            "aprobada_por": o.approved_by_id.name or "",
            "entrega_firma": o.require_delivery_signature and not o.delivery_signed,
            "fecha_recibido": fields.Datetime.context_timestamp(o, o.date_received).strftime("%d/%m/%Y %I:%M %p")
            if o.date_received else "",
        })
        return datos

    # ------------------------------------------------------------------ pasos
    @api.model
    def nodus_taller_recibir(self, datos):
        """Paso Recepción: usa el asistente del Taller (vehículo, cliente, km, combustible, falla)."""
        placa = (datos.get("placa") or "").strip().upper()
        nombre = (datos.get("cliente") or "").strip()
        telefono = (datos.get("telefono") or "").strip()
        if not placa or not nombre or not telefono:
            raise UserError(self.env._("Placa, cliente y teléfono son obligatorios."))
        cliente = self._nodus_cliente(nombre, telefono)
        modelo = self._nodus_modelo(datos.get("modelo_id"), datos.get("modelo"))
        asistente = self.env["workshop.reception.wizard"].create({
            "plate": placa,
            "partner_id": cliente.id,
            "partner_phone": telefono,
            "odometer_in": float(datos.get("km") or 0),
            "fuel_level": datos.get("combustible") or False,
            "reported_issue": datos.get("falla") or False,
        })
        if modelo and not asistente.vehicle_id:
            asistente.model_id = modelo
        if datos.get("color"):
            asistente.color = datos["color"]
        accion = asistente.action_confirm()
        return accion.get("res_id")

    def _nodus_cliente(self, nombre, telefono):
        digitos = re.sub(r"\D", "", telefono)[-10:]
        socios = self.env["res.partner"].search([("phone", "!=", False)]) if digitos else self.env["res.partner"]
        socio = socios.filtered(lambda p: re.sub(r"\D", "", p.phone or "").endswith(digitos))[:1]
        if socio:
            if socio.name != nombre and not socio.name:
                socio.name = nombre
            return socio
        return self.env["res.partner"].create({"name": nombre, "phone": telefono})

    def _nodus_modelo(self, modelo_id, texto):
        Modelo = self.env["fleet.vehicle.model"]
        if modelo_id:
            return Modelo.browse(int(modelo_id)).exists()
        texto = (texto or "").strip()
        if not texto:
            return Modelo
        encontrado = Modelo.search([("display_name", "ilike", texto)], limit=1)
        if encontrado:
            return encontrado
        partes = texto.replace("/", " ").split(None, 1)
        marca = self.env["fleet.vehicle.model.brand"].search([("name", "=ilike", partes[0])], limit=1) \
            or self.env["fleet.vehicle.model.brand"].create({"name": partes[0]})
        return Modelo.create({"name": partes[1] if len(partes) > 1 else partes[0], "brand_id": marca.id})

    def nodus_taller_foto(self, tipo, imagen):
        """Agrega o reemplaza la foto de recepción de ese ángulo."""
        self.ensure_one()
        foto = self.photo_ids.filtered(lambda p: p.stage == "reception" and p.photo_type == tipo and tipo != "extra")[:1]
        if foto:
            foto.image_1920 = imagen
        else:
            self.env["workshop.order.photo"].create(
                {"order_id": self.id, "stage": "reception", "photo_type": tipo, "image_1920": imagen}
            )
        return self.nodus_taller_orden()

    def nodus_taller_a_diagnostico(self):
        self.ensure_one()
        self.action_start_diagnosis()
        return self.nodus_taller_orden()

    def nodus_taller_cotizar(self, datos, servicio_ids):
        """Paso Diagnóstico: guarda el diagnóstico y arma la cotización con los servicios elegidos."""
        self.ensure_one()
        if not servicio_ids:
            raise UserError(self.env._("Elige al menos un servicio."))
        self.write({
            "reported_issue": datos.get("falla") or self.reported_issue,
            "findings": datos.get("hallazgos") or False,
            "proposed_solution": datos.get("solucion") or False,
        })
        cot = self._create_quotation()
        cot.order_line.filtered("display_type").unlink()
        # El precio de la línea es el que el asesor vio al elegir el servicio (el del producto, en la
        # moneda de la cotización), sin pasar por la conversión de la lista de precios.
        servicios = self.env["product.product"].browse([int(pid) for pid in servicio_ids])
        cot.write({"order_line": [Command.create({"product_id": s.id, "product_uom_qty": 1})
                                  for s in servicios]})
        for linea in cot.order_line.filtered(lambda l: not l.display_type):
            linea.price_unit = linea.product_id.lst_price
        return self.nodus_taller_orden()

    def nodus_taller_aprobar(self):
        """El asesor aprueba (la orden pasa sola a Aprobado) y empieza la reparación."""
        self.ensure_one()
        if self.state == "quoted":
            self.action_approve_quotation()
        if self.can_start_repair:
            self.action_start_repair()
        return self.nodus_taller_orden()

    def nodus_taller_rechazar(self):
        """Cotización rechazada: se cancela y la orden vuelve a Diagnóstico."""
        self.ensure_one()
        self._get_pending_quotation().action_cancel()
        return self.nodus_taller_orden()

    def nodus_taller_terminar(self):
        """Terminado: Listo siempre por action_mark_ready (manda el WhatsApp por n8n)."""
        self.ensure_one()
        if self.state == "in_repair" and not self.can_mark_ready and self.can_quality_check:
            self.action_quality_check()
        self.action_mark_ready()
        return self.nodus_taller_orden()

    def nodus_taller_entregar(self):
        self.ensure_one()
        self.action_deliver()
        return self.nodus_taller_orden()
