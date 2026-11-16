/** @odoo-module **/
// Regla de las barras de desplazamiento: la pista se separa de los extremos SOLO lo que mide
// la curva de la esquina (su radio). Sin radio, la barra va completa. Si el contenedor no es
// redondeado pero está pegado a la esquina de uno que sí lo es (p. ej. el área principal dentro
// de la tarjeta), se usa la curva de ese. Los valores van en variables que lee el CSS.

import { registry } from "@web/core/registry";

function radio(cs, esquina) {
    return parseFloat(cs[`border${esquina}Radius`]) || 0;
}

/** Radio efectivo de una esquina: el propio o el del antepasado cuya misma esquina coincide. */
function radioEsquina(el, esquina) {
    const r = el.getBoundingClientRect();
    let e = el;
    for (let i = 0; i < 6 && e && e.nodeType === 1; i++) {
        const cs = getComputedStyle(e);
        const rad = radio(cs, esquina);
        const er = e.getBoundingClientRect();
        const coincide =
            (esquina.includes("Top") ? Math.abs(er.top - r.top) < 3 : Math.abs(er.bottom - r.bottom) < 3) &&
            (esquina.includes("Left") ? Math.abs(er.left - r.left) < 3 : Math.abs(er.right - r.right) < 3);
        if (!coincide) {
            break;
        }
        if (rad > 0) {
            return rad;
        }
        e = e.parentElement;
    }
    return 0;
}

export function marcarRadios(el) {
    if (!el || el.nodeType !== 1) {
        return;
    }
    const s = el.style;
    s.setProperty("--nodus-r-tr", radioEsquina(el, "TopRight") + "px");
    s.setProperty("--nodus-r-br", radioEsquina(el, "BottomRight") + "px");
    s.setProperty("--nodus-r-bl", radioEsquina(el, "BottomLeft") + "px");
}

function desplazable(el) {
    if (!el || el.nodeType !== 1 || el === document.documentElement || el === document.body) {
        return false;
    }
    const cs = getComputedStyle(el);
    return (
        (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) ||
        (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1)
    );
}

export const nodusRadioBarrasService = {
    start() {
        let programado = false;
        const revisar = () => {
            programado = false;
            // Solo elementos que hoy tienen barra visible
            for (const el of document.querySelectorAll("body *")) {
                if (el.offsetParent !== null && desplazable(el)) {
                    marcarRadios(el);
                }
            }
            // Pantallas de hadeon_ui: la barra de la página está dentro del iframe; toma la curva
            // de la tarjeta en la que va el iframe
            for (const f of document.querySelectorAll(".o_action_manager iframe")) {
                try {
                    const html = f.contentDocument && f.contentDocument.documentElement;
                    if (html) {
                        html.style.setProperty("--nodus-r-tr", radioEsquina(f, "TopRight") + "px");
                        html.style.setProperty("--nodus-r-br", radioEsquina(f, "BottomRight") + "px");
                        html.style.setProperty("--nodus-r-bl", radioEsquina(f, "BottomLeft") + "px");
                    }
                } catch {
                    // iframe de otro origen: no se toca
                }
            }
        };
        const pedir = () => {
            if (!programado) {
                programado = true;
                setTimeout(() => requestAnimationFrame(revisar), 150);
            }
        };
        new MutationObserver(pedir).observe(document.body, { childList: true, subtree: true });
        window.addEventListener("resize", pedir);
        document.addEventListener("scroll", (ev) => ev.target.nodeType === 1 && marcarRadios(ev.target), {
            capture: true,
            passive: true,
        });
        pedir();
    },
};

registry.category("services").add("nodus_radio_barras", nodusRadioBarrasService);
