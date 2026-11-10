/** @odoo-module **/
// Menú Principal de Nodus (página de inicio de hadeon_ui): encabezado de vidrio y
// tarjetas de módulos. Es una acción de cliente, así que tiene su propia URL
// (/odoo/menu-principal) y funciona el botón atrás del navegador.

import { Component, onMounted, onWillUnmount } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useService } from "@web/core/utils/hooks";
import { modulosDe } from "./nodus_modulos";

export class NodusMenuPrincipal extends Component {
    static template = "nodus_interfaz.MenuPrincipal";
    static props = ["*"];

    setup() {
        this.menu = useService("menu");
        onMounted(() => document.body.classList.add("o_nodus_inicio"));
        onWillUnmount(() => document.body.classList.remove("o_nodus_inicio"));
    }

    get modulos() {
        // La tarjeta del propio Menú Principal no se muestra, igual que en hadeon_ui
        return modulosDe(this.menu).filter((m) => m.app.xmlid !== "nodus_interfaz.menu_principal");
    }

    get usuario() {
        return { nombre: user.name || "", correo: user.login || "" };
    }

    abrir(modulo) {
        this.menu.selectMenu(modulo.app);
    }

    salir() {
        browser.location.href = "/web/session/logout?redirect=/odoo";
    }
}

registry.category("actions").add("nodus_menu_principal", NodusMenuPrincipal);
