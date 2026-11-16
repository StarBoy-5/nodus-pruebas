# Copyright 2026 Hadeon
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
from odoo import _, models
from odoo.exceptions import AccessError

GRUPO_SOPORTE = "nodus_interfaz.group_nodus_soporte"


def _solo_soporte(env):
    """Las claves API solo las crea la cuenta de servicio de Nodus."""
    if not env.user.has_group(GRUPO_SOPORTE):
        raise AccessError(_("Solo la cuenta de servicio de Nodus puede crear claves API."))


class ResUsers(models.Model):
    _inherit = "res.users"

    def api_key_wizard(self):
        _solo_soporte(self.env)
        return super().api_key_wizard()


class ResUsersApikeysDescription(models.TransientModel):
    _inherit = "res.users.apikeys.description"

    def check_access_make_key(self):
        super().check_access_make_key()
        _solo_soporte(self.env)
