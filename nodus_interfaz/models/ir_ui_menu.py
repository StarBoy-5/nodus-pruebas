# Copyright 2026 Hadeon
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
from odoo import api, models

# Apps que ve el cliente: las de la interfaz Nodus (hadeon_ui). Todo lo demás
# (Conversaciones, Tableros, Ajustes de Odoo, Aplicaciones y cualquier app que
# se instale después) queda solo para la cuenta de soporte.
APPS_CLIENTE = (
    "nodus_interfaz.menu_principal",
    "account.menu_finance",
    "point_of_sale.menu_point_root",
    "stock.menu_stock_root",
    "sale.sale_menu_root",
    "contacts.menu_contacts",
    "auto_repair_workshop.menu_workshop_root",
    "nodus_interfaz.menu_mensualidad",
    "nodus_interfaz.menu_comandas",
    "nodus_interfaz.menu_configuracion",
)


class IrUiMenu(models.Model):
    _inherit = "ir.ui.menu"

    @api.model
    def _nodus_es_soporte(self):
        return self.env.su or self.env.user.has_group("nodus_interfaz.group_nodus_soporte")

    @api.model
    def _visible_menu_ids(self, debug=False):
        """Menús visibles: los de Odoo (ya filtrados por permisos) recortados a las
        apps de Nodus cuando el usuario no es de soporte.

        Esto solo esconde menús; lo que el cliente puede leer o escribir lo siguen
        decidiendo sus grupos de acceso de Odoo."""
        visibles = super()._visible_menu_ids(debug)
        if self._nodus_es_soporte():
            return visibles
        raices = set()
        for xmlid in APPS_CLIENTE:
            menu_id = self.env["ir.model.data"]._xmlid_to_res_id(xmlid, raise_if_not_found=False)
            if menu_id:
                raices.add(menu_id)
        menus = self.sudo().browse(list(visibles)).with_context(active_test=False)
        menus.fetch(["parent_path"])
        permitidos = set()
        for menu in menus:
            raiz = int(menu.parent_path.split("/", 1)[0]) if menu.parent_path else menu.id
            if raiz in raices:
                permitidos.add(menu.id)
        return frozenset(permitidos)
