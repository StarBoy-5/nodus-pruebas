# Copyright 2026 Hadeon
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
"""App instalable (PWA) con la marca de Nodus: color azul de Nodus en la barra del navegador y en la
pantalla de arranque, e íconos de Nodus (Odoo trae su morado y su ícono).

Además, el navegador guarda la página "Sin conexión" con el service worker de Odoo y solo la renueva
cuando el archivo del service worker cambia. Se le agrega una marca de versión de Nodus: así, cada
vez que cambiamos esa pantalla (subimos la marca), los navegadores la vuelven a descargar."""
from urllib.parse import unquote

from odoo import http
from odoo.http import request
from odoo.addons.web.controllers.webmanifest import WebManifest

# subir este texto cada vez que cambie la pantalla "Sin conexión"
MARCA_SIN_CONEXION = "sin-conexion-nodus-2"
AZUL_NODUS = "#0047AB"
ICONOS = [{"src": "/nodus_interfaz/static/src/img/icono_%s.png" % t, "sizes": "%sx%s" % (t, t), "type": "image/png"}
          for t in (192, 512)]


class NodusWebManifest(WebManifest):

    def _get_service_worker_content(self):
        return super()._get_service_worker_content() + f"\n// Nodus: {MARCA_SIN_CONEXION}\n"

    def _get_webmanifest(self):
        manifest = super()._get_webmanifest()
        manifest.update({"background_color": AZUL_NODUS, "theme_color": AZUL_NODUS, "icons": ICONOS})
        return manifest

    @http.route("/web/manifest.scoped_app_manifest", type="http", auth="public", methods=["GET"])
    def scoped_app_manifest(self, app_id, path, app_name=""):
        """Igual que el de Odoo (app instalada por módulo), con los colores de Nodus."""
        path = unquote(path)
        app_name = unquote(app_name) if app_name else self._get_scoped_app_name(app_id)
        webmanifest = {
            "icons": self._get_scoped_app_icons(app_id),
            "name": app_name,
            "scope": path,
            "start_url": path,
            "display": "standalone",
            "background_color": AZUL_NODUS,
            "theme_color": AZUL_NODUS,
            "prefer_related_applications": False,
            "shortcuts": self._get_scoped_app_shortcuts(app_id),
        }
        return request.make_json_response(webmanifest, {"Content-Type": "application/manifest+json"})
