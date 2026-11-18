# Copyright 2026 Hadeon
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
{
    "name": "Nodus - Taller",
    "summary": "Pantalla del Taller con el diseño Nodus: cola de órdenes arriba y un paso por vista "
    "(placa, recepción, fotos, diagnóstico, cotización, reparación, listo y entrega)",
    "version": "19.0.1.0.1",
    "category": "Hidden",
    "author": "Hadeon",
    "license": "LGPL-3",
    "depends": ["nodus_interfaz", "auto_repair_workshop"],
    "auto_install": True,
    "data": ["data/nodus_taller_data.xml"],
    "assets": {
        "web.assets_backend": [
            "nodus_taller/static/src/taller/taller.scss",
            "nodus_taller/static/src/taller/taller.js",
            "nodus_taller/static/src/taller/taller.xml",
        ],
    },
}
