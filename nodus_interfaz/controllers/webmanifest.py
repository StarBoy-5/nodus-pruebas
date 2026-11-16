# Copyright 2026 Hadeon
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
"""El navegador guarda la página "Sin conexión" con el service worker de Odoo y solo la renueva
cuando el archivo del service worker cambia. Se le agrega una marca de versión de Nodus: así, cada
vez que cambiamos esa pantalla (subimos la marca), los navegadores la vuelven a descargar."""
from odoo.addons.web.controllers.webmanifest import WebManifest

# subir este texto cada vez que cambie la pantalla "Sin conexión"
MARCA_SIN_CONEXION = "sin-conexion-nodus-2"


class NodusWebManifest(WebManifest):

    def _get_service_worker_content(self):
        return super()._get_service_worker_content() + f"\n// Nodus: {MARCA_SIN_CONEXION}\n"
