/** @odoo-module **/
// Pantallas vacías con la voz de Nodus. Odoo, cuando una lista está vacía:
//  - pinta de fondo filas de EJEMPLO inventadas (REF0001, John Miller…) → se apagan;
//  - muestra su texto publicitario ("Supere a la competencia…") con enlaces a odoo.com, como el
//    botón "Pruebe con un ejemplo" que abre un PDF de demostración → se reemplaza por un mensaje
//    sencillo de Nodus: "Aún no hay cotizaciones" + qué hacer.
import { patch } from "@web/core/utils/patch";
import { View } from "@web/views/view";
import { markup } from "@odoo/owl";
import { escape } from "@web/core/utils/strings";

function mensaje(nombre, puedeCrear) {
    const titulo = nombre ? `Aún no hay ${nombre.toLocaleLowerCase("es")}` : "Aún no hay nada por aquí";
    const ayuda = puedeCrear
        ? "Toca «Nuevo» para agregar el primero."
        : "Cuando haya información, aparecerá aquí. Si buscabas algo, revisa los filtros de la búsqueda.";
    return markup(
        `<p class="o_view_nocontent_smiling_face o_nodus_vacio_titulo">${escape(titulo)}</p>` +
            `<p class="o_nodus_vacio_texto">${escape(ayuda)}</p>`
    );
}

patch(View.prototype, {
    async loadView(props) {
        await super.loadView(...arguments);
        if (!document.body.classList.contains("o_nodus") || !this.componentProps) {
            return;
        }
        this.componentProps.useSampleModel = false;
        const info = this.componentProps.info;
        if (info) {
            const nombre = this.env.config?.getDisplayName?.() || "";
            const arch = this.componentProps.arch;
            const puedeCrear = !(arch && arch.getAttribute && ["0", "false", "False"].includes(arch.getAttribute("create")));
            info.noContentHelp = mensaje(nombre, puedeCrear);
        }
    },
});
