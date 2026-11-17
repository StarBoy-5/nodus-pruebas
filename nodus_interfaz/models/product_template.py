# En Nodus todo lo que se vende sale en la caja: Odoo crea los productos con "Disponible en PdV"
# apagado y el cliente no entendía por qué su producto nuevo no aparecía en el Punto de Venta.
from odoo import fields, models


class ProductTemplate(models.Model):
    _inherit = "product.template"

    available_in_pos = fields.Boolean(default=True)
