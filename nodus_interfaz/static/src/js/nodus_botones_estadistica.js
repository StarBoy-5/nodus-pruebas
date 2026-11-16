/** @odoo-module **/
// Botones de estadística del formulario (Ventas, Facturado, Compras…): Odoo decide cuántos mostrar
// según el ancho de la PANTALLA (hasta 8 en PC), pero en Nodus la barra lateral ocupa parte de ese
// ancho y los botones terminaban montados sobre el paginador. Aquí, después de dibujar, se mide:
// si la caja se monta sobre el paginador o se sale de la barra, pasa un botón más al menú "Más"
// y se vuelve a medir. En teléfono se deja como Odoo (todo en el rayo).
import { patch } from "@web/core/utils/patch";
import { onWillRender, useEffect } from "@odoo/owl";
import { ButtonBox } from "@web/views/form/button_box/button_box";

function seMonta(a, b) {
    return a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
}

patch(ButtonBox.prototype, {
    setup() {
        this.nodusLimite = Infinity;
        // OWL ejecuta los onWillRender del último registrado al primero: se registra ANTES de
        // super.setup() para correr DESPUÉS del cálculo de Odoo y recortarlo.
        onWillRender(() => {
            if (!this.visibleButtons || this.env.isSmall || !document.body.classList.contains("o_nodus")) {
                return;
            }
            const todos = [...this.visibleButtons, ...this.additionalButtons];
            if (todos.length <= this.nodusLimite) {
                return;
            }
            const corte = Math.max(this.nodusLimite - 1, 0); // uno queda para "Más"
            this.visibleButtons = todos.slice(0, corte);
            this.additionalButtons = todos.slice(corte);
            this.isFull = true;
        });
        super.setup(...arguments);
        const medir = () => {
            const caja = document.querySelector(".o_control_panel .o-form-buttonbox");
            if (!caja || this.env.isSmall || !document.body.classList.contains("o_nodus")) {
                return;
            }
            const r = caja.getBoundingClientRect();
            const panel = caja.closest(".o_control_panel");
            const p = panel && panel.getBoundingClientRect();
            const otros = panel ? panel.querySelectorAll(".o_pager, .o_control_panel_breadcrumbs") : [];
            const choca = (p && r.right > p.right + 1) ||
                Array.from(otros).some((o) => !o.contains(caja) && !caja.contains(o) && seMonta(r, o.getBoundingClientRect()));
            const visibles = caja.querySelectorAll(":scope > .oe_stat_button").length;
            if (choca && visibles > 1) {
                this.nodusLimite = visibles - 1;
                this.render();
            }
        };
        useEffect(() => {
            const id = requestAnimationFrame(medir);
            return () => cancelAnimationFrame(id);
        });
        // Al cambiar el ancho (girar la tablet, plegar la barra lateral) se vuelve a probar desde cero
        useEffect(
            () => {
                const otraVez = () => {
                    this.nodusLimite = Infinity;
                    this.render();
                };
                window.addEventListener("resize", otraVez);
                // body cambia de clases a menudo (diálogos…): solo cuenta plegar/desplegar la barra
                let plegada = document.body.classList.contains("o_nodus_colapsado");
                const lateral = new MutationObserver(() => {
                    const ahora = document.body.classList.contains("o_nodus_colapsado");
                    if (ahora !== plegada) {
                        plegada = ahora;
                        otraVez();
                    }
                });
                lateral.observe(document.body, { attributes: true, attributeFilter: ["class"] });
                return () => {
                    window.removeEventListener("resize", otraVez);
                    lateral.disconnect();
                };
            },
            () => []
        );
    },
});
