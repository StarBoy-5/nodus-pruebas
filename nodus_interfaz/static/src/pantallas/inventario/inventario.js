/** @odoo-module **/
// Inventario: pantalla propia de Nodus (componente OWL, sin iframe).

import { Component, onMounted, onWillUnmount, useRef } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { usePantallaNodus } from "../comun";
import { montar } from "./inventario_logica";

export class NodusInventario extends Component {
    static template = "nodus_interfaz.Inventario";
    static props = ["*"];

    setup() {
        usePantallaNodus("inventario");
        this.raiz = useRef("raiz");
        onMounted(() => {
            this.desmontar = montar(this.raiz.el);
        });
        onWillUnmount(() => this.desmontar && this.desmontar());
    }
}

registry.category("actions").add("nodus_inventario", NodusInventario);
