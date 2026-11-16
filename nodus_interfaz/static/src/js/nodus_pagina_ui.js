/** @odoo-module **/
// Pantallas diseñadas en hadeon_ui (Inventario, ...) mostradas tal cual dentro de la
// tarjeta blanca de Nodus. Van en un marco propio para que sus estilos no se mezclen
// con los de Odoo; la sesión es la misma, así que leen y guardan con los permisos del usuario.

import { Component, onMounted, onWillUnmount, useRef, xml } from "@odoo/owl";
import { registry } from "@web/core/registry";

export class NodusPaginaUI extends Component {
    static template = xml`
        <div class="o_action o_nodus_pagina_ui">
            <iframe class="o_nodus_pagina_marco" t-att-src="src" t-att-title="titulo" t-ref="marco" t-on-load="marcarDock"/>
        </div>`;
    static props = ["*"];

    setup() {
        const params = this.props.action?.params || {};
        this.src = `/nodus/ui/${encodeURIComponent(params.pagina || "")}`;
        this.titulo = this.props.action?.name || "";
        this.claseBody = "o_nodus_pag_" + (params.pagina || "").replace(/[^a-z0-9_-]/gi, "");
        this.marco = useRef("marco");
        this.alRedimensionar = () => this.marcarDock();
        onMounted(() => {
            document.body.classList.add("o_nodus_ui_activa");
            document.body.classList.add(this.claseBody);
            window.addEventListener("resize", this.alRedimensionar);
        });
        onWillUnmount(() => {
            document.body.classList.remove("o_nodus_ui_activa");
            document.body.classList.remove(this.claseBody);
            window.removeEventListener("resize", this.alRedimensionar);
        });
    }

    /** Las pantallas saben si la barra de navegación inferior (bóveda) está puesta: solo en teléfono. */
    marcarDock() {
        const doc = this.marco.el && this.marco.el.contentDocument;
        if (doc && doc.documentElement) {
            doc.documentElement.classList.toggle("nodus-con-dock", window.innerWidth < 768);
        }
    }
}

registry.category("actions").add("nodus_pagina_ui", NodusPaginaUI);
