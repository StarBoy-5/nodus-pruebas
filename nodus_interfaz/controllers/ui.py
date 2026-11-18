# Copyright 2026 Hadeon
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
"""Pantallas del prototipo hadeon_ui, importadas tal cual (herramientas/importar_hadeon_ui.py)
y mostradas dentro de la tarjeta blanca de Nodus por la acción de cliente nodus_pagina_ui."""
import re

from odoo import http
from odoo.http import request

PAGINAS = {
    "punto-de-venta": "nodus_interfaz.ui_punto_de_venta",
}

# Primer script de cada pantalla: cuenta sus peticiones de red pendientes (fetch y XHR). La pantalla de
# carga de Nodus (webclient_arranque_nodus) no se quita mientras haya alguna o mientras acabe de llegar
# una respuesta: estas pantallas piden sus datos DESPUÉS de cargar y las fotos aparecen al llegar.
CONTADOR_RED = r"""<style>/* iPhone agranda el texto por su cuenta en algunas páginas y descuadra las tarjetas */
html { -webkit-text-size-adjust: 100% !important; text-size-adjust: 100% !important; }</style><script>(function () {
    var w = window;
    w.__nodusPendientes = 0;
    function fin() { w.__nodusPendientes--; w.__nodusUltimaRed = Date.now(); }
    var f = w.fetch;
    if (f) {
        w.fetch = function () {
            w.__nodusPendientes++;
            return f.apply(this, arguments).finally(fin);
        };
    }
    var envio = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
        w.__nodusPendientes++;
        this.addEventListener("loadend", fin);
        return envio.apply(this, arguments);
    };
    /* Quedaba guardado en los navegadores que usaron el diagnóstico (ya retirado): se borra */
    try { localStorage.removeItem("nodus_diag"); } catch (e) {}
})();</script>"""


class NodusUI(http.Controller):

    @http.route("/nodus/ui/<string:pagina>", type="http", auth="user", methods=["GET"])
    def pagina(self, pagina, **kw):
        plantilla = PAGINAS.get(pagina)
        if not plantilla:
            raise request.not_found()
        html = request.render(plantilla, {}).render()
        html = html.decode() if isinstance(html, bytes) else str(html)
        html = re.sub(r"(<head\b[^>]*>)", lambda m: m.group(1) + CONTADOR_RED, html, count=1, flags=re.I)
        return request.make_response(html, headers=[("Content-Type", "text/html; charset=utf-8")])
