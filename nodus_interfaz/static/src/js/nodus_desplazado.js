/** @odoo-module **/
// Marca el área de contenido con "nodus-desplazado" solo mientras no está arriba del todo.
// Así el degradado bajo la barra fija de los formularios aparece al bajar y se quita al volver arriba.

import { registry } from "@web/core/registry";

const CLASE = "nodus-desplazado";

function revisar(el) {
    if (el && el.classList) {
        el.classList.toggle(CLASE, el.scrollTop > 2);
    }
}

// Primer paso visible (el de más a la izquierda) de cada barra de pasos: empieza recto
function marcarPasos() {
    document.querySelectorAll(".o_statusbar_status").forEach((barra) => {
        const pasos = [...barra.querySelectorAll(".o_arrow_button:not(.dropdown-toggle)")].filter(
            (b) => b.offsetParent !== null
        );
        let primero = null;
        for (const b of pasos) {
            if (!primero || b.getBoundingClientRect().left < primero.getBoundingClientRect().left) {
                primero = b;
            }
        }
        for (const b of pasos) {
            const debe = b === primero;
            if (b.classList.contains("nodus-paso-inicio") !== debe) {
                b.classList.toggle("nodus-paso-inicio", debe);
            }
        }
    });
}

export const nodusDesplazadoService = {
    start() {
        document.addEventListener(
            "scroll",
            (ev) => {
                const el = ev.target;
                if (el && el.classList && el.classList.contains("o_content")) {
                    revisar(el);
                }
            },
            true
        );
        // Al cambiar de pantalla o de registro el contenido vuelve arriba sin evento de desplazamiento
        let programado = false;
        const revisarTodos = () => {
            programado = false;
            document.querySelectorAll(".o_content").forEach(revisar);
            marcarPasos();
        };
        new MutationObserver(() => {
            if (!programado) {
                programado = true;
                requestAnimationFrame(revisarTodos);
            }
        }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    },
};

registry.category("services").add("nodus_desplazado", nodusDesplazadoService);
