# Copyright 2026 Hadeon
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
"""Pantallas del prototipo hadeon_ui, importadas tal cual (herramientas/importar_hadeon_ui.py)
y mostradas dentro de la tarjeta blanca de Nodus por la acción de cliente nodus_pagina_ui."""
from odoo import http
from odoo.http import request

PAGINAS = {
    "inventario": "nodus_interfaz.ui_inventario",
    "contactos": "nodus_interfaz.ui_contactos",
    "contabilidad": "nodus_interfaz.ui_facturacion",
    "configuracion": "nodus_interfaz.ui_configuracion",
    "punto-de-venta": "nodus_interfaz.ui_punto_de_venta",
    "comandas": "nodus_interfaz.ui_comandas",
}


class NodusUI(http.Controller):

    @http.route("/nodus/ui/<string:pagina>", type="http", auth="user", methods=["GET"])
    def pagina(self, pagina, **kw):
        plantilla = PAGINAS.get(pagina)
        if not plantilla:
            raise request.not_found()
        return request.render(plantilla, {})
