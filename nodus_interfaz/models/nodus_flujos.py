# Copyright 2026 Hadeon
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
"""Flujos sin protocolo de Nodus.

Odoo pide muchos pasos (presupuesto → enviar → confirmar → entregar → facturar → registrar pago;
solicitud de presupuesto → confirmar → recibir → factura de proveedor → pago). Los clientes de Nodus
no los necesitan:

- Ventas en dos momentos: **Cotizar** (imprime y marca la cotización como enviada) y, cuando el cliente
  responde, **Vender** (confirma, entrega, factura y abre "¿Cómo paga el cliente?").
- Compras en un paso: **Comprar** (confirma, recibe, registra la factura del proveedor y abre
  "¿Con qué pagaste?").
- **Cobrar / Pagar** en facturas pendientes, con el mismo selector.
- El cliente o proveedor se busca por **cédula o RIF**, no por nombre; si no existe se registra ahí mismo.

Monedas: bolívares y dólares a tasa BCV (la tasa la carga hadeon_bcv_currency). Los pasos intermedios de
Odoo siguen disponibles solo para el grupo Ajustes.
"""
import re

from odoo import _, api, fields, models
from odoo.exceptions import UserError

TIPOS_DOC = [("V", "V"), ("E", "E"), ("J", "J"), ("G", "G"), ("P", "P")]


def solo_digitos(valor):
    return "".join(c for c in str(valor or "") if c.isdigit())


def separar_documento(vat):
    """'J-12345678-9' -> ('J', '123456789'); sin prefijo -> ('', dígitos)."""
    m = re.match(r"^\s*([VEJGPvejgp])\s*-?\s*(.*)$", vat or "")
    if m:
        return m.group(1).upper(), solo_digitos(m.group(2))
    return "", solo_digitos(vat)


def formatear_documento(tipo, digitos):
    """Como lo guarda Contactos de Nodus: V-12345678, J-12345678-9 (el último dígito del RIF es el verificador)."""
    if tipo in ("J", "G") and len(digitos) >= 9:
        return f"{tipo}-{digitos[:-1]}-{digitos[-1]}"
    return f"{tipo}-{digitos}" if tipo else digitos


class ResPartner(models.Model):
    _inherit = "res.partner"

    @api.model
    def _nodus_por_documento(self, tipo, numero):
        """Busca el contacto por cédula/RIF, con o sin prefijo y guiones. Prefiere empresas y contactos sueltos."""
        digitos = solo_digitos(numero)
        if not digitos:
            return self.browse()
        candidatos = self.search([("vat", "ilike", digitos[:4])], order="parent_id desc, id")
        exactos = candidatos.filtered(lambda p: separar_documento(p.vat)[1] == digitos)
        if tipo:
            mismo_tipo = exactos.filtered(lambda p: separar_documento(p.vat)[0] in ("", tipo))
            exactos = mismo_tipo or exactos
        principal = exactos.filtered(lambda p: not p.parent_id)
        return (principal or exactos)[:1]


class NodusDocumentoMixin(models.AbstractModel):
    """Cliente o proveedor por cédula/RIF en un documento con `partner_id`."""

    _name = "nodus.documento.mixin"
    _description = "Nodus: contacto por cédula o RIF"
    _nodus_rango = "customer_rank"

    nodus_doc_tipo = fields.Selection(
        TIPOS_DOC, string="Tipo de documento", default="V",
        compute="_compute_nodus_doc", store=True, readonly=False, precompute=True,
    )
    nodus_doc_numero = fields.Char(
        string="Cédula / RIF", compute="_compute_nodus_doc", store=True, readonly=False, precompute=True,
        help="Escribe la cédula o el RIF: si ya está registrado se carga solo; si no, escribe su nombre y queda registrado.",
    )
    nodus_doc_nuevo = fields.Boolean(string="No registrado", store=False)
    nodus_doc_nombre = fields.Char(string="Nombre", store=False)

    @api.depends("partner_id")
    def _compute_nodus_doc(self):
        for rec in self:
            tipo, numero = separar_documento(rec.partner_id.commercial_partner_id.vat)
            if numero:
                rec.nodus_doc_tipo = tipo or rec.nodus_doc_tipo or "V"
                rec.nodus_doc_numero = numero
            else:
                rec.nodus_doc_tipo = rec.nodus_doc_tipo or "V"
                rec.nodus_doc_numero = rec.nodus_doc_numero if not rec.partner_id else False

    @api.onchange("nodus_doc_tipo", "nodus_doc_numero")
    def _onchange_nodus_doc(self):
        digitos = solo_digitos(self.nodus_doc_numero)
        if not digitos:
            self.nodus_doc_nuevo = False
            return
        socio = self.env["res.partner"]._nodus_por_documento(self.nodus_doc_tipo, digitos)
        if socio:
            self.partner_id = socio
            self.nodus_doc_nuevo = False
        else:
            self.partner_id = False
            self.nodus_doc_nuevo = True

    @api.onchange("nodus_doc_nombre")
    def _onchange_nodus_doc_nombre(self):
        """Registra al contacto nuevo apenas se escribe su nombre (como en el punto de venta)."""
        nombre = (self.nodus_doc_nombre or "").strip()
        digitos = solo_digitos(self.nodus_doc_numero)
        if not nombre or not digitos or self.partner_id:
            return
        Socio = self.env["res.partner"]
        socio = Socio._nodus_por_documento(self.nodus_doc_tipo, digitos)
        if not socio:
            socio = Socio.create({
                "name": nombre,
                "vat": formatear_documento(self.nodus_doc_tipo, digitos),
                self._nodus_rango: 1,
                "company_type": "company" if self.nodus_doc_tipo in ("J", "G") else "person",
            })
        self.partner_id = socio
        self.nodus_doc_nuevo = False
        self.nodus_doc_nombre = False


def entregar_todo(pickings):
    """Valida entregas/recepciones completas en un paso (sin pedir cantidades ni crear pendientes).
    Lo vendido sin existencias queda en negativo, como en el punto de venta."""
    for p in pickings.filtered(lambda p: p.state not in ("done", "cancel")):
        if p.state == "draft":
            p.action_confirm()
        p.action_assign()
        for m in p.move_ids.filtered(lambda m: m.state not in ("done", "cancel")):
            m.quantity = m.product_uom_qty
            m.picked = True
        res = p.with_context(skip_backorder=True, picking_ids_not_to_backorder=p.ids, skip_sms=True,
                             skip_immediate=True, cancel_backorder=True).button_validate()
        if isinstance(res, dict) and p.state != "done":
            raise UserError(p.env._("No se pudo completar %s automáticamente. Ábrelo desde Inventario.", p.name))


def abrir_selector(movimientos, tipo):
    asistente = movimientos.env["nodus.cobro"].create({"move_ids": [fields.Command.set(movimientos.ids)], "tipo": tipo})
    return {
        "type": "ir.actions.act_window",
        "name": movimientos.env._("¿Cómo paga el cliente?") if tipo == "cobro" else movimientos.env._("¿Con qué pagaste?"),
        "res_model": "nodus.cobro",
        "res_id": asistente.id,
        "view_mode": "form",
        "target": "new",
        "context": {"dialog_size": "medium"},
    }


def por_pagar(movimientos):
    return movimientos.filtered(lambda m: m.state == "posted" and m.payment_state in ("not_paid", "partial"))


def ocultar_pasos(modelo, arch, nombres, acciones):
    """Botones de pasos intermedios en la cabecera: solo para el grupo Ajustes. Se hace sobre el arch final
    porque Odoo repite el mismo botón varias veces (un xpath solo alcanzaría al primero)."""
    ids = set()
    for xmlid in acciones:
        accion = modelo.env.ref(xmlid, raise_if_not_found=False)
        if accion:
            ids |= {str(accion.id), f"%({xmlid})d", xmlid}
    for boton in arch.xpath("//header/button"):
        nombre = boton.get("name") or ""
        if nombre in nombres or nombre in ids:
            boton.set("groups", "base.group_system")
    return arch


class SaleOrder(models.Model):
    _name = "sale.order"
    _inherit = ["sale.order", "nodus.documento.mixin"]
    _nodus_rango = "customer_rank"

    nodus_por_cobrar = fields.Boolean(compute="_compute_nodus_por_cobrar")

    @api.depends("invoice_ids.payment_state", "invoice_ids.state")
    def _compute_nodus_por_cobrar(self):
        for o in self:
            o.nodus_por_cobrar = bool(por_pagar(o.invoice_ids))

    @api.model
    def _get_view(self, view_id=None, view_type="form", **options):
        arch, view = super()._get_view(view_id, view_type, **options)
        if view_type == "form":
            ocultar_pasos(self, arch,
                          {"action_quotation_send", "action_confirm", "action_preview_sale_order"},
                          ["sale.action_view_sale_advance_payment_inv", "sale.action_report_saleorder"])
        return arch, view

    def _nodus_revisar_lineas(self):
        for o in self:
            if not o.order_line.filtered(lambda l: not l.display_type):
                raise UserError(_("Agrega al menos un producto."))

    def action_nodus_cotizar(self):
        """Cotizar = imprimir la cotización y dejarla como enviada (queda esperando la respuesta del cliente)."""
        self._nodus_revisar_lineas()
        self.filtered(lambda o: o.state == "draft").action_quotation_sent()
        return self.env.ref("sale.action_report_saleorder").report_action(self)

    def action_nodus_vender(self):
        """Vender = confirmar + entregar + facturar en un paso y abrir el cobro."""
        self.ensure_one()
        self._nodus_revisar_lineas()
        # sudo: el vendedor no necesita permisos de Inventario ni de Contabilidad para cerrar su venta
        o = self.sudo().with_company(self.company_id)
        if o.state in ("draft", "sent"):
            o.with_context(validate_analytic=True).action_confirm()
        entregar_todo(o.picking_ids)
        facturas = o.invoice_ids.filtered(lambda m: m.state != "cancel")
        if o.invoice_status == "to invoice":
            facturas |= o._create_invoices()
        facturas.filtered(lambda m: m.state == "draft").action_post()
        pendientes = por_pagar(facturas)
        if pendientes:
            return abrir_selector(pendientes.with_env(self.env), "cobro")
        return self.env["nodus.cobro"]._imprimir(facturas.with_env(self.env))

    def action_nodus_cobrar(self):
        self.ensure_one()
        pendientes = por_pagar(self.invoice_ids)
        if not pendientes:
            raise UserError(_("Esta venta no tiene nada por cobrar."))
        return abrir_selector(pendientes, "cobro")


class PurchaseOrder(models.Model):
    _name = "purchase.order"
    _inherit = ["purchase.order", "nodus.documento.mixin"]
    _nodus_rango = "supplier_rank"

    nodus_por_pagar = fields.Boolean(compute="_compute_nodus_por_pagar")

    @api.depends("invoice_ids.payment_state", "invoice_ids.state")
    def _compute_nodus_por_pagar(self):
        for o in self:
            o.nodus_por_pagar = bool(por_pagar(o.invoice_ids))

    @api.model
    def _get_view(self, view_id=None, view_type="form", **options):
        arch, view = super()._get_view(view_id, view_type, **options)
        if view_type == "form":
            ocultar_pasos(self, arch,
                          {"action_rfq_send", "button_confirm", "print_quotation", "action_create_invoice",
                           "action_acknowledge"},
                          ["purchase.action_report_purchase_order"])
        return arch, view

    def action_nodus_comprar(self):
        """Comprar = confirmar + recibir + factura del proveedor en un paso y abrir el pago."""
        self.ensure_one()
        if not self.order_line.filtered(lambda l: not l.display_type):
            raise UserError(_("Agrega al menos un producto."))
        o = self.sudo().with_company(self.company_id)
        if o.state in ("draft", "sent"):
            o.with_context(validate_analytic=True).button_confirm()
        if o.state == "to approve":
            o.button_approve()
        entregar_todo(o.picking_ids)
        facturas = o.invoice_ids.filtered(lambda m: m.state != "cancel")
        if o.invoice_status == "to invoice":
            o.action_create_invoice()
            facturas = o.invoice_ids.filtered(lambda m: m.state != "cancel")
        borradores = facturas.filtered(lambda m: m.state == "draft")
        for f in borradores.filtered(lambda m: not m.invoice_date):
            f.invoice_date = fields.Date.context_today(self)
        borradores.action_post()
        pendientes = por_pagar(facturas)
        if pendientes:
            return abrir_selector(pendientes.with_env(self.env), "pago")
        return True

    def action_nodus_pagar(self):
        self.ensure_one()
        pendientes = por_pagar(self.invoice_ids)
        if not pendientes:
            raise UserError(_("Esta compra no tiene nada por pagar."))
        return abrir_selector(pendientes, "pago")


class AccountMove(models.Model):
    _inherit = "account.move"

    def action_nodus_cobrar(self):
        self.ensure_one()
        if not por_pagar(self):
            raise UserError(_("Esta factura no tiene saldo pendiente."))
        return abrir_selector(self, "cobro" if self.is_inbound() else "pago")


class NodusCobro(models.TransientModel):
    """Selector de cobro/pago: el usuario solo elige con qué se pagó. Bs y $ a tasa BCV del día."""

    _name = "nodus.cobro"
    _description = "Nodus: cobro o pago en un paso"

    tipo = fields.Selection([("cobro", "Cobro"), ("pago", "Pago")], required=True, default="cobro")
    move_ids = fields.Many2many("account.move", string="Facturas", required=True)
    company_id = fields.Many2one("res.company", compute="_compute_totales")
    moneda_bs = fields.Many2one("res.currency", compute="_compute_totales")
    moneda_usd = fields.Many2one("res.currency", compute="_compute_totales")
    total_bs = fields.Monetary(string="Total en Bs", currency_field="moneda_bs", compute="_compute_totales")
    total_usd = fields.Monetary(string="Total en $", currency_field="moneda_usd", compute="_compute_totales")
    tasa = fields.Float(string="Tasa BCV (Bs por $)", digits=(16, 4), compute="_compute_totales")
    diarios_permitidos = fields.Many2many("account.journal", compute="_compute_totales")
    journal_id = fields.Many2one(
        "account.journal", string="Forma de pago", domain="[('id', 'in', diarios_permitidos)]",
    )
    monto = fields.Monetary(string="Monto a recibir", currency_field="moneda_diario", compute="_compute_monto")
    moneda_diario = fields.Many2one("res.currency", compute="_compute_monto")

    def _moneda(self, codigo):
        return self.env["res.currency"].with_context(active_test=False).search([("name", "=", codigo)], limit=1)

    @api.depends("move_ids", "tipo")
    def _compute_totales(self):
        hoy = fields.Date.context_today(self)
        for w in self:
            cia = w.move_ids[:1].company_id or self.env.company
            base = cia.currency_id
            bs, usd = w._moneda("VES"), w._moneda("USD")
            # Cada factura aporta su saldo exacto en su moneda (Bs o $) y la otra se calcula a tasa BCV del día
            total_bs = total_usd = 0.0
            for m in w.move_ids:
                if m.currency_id == usd:
                    total_usd += abs(m.amount_residual)
                    total_bs += usd._convert(abs(m.amount_residual), bs, cia, hoy) if bs else 0.0
                else:
                    en_bs = abs(m.amount_residual) if m.currency_id == bs else base._convert(abs(m.amount_residual_signed), bs, cia, hoy)
                    total_bs += en_bs
                    total_usd += bs._convert(en_bs, usd, cia, hoy) if usd else 0.0
            w.company_id = cia
            w.moneda_bs, w.moneda_usd = bs, usd
            w.total_bs = total_bs
            w.total_usd = total_usd
            w.tasa = usd._convert(1.0, bs, cia, hoy, round=False) if bs and usd else 0.0
            # Solo bolívares y dólares (sin euros ni cripto)
            sentido = "inbound" if w.tipo == "cobro" else "outbound"
            diarios = self.env["account.journal"].search([
                ("type", "in", ("bank", "cash")), ("company_id", "=", cia.id),
            ], order="sequence, id")
            w.diarios_permitidos = diarios.filtered(
                lambda j: (j.currency_id or base) in (bs | usd)
                and not re.search(r"usdt|cripto|binance", j.name or "", re.I)
                and (j.inbound_payment_method_line_ids if sentido == "inbound" else j.outbound_payment_method_line_ids)
            )

    @api.depends("journal_id", "total_bs", "total_usd")
    def _compute_monto(self):
        for w in self:
            moneda = w.journal_id.currency_id or w.company_id.currency_id
            w.moneda_diario = moneda
            w.monto = w.total_usd if moneda == w.moneda_usd else w.total_bs

    def action_confirmar(self):
        self.ensure_one()
        if not self.journal_id:
            raise UserError(_("Elige la forma de pago."))
        pendientes = por_pagar(self.move_ids)
        if pendientes:
            # sudo: registrar el pago no requiere ser contador; queda a nombre del usuario
            registro = self.env["account.payment.register"].sudo().with_context(
                active_model="account.move", active_ids=pendientes.ids,
            ).create({
                "journal_id": self.journal_id.id,
                "payment_date": fields.Date.context_today(self),
                "group_payment": True,
            })
            registro._create_payments()
        return self._despues()

    def action_despues(self):
        """A crédito / Pagar después: la factura queda pendiente."""
        self.ensure_one()
        return self._despues()

    def _despues(self):
        if self.tipo == "cobro":
            return self._imprimir(self.move_ids)
        return {"type": "ir.actions.act_window_close"}

    @api.model
    def _imprimir(self, facturas):
        """Al cerrar la venta sale la factura para imprimir."""
        if not facturas:
            return {"type": "ir.actions.act_window_close"}
        plantilla = self.env["account.move.send"]._get_default_pdf_report_id(facturas[:1])
        accion = plantilla.report_action(facturas.ids, config=False)
        if isinstance(accion, dict) and accion.get("type") == "ir.actions.report":
            accion["close_on_report_download"] = True
        return accion
