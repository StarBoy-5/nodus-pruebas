/** @odoo-module **/
// Título de la pestaña: "Nodus" donde Odoo pondría "Odoo".

import { patch } from "@web/core/utils/patch";
import { titleService } from "@web/core/browser/title_service";

patch(titleService, {
    start() {
        const servicio = super.start(...arguments);
        const setParts = servicio.setParts;
        const corregir = () => {
            if (document.title === "Odoo" || document.title.endsWith(" Odoo")) {
                document.title = document.title.replace(/Odoo$/, "Nodus");
            }
        };
        servicio.setParts = (parts) => {
            setParts(parts);
            corregir();
        };
        corregir();
        return servicio;
    },
});
