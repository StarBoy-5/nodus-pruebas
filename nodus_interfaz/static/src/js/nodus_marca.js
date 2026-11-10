/** @odoo-module **/
// Quita de la barra superior y del menú de usuario lo que delata a Odoo.
// - Para todos: soporte de Odoo, atajos de teclado y "Mi cuenta de Odoo.com".
// - Para el cliente: chat, actividades, llamadas, estado de conexión y selector de
//   empresa, que la interfaz Nodus no tiene. La cuenta de soporte los conserva.

import { registry } from "@web/core/registry";
import { user } from "@web/core/user";

const SIEMPRE_FUERA = ["support", "shortcuts", "odoo_account"];
const FUERA_CLIENTE_BARRA = ["mail.messaging_menu", "mail.activity_menu", "discuss.CallMenu", "SwitchCompanyMenu"];
const FUERA_CLIENTE_MENU = ["im_status"];

function quitar(categoria, claves) {
    const reg = registry.category(categoria);
    for (const clave of claves) {
        if (reg.contains(clave)) {
            reg.remove(clave);
        }
    }
}

export const nodusMarcaService = {
    async start() {
        quitar("user_menuitems", SIEMPRE_FUERA);
        const soporte = await user.hasGroup("nodus_interfaz.group_nodus_soporte");
        document.body.classList.toggle("o_nodus_cliente", !soporte);
        if (!soporte) {
            quitar("systray", FUERA_CLIENTE_BARRA);
            quitar("user_menuitems", FUERA_CLIENTE_MENU);
        }
        return { soporte };
    },
};

registry.category("services").add("nodus_marca", nodusMarcaService);
