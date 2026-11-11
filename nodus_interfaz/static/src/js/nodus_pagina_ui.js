/** @odoo-module **/
// Pantallas diseñadas en hadeon_ui (Inventario, ...) mostradas tal cual dentro de la
// tarjeta blanca de Nodus. Van en un marco propio para que sus estilos no se mezclen
// con los de Odoo; la sesión es la misma, así que leen y guardan con los permisos del usuario.

import { Component, onMounted, onWillUnmount, xml } from "@odoo/owl";
import { registry } from "@web/core/registry";

export class NodusPaginaUI extends Component {
    static template = xml`
        <div class="o_action o_nodus_pagina_ui">
            <iframe class="o_nodus_pagina_marco" t-att-src="src" t-att-title="titulo"/>
        </div>`;
    static props = ["*"];

    setup() {
        const params = this.props.action?.params || {};
        this.src = `/nodus/ui/${encodeURIComponent(params.pagina || "")}`;
        this.titulo = this.props.action?.name || "";
        onMounted(() => document.body.classList.add("o_nodus_ui_activa"));
        onWillUnmount(() => document.body.classList.remove("o_nodus_ui_activa"));
    }
}

registry.category("actions").add("nodus_pagina_ui", NodusPaginaUI);
