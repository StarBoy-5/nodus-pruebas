# Copyright 2026 Hadeon
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
from odoo import api, fields, models


class NodusComanda(models.Model):
    """Pedido que el Punto de Venta manda a una estación de preparación (cocina, barra...).

    Cada vez que el cajero genera la comanda se crea una por estación, solo con los productos
    de esa estación. La pantalla Comandas las ve en vivo y las va marcando hasta dejarlas listas.
    """
    _name = "nodus.comanda"
    _description = "Comanda de preparación"
    _order = "fecha_inicio desc, id desc"

    name = fields.Char("Pedido", readonly=True, copy=False, default="/")
    company_id = fields.Many2one("res.company", default=lambda s: s.env.company, required=True, index=True)
    config_id = fields.Many2one("pos.config", "Caja", ondelete="set null")
    pos_order_id = fields.Many2one("pos.order", "Orden cobrada", ondelete="set null")
    mesa = fields.Char("Mesa o servicio")
    mesero = fields.Char()
    user_id = fields.Many2one("res.users", "Quién la envió", default=lambda s: s.env.user)
    estacion = fields.Char("Estación", required=True, index=True)
    vip = fields.Boolean("Cliente VIP")
    cancelacion = fields.Boolean("Aviso de cancelación")
    token = fields.Char("Marca anti-duplicado", index=True, copy=False)
    estado = fields.Selection([("nuevo", "Nuevo"), ("preparando", "Preparando"), ("listo", "Listo")],
                              default="nuevo", required=True, index=True)
    fecha_inicio = fields.Datetime("Enviada", default=fields.Datetime.now, required=True)
    fecha_listo = fields.Datetime("Lista")
    line_ids = fields.One2many("nodus.comanda.line", "comanda_id", "Productos")

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if not vals.get("name") or vals["name"] == "/":
                vals["name"] = self.env["ir.sequence"].next_by_code("nodus.comanda") or "#0000"
        return super().create(vals_list)


class NodusComandaLine(models.Model):
    _name = "nodus.comanda.line"
    _description = "Producto de una comanda"
    _order = "id"

    comanda_id = fields.Many2one("nodus.comanda", required=True, ondelete="cascade", index=True)
    producto_id = fields.Many2one("product.product", ondelete="set null")
    name = fields.Char("Producto", required=True)
    qty = fields.Float("Cantidad", default=1.0)
    listo = fields.Boolean()
    nota = fields.Char("Nota")
