/** @odoo-module **/
// Punto de Venta: pantalla propia de Nodus (componente OWL, sin iframe).

import { Component, onMounted, onWillUnmount, useRef } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { usePantallaNodus } from "../comun";
import { montar } from "./pos_logica";

export class NodusPos extends Component {
    static template = "nodus_interfaz.Pos";
    static props = ["*"];

    setup() {
        usePantallaNodus("punto-de-venta");
        this.raiz = useRef("raiz");
        // En teléfono la barra de navegación inferior (bóveda) está puesta: el POS deja su espacio
        this.marcarDock = () => this.raiz.el && this.raiz.el.classList.toggle("nodus-con-dock", window.innerWidth < 768);
        onMounted(() => {
            this.marcarDock();
            window.addEventListener("resize", this.marcarDock);
            this.desmontar = montar(this.raiz.el);
        });
        onWillUnmount(() => {
            window.removeEventListener("resize", this.marcarDock);
            this.desmontar && this.desmontar();
        });
    }
}

registry.category("actions").add("nodus_pos", NodusPos);
