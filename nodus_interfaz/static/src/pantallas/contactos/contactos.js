/** @odoo-module **/
// Contactos: pantalla propia de Nodus (componente OWL, sin iframe).

import { Component, onMounted, onWillUnmount, useRef } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { usePantallaNodus } from "../comun";
import { montar } from "./contactos_logica";

export class NodusContactos extends Component {
    static template = "nodus_interfaz.Contactos";
    static props = ["*"];

    setup() {
        usePantallaNodus("contactos");
        this.raiz = useRef("raiz");
        onMounted(() => {
            this.desmontar = montar(this.raiz.el);
        });
        onWillUnmount(() => this.desmontar && this.desmontar());
    }
}

registry.category("actions").add("nodus_contactos", NodusContactos);
