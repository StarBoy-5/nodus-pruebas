/** @odoo-module **/
// Contabilidad: pantalla propia de Nodus (componente OWL, sin iframe).

import { Component, onMounted, onWillUnmount, useRef } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { usePantallaNodus } from "../comun";
import { montar } from "./contabilidad_logica";

export class NodusContabilidad extends Component {
    static template = "nodus_interfaz.Contabilidad";
    static props = ["*"];

    setup() {
        usePantallaNodus("contabilidad");
        this.raiz = useRef("raiz");
        onMounted(() => {
            this.desmontar = montar(this.raiz.el);
        });
        onWillUnmount(() => this.desmontar && this.desmontar());
    }
}

registry.category("actions").add("nodus_contabilidad", NodusContabilidad);
