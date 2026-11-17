# Copyright 2026 Hadeon
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
"""Pantallas del prototipo hadeon_ui, importadas tal cual (herramientas/importar_hadeon_ui.py)
y mostradas dentro de la tarjeta blanca de Nodus por la acción de cliente nodus_pagina_ui."""
import re

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

# Primer script de cada pantalla: cuenta sus peticiones de red pendientes (fetch y XHR). La pantalla de
# carga de Nodus (webclient_arranque_nodus) no se quita mientras haya alguna o mientras acabe de llegar
# una respuesta: estas pantallas piden sus datos DESPUÉS de cargar y las fotos aparecen al llegar.
CONTADOR_RED = r"""<script>(function () {
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
    /* Modo diagnóstico (solo en el navegador que lo activó en /nodus/diag): muestra lo que ve esta pantalla */
    var diag = false;
    try { diag = localStorage.getItem("nodus_diag") === "1"; } catch (e) {}
    if (!diag) { return; }
    var errores = [];
    w.addEventListener("error", function (e) { errores.push((e.message || "error") + " @" + (e.lineno || "?")); });
    w.addEventListener("unhandledrejection", function (e) { errores.push("promesa: " + (e.reason && e.reason.message || e.reason)); });
    document.addEventListener("DOMContentLoaded", function () {
        var caja = document.createElement("pre");
        caja.style.cssText = "position:fixed;left:6px;right:6px;top:6px;z-index:2147483647;margin:0;padding:8px;" +
            "background:rgba(0,0,0,.82);color:#7CFC7C;font:11px/1.35 monospace;white-space:pre-wrap;border-radius:8px;pointer-events:none";
        document.body.appendChild(caja);
        function q(s) { return document.querySelector(s); }
        function disp(s) { var e = q(s); return e ? getComputedStyle(e).display : "(no existe)"; }
        function alto(s) { var e = q(s); return e ? Math.round(e.getBoundingClientRect().height) : "-"; }
        setInterval(function () {
            var f = w.frameElement, vv = w.visualViewport, pv = w.top.visualViewport;
            caja.textContent = [
                "NODUS DIAG  " + navigator.userAgent.replace(/^.*?\(/, "(").slice(0, 90),
                "marco innerW/H: " + w.innerWidth + " x " + w.innerHeight + "   doc: " + document.documentElement.clientWidth + " x " + document.documentElement.scrollHeight,
                "iframe en la pagina: " + (f ? Math.round(f.getBoundingClientRect().width) + " x " + Math.round(f.getBoundingClientRect().height) : "-") +
                    "   pagina: " + w.top.innerWidth + " x " + w.top.innerHeight + (pv ? "  visual: " + Math.round(pv.width) + " x " + Math.round(pv.height) : ""),
                "max-width 767: " + w.matchMedia("(max-width: 767px)").matches + "   dock: " + document.documentElement.classList.contains("nodus-con-dock") +
                    "   bandeja: " + document.body.classList.contains("nodus-bandeja"),
                "carrito: " + disp("#vista-carrito-pos") + "   productos: " + disp("#contenedor-productos-pos") + "   panel alto: " + alto("#hadeon-pos-sidebar"),
                "scroll marco: " + Math.round(w.scrollY) + "   errores: " + (errores.length ? errores.slice(-3).join(" | ") : "ninguno"),
            ].join("\n");
        }, 1000);
    });
})();</script>"""


class NodusUI(http.Controller):

    @http.route("/nodus/diag", type="http", auth="user", methods=["GET"])
    def diagnostico(self, on="1", **kw):
        """Activa (on=1) o apaga (on=0) el modo diagnóstico SOLO en este navegador y vuelve al Punto de Venta."""
        valor = "1" if on == "1" else "0"
        html = ("<!doctype html><meta charset='utf-8'><script>try{localStorage.setItem('nodus_diag','%s')}catch(e){}"
                "location.replace('/odoo/punto-de-venta')</script>" % valor)
        return request.make_response(html, headers=[("Content-Type", "text/html; charset=utf-8")])

    @http.route("/nodus/ui/<string:pagina>", type="http", auth="user", methods=["GET"])
    def pagina(self, pagina, **kw):
        plantilla = PAGINAS.get(pagina)
        if not plantilla:
            raise request.not_found()
        html = request.render(plantilla, {}).render()
        html = html.decode() if isinstance(html, bytes) else str(html)
        html = re.sub(r"(<head\b[^>]*>)", lambda m: m.group(1) + CONTADOR_RED, html, count=1, flags=re.I)
        return request.make_response(html, headers=[("Content-Type", "text/html; charset=utf-8")])
