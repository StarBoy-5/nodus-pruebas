/** @odoo-module **/
// Navegación de Nodus en el cliente web: lateral en PC y bóveda de vidrio en teléfono,
// los dos copiados de hadeon_ui. Se montan una sola vez junto al cliente web.

import { Component, onMounted, onPatched, onWillUnmount, useRef, useState } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { registry } from "@web/core/registry";
import { imageUrl } from "@web/core/utils/urls";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { CheckBox } from "@web/core/checkbox/checkbox";
import { user } from "@web/core/user";
import { useBus, useService } from "@web/core/utils/hooks";
import { modulosDe } from "./nodus_modulos";

const CLAVE_COLAPSO = "nodus_sidebar_collapsed";
const URL_SALIR = "/web/session/logout?redirect=/odoo";

function leerColapso() {
    try {
        return browser.localStorage.getItem(CLAVE_COLAPSO) === "true";
    } catch {
        return false;
    }
}

/** Datos y acciones que comparten el lateral y la bóveda. */
class NodusNavBase extends Component {
    static props = {};

    setup() {
        this.menu = useService("menu");
        this.state = useState({ rev: 0 });
        useBus(this.env.bus, "MENUS:APP-CHANGED", () => this.state.rev++);
    }

    get modulos() {
        this.state.rev; // se vuelve a calcular al cambiar de app
        return modulosDe(this.menu);
    }

    get idActivo() {
        this.state.rev;
        return this.menu.getCurrentApp()?.id;
    }

    get usuario() {
        const foto = imageUrl("res.partner", user.partnerId, "avatar_128", { unique: user.writeDate });
        return { nombre: user.name || "", correo: user.login || "", foto };
    }

    abrir(modulo) {
        this.menu.selectMenu(modulo.app);
    }

    salir() {
        browser.location.href = URL_SALIR;
    }
}

export class NodusLateral extends NodusNavBase {
    static template = "nodus_interfaz.Lateral";
    static components = { Dropdown, DropdownItem, CheckBox };

    /** Mismas opciones del menú de usuario de Odoo (el de arriba a la derecha, que ya no se muestra). */
    opcionesUsuario() {
        return registry
            .category("user_menuitems")
            .getAll()
            .map((el) => el(this.env))
            .filter((el) => (el.show ? el.show() : true))
            .sort((a, b) => (a.sequence || 100) - (b.sequence || 100));
    }

    setup() {
        super.setup();
        this.state.colapsado = leerColapso();
        onMounted(() => {
            document.body.classList.add("o_nodus");
            document.body.classList.toggle("o_nodus_colapsado", this.state.colapsado);
        });
        onWillUnmount(() => document.body.classList.remove("o_nodus", "o_nodus_colapsado"));
    }

    alternar() {
        this.state.colapsado = !this.state.colapsado;
        document.body.classList.toggle("o_nodus_colapsado", this.state.colapsado);
        try {
            browser.localStorage.setItem(CLAVE_COLAPSO, String(this.state.colapsado));
        } catch {
            // sin almacenamiento: el lateral vuelve expandido al recargar
        }
        // Las listas de Odoo recalculan su ancho cuando termina el movimiento (0,3 s)
        browser.setTimeout(() => browser.dispatchEvent(new Event("resize")), 320);
    }
}

export class NodusBoveda extends NodusNavBase {
    static template = "nodus_interfaz.Boveda";

    setup() {
        super.setup();
        this.state.abierta = false;
        this.lista = useRef("lista");
        this.ultimoActivo = null;
        onMounted(() => browser.setTimeout(() => this.enfocar(), 150));
        onPatched(() => {
            if (this.idActivo !== this.ultimoActivo) {
                browser.setTimeout(() => this.enfocar(), 150);
            }
        });
    }

    alternar() {
        this.state.abierta = !this.state.abierta;
        if (!this.state.abierta) {
            browser.setTimeout(() => this.enfocar(), 300);
        }
    }

    abrir(modulo) {
        this.state.abierta = false;
        super.abrir(modulo);
    }

    /** Lleva el módulo activo al centro de la fila, como en hadeon_ui. */
    enfocar() {
        const lista = this.lista.el;
        this.ultimoActivo = this.idActivo;
        const nodo = lista && lista.querySelector(".dock-item.active");
        if (!nodo) {
            return;
        }
        const celda = nodo.parentElement;
        const ancho = lista.clientWidth;
        const max = lista.scrollWidth - ancho;
        const ideal = celda.offsetLeft - ancho / 2 + celda.offsetWidth / 2;
        const umbral = celda.offsetWidth * 1.5;
        const izquierda = ideal < umbral ? 0 : ideal > max - umbral ? max : ideal;
        lista.scrollTo({ left: izquierda, behavior: "smooth" });
    }
}

registry.category("main_components").add("NodusLateral", { Component: NodusLateral });
registry.category("main_components").add("NodusBoveda", { Component: NodusBoveda });
