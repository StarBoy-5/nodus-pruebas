# Copyright 2026 Hadeon
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
from odoo import fields, models


class NodusCuenta(models.Model):
    """Cuenta abierta de una mesa: la arma el mesero y la cobra la caja."""
    _name = "nodus.cuenta"
    _description = "Cuenta abierta de una mesa"
    _order = "fecha_apertura desc, id desc"

    company_id = fields.Many2one("res.company", default=lambda s: s.env.company, required=True, index=True)
    mesa = fields.Char("Mesa (id)", required=True, index=True)
    mesa_nombre = fields.Char("Mesa")
    mesero_id = fields.Many2one("res.users", "Mesero", default=lambda s: s.env.user)
    state = fields.Selection([("abierta", "Abierta"), ("cobrada", "Cobrada"), ("cancelada", "Cancelada")],
                             default="abierta", required=True, index=True)
    fecha_apertura = fields.Datetime(default=fields.Datetime.now, required=True)
    propina_pct = fields.Float("Propina %")
    nota = fields.Char()
    line_ids = fields.One2many("nodus.cuenta.line", "cuenta_id", "Productos")


class NodusCuentaLine(models.Model):
    _name = "nodus.cuenta.line"
    _description = "Producto de una cuenta"

    cuenta_id = fields.Many2one("nodus.cuenta", required=True, ondelete="cascade", index=True)
    producto_id = fields.Many2one("product.product", required=True, ondelete="cascade")
    qty = fields.Float("Cantidad", default=1.0)
    enviado = fields.Float("Ya enviado a cocina", default=0.0)
