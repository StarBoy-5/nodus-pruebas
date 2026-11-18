/** @odoo-module **/
// Configuración: pantalla propia de Nodus (componente OWL, sin iframe).

import { Component, onMounted, onWillUnmount, useRef } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { usePantallaNodus } from "../comun";
import { montar } from "./configuracion_logica";

export class NodusConfiguracion extends Component {
    static template = "nodus_interfaz.Configuracion";
    static props = ["*"];

    setup() {
        usePantallaNodus("configuracion");
        this.raiz = useRef("raiz");
        onMounted(() => {
            this.desmontar = montar(this.raiz.el);
        });
        onWillUnmount(() => this.desmontar && this.desmontar());
    }
}

registry.category("actions").add("nodus_configuracion", NodusConfiguracion);
