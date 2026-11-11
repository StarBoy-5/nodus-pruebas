# Copyright 2026 Hadeon
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
from odoo import fields, models


class ResPartner(models.Model):
    _inherit = "res.partner"

    nodus_contribuyente_especial = fields.Boolean(
        string="Contribuyente especial",
        help="El contacto está designado por el SENIAT como contribuyente especial: al venderle o "
             "comprarle aplican retenciones de IVA. Solo marca al contacto; las retenciones las "
             "registra Contabilidad.",
    )
