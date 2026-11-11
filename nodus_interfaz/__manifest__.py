# Copyright 2026 Hadeon
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
{
    "name": "Nodus - Interfaz",
    "summary": "Interfaz Nodus (diseño de hadeon_ui) para el cliente web de Odoo: "
    "lateral en PC, bóveda en teléfono, menú principal y marca Nodus",
    "version": "19.0.1.0.0",
    "category": "Hidden",
    "author": "Hadeon",
    "license": "LGPL-3",
    "depends": ["web", "mail", "account", "point_of_sale", "purchase_stock"],
    "data": [
        "security/nodus_security.xml",
        "data/nodus_data.xml",
        "views/webclient_templates.xml",
        "views/ui/inventario.xml",
    ],
    "assets": {
        "web._assets_primary_variables": [
            ("prepend", "nodus_interfaz/static/src/scss/primary_variables.scss"),
        ],
        "web.assets_backend": [
            "nodus_interfaz/static/src/scss/nodus_fuentes.scss",
            "nodus_interfaz/static/src/scss/nodus_shell.scss",
            "nodus_interfaz/static/src/scss/nodus_boveda.scss",
            "nodus_interfaz/static/src/scss/nodus_vistas.scss",
            "nodus_interfaz/static/src/scss/nodus_tablero.scss",
            "nodus_interfaz/static/src/js/nodus_modulos.js",
            "nodus_interfaz/static/src/js/nodus_shell.js",
            "nodus_interfaz/static/src/js/nodus_menu_principal.js",
            "nodus_interfaz/static/src/js/nodus_tablero_ventas.js",
            "nodus_interfaz/static/src/js/nodus_pagina_ui.js",
            "nodus_interfaz/static/src/js/nodus_titulo.js",
            "nodus_interfaz/static/src/js/nodus_marca.js",
            "nodus_interfaz/static/src/xml/nodus_shell.xml",
            "nodus_interfaz/static/src/xml/nodus_tablero.xml",
        ],
        "web.assets_frontend": [
            "nodus_interfaz/static/src/scss/nodus_fuentes.scss",
            "nodus_interfaz/static/src/scss/nodus_login.scss",
        ],
    },
    "installable": True,
    "application": False,
}
