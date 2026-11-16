/** @odoo-module **/
// Regla general de Nodus para todo lo que se desplaza: el contenido se desvanece con un
// degradado en el borde por donde aún queda contenido, y el degradado se apaga suavemente al
// llegar al tope. Igual que hadeonActivarDegradadoScroll de hadeon_ui, pero automático.
//
// Cómo: dos capas pegadas (position: sticky, en ::before / ::after del contenedor) que pintan
// el color de fondo del contenedor de opaco a transparente. Al ser sticky, el navegador las
// mueve junto con el desplazamiento en el mismo cuadro: no se separan ni parpadean aunque se
// mueva muy rápido. Su opacidad (aparecer/desaparecer en los topes) va ligada al scroll con
// CSS. Este archivo solo mide (encabezado fijo, rellenos, color de fondo).

import { registry } from "@web/core/registry";

const TAM = 48; // px del degradado
const CLASE = "nodus-degradado";
// La bóveda del teléfono tiene su propio diseño (brillo del módulo activo): no se toca
const EXCLUIR = ".hadeon-vault-container, .o-scrollbar";
// Contenedores que se revisan aunque todavía no se hayan desplazado (para el degradado inicial de abajo)
const CANDIDATOS = [
    ".o_content",
    ".o_list_renderer",
    ".o_kanban_renderer",
    ".o_kanban_group",
    ".o-dropdown--menu",
    ".dropdown-menu",
    ".o-mail-ActivityMenu",
    ".modal-body",
    ".o_nodus_lat_lista",
    ".o_nodus_menu_principal",
    ".o_search_panel",
    ".o-mail-Thread",
    ".o-mail-DiscussSidebar",
    ".o_spreadsheet_dashboard_action .o_renderer",
].join(",");

function desplazable(el) {
    if (!el || el.nodeType !== 1 || el === document.documentElement || el === document.body) {
        return false;
    }
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "IFRAME") {
        return false;
    }
    const cs = getComputedStyle(el);
    const y = /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
    const x = /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
    return { x, y, cs };
}

/** Alto del encabezado fijo (thead / encabezado de columna) para que el degradado empiece debajo. */
function altoEncabezado(el) {
    const cab = el.querySelector(":scope > table > thead, :scope > .o_kanban_header, :scope > .hadeon-dash-header");
    if (cab && getComputedStyle(cab).position === "sticky") {
        return cab.getBoundingClientRect().height;
    }
    return 0;
}

/** Primer color de fondo opaco del contenedor o de sus antepasados (al que se desvanece el contenido). */
function colorFondo(el) {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
        const bg = getComputedStyle(e).backgroundColor;
        const m = bg.match(/rgba?\(([^)]+)\)/);
        if (m) {
            const p = m[1].split(",").map((x) => parseFloat(x));
            if (p.length < 4 || p[3] > 0.95) {
                return `rgb(${p[0]}, ${p[1]}, ${p[2]})`;
            }
        }
    }
    return "rgb(243, 243, 252)";
}

/** Si el contenedor llega a la bóveda del teléfono: px desde su borde inferior hasta 12 px
 *  antes del borde de la pantalla (lo que debe quedar cubierto). Si no, null. */
function bajoBoveda(r) {
    const boveda = document.querySelector(".hadeon-vault-container");
    const b = boveda && boveda.getBoundingClientRect();
    if (!b || !b.height) {
        // Sin bóveda (p. ej. el Menú Principal): en teléfono, lo que llega al borde de abajo
        // también termina su degradado 12 px antes del borde
        return window.innerWidth < 768 && r.bottom >= window.innerHeight - 1 ? Math.max(0, r.bottom - window.innerHeight) + 12 : null;
    }
    if (r.bottom <= b.top) {
        return null;
    }
    return Math.max(0, r.bottom - window.innerHeight) + 12;
}

function quitar(el) {
    el.classList.remove(CLASE, "nodus-deg-v", "nodus-deg-h", "nodus-deg-sin-arriba", "nodus-deg-mascara");
}

/** Cómo se desvanece: con capas del color de fondo (contenedor con fondo propio, p. ej. tarjetas
 *  blancas) o con máscara sobre el propio contenedor (sin fondo propio, p. ej. el lateral sobre el
 *  degradado azul). La máscara tampoco se mueve con el contenido. Con imagen de fondo propia
 *  (degradado del Menú Principal) no se aplica para no desvanecer su fondo. */
function modo(cs) {
    if (cs.backgroundImage && cs.backgroundImage !== "none") {
        return "ninguno";
    }
    const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
    const p = m ? m[1].split(",").map((x) => parseFloat(x)) : [0, 0, 0, 0];
    const alfa = p.length < 4 ? 1 : p[3];
    return alfa > 0.95 ? "capas" : "mascara";
}

function actualizar(el) {
    if (!el.isConnected || el.closest(EXCLUIR)) {
        return;
    }
    const info = desplazable(el);
    if (!info || (!info.x && !info.y)) {
        if (el.classList.contains(CLASE)) {
            quitar(el);
        }
        return;
    }
    const cs = info.cs;
    const s = el.style;
    const m = modo(cs);
    if (m === "ninguno") {
        quitar(el);
        return;
    }
    el.classList.toggle("nodus-deg-mascara", m === "mascara");
    s.setProperty("--nodus-deg-color", colorFondo(el));
    const flex = /flex|grid/.test(cs.display);
    const gap = flex ? parseFloat(info.y ? cs.rowGap : cs.columnGap) || 0 : 0;
    if (gap) {
        s.setProperty("--nodus-deg-gap", gap + "px");
    } else {
        s.removeProperty("--nodus-deg-gap");
    }
    if (info.y) {
        // Vertical (lo más común; si se desplaza en los dos ejes manda el vertical)
        const cab = altoEncabezado(el);
        const pt = parseFloat(cs.paddingTop) || 0;
        // --nodus-deg-pb permite que el degradado termine antes que el relleno (teléfono: bajo la bóveda)
        const pbVar = cs.getPropertyValue("--nodus-deg-pb").trim();
        let pb = pbVar ? parseFloat(pbVar) || 0 : parseFloat(cs.paddingBottom) || 0;
        // Teléfono: todo lo que llega a la bóveda pasa por debajo de ella y se desvanece cerca
        // del borde de la pantalla (12 px antes), no encima de la bóveda
        const bajo = bajoBoveda(el.getBoundingClientRect());
        if (bajo !== null) {
            pb = bajo;
        }
        // Las capas sticky se colocan respecto al borde del contenido: se corren hasta el borde
        // real del contenedor con el relleno en negativo
        const pbReal = parseFloat(cs.paddingBottom) || 0;
        s.setProperty("--nodus-deg-top", (cab ? cab : -pt) + "px");
        s.setProperty("--nodus-deg-cab", cab + "px");
        s.setProperty("--nodus-deg-bot", -pbReal + "px");
        s.setProperty("--nodus-deg-top-solido", (cab ? 0 : pt) + "px");
        s.setProperty("--nodus-deg-bot-solido", pb + "px");
        el.classList.add(CLASE, "nodus-deg-v");
        el.classList.remove("nodus-deg-h");
        // El formulario ya tiene su degradado bajo la barra de botones y pasos
        el.classList.toggle(
            "nodus-deg-sin-arriba",
            el.classList.contains("o_content") && !!el.querySelector(".o_form_statusbar")
        );
    } else {
        s.setProperty("--nodus-deg-izq-solido", (parseFloat(cs.paddingLeft) || 0) + "px");
        s.setProperty("--nodus-deg-der-solido", (parseFloat(cs.paddingRight) || 0) + "px");
        s.setProperty("--nodus-deg-izq", -(parseFloat(cs.paddingLeft) || 0) + "px");
        s.setProperty("--nodus-deg-der", -(parseFloat(cs.paddingRight) || 0) + "px");
        el.classList.add(CLASE, "nodus-deg-h");
        el.classList.remove("nodus-deg-v", "nodus-deg-sin-arriba");
    }
}

/** Degradado suave de un eje (para el iframe): curva de opacidad, no línea recta. */
function eje(dir, alto, a, b) {
    const curva = [[0.2, 0.06], [0.4, 0.22], [0.6, 0.5], [0.8, 0.8]];
    const arriba = a ? curva.map(([p, o]) => `rgba(0,0,0,${o}) ${a * p}px`).join(", ") + ", " : "";
    const abajo = b ? curva.slice().reverse().map(([p, o]) => `rgba(0,0,0,${o}) ${alto - b * p}px`).join(", ") + ", " : "";
    return `linear-gradient(${dir}, ${a ? "transparent" : "#000"} 0px, ${arriba}#000 ${a}px, ` +
        `#000 ${alto - b}px, ${abajo}${b ? "transparent" : "#000"} ${alto}px)`;
}

/** Pantallas de hadeon_ui (iframe): el iframe no se mueve, solo cambia cuánto se desvanece. */
function actualizarIframe(f) {
    let w;
    try {
        w = f.contentWindow;
        if (!w || !w.document || !w.document.documentElement) {
            return;
        }
    } catch {
        return;
    }
    const d = w.document.documentElement;
    const maxY = d.scrollHeight - w.innerHeight;
    const y = w.scrollY;
    const a = maxY > 1 ? Math.min(TAM, Math.max(0, y)) : 0;
    const b = maxY > 1 ? Math.min(TAM, Math.max(0, maxY - y)) : 0;
    // Teléfono: el degradado de abajo termina 12 px antes del borde de la pantalla (bajo la bóveda)
    const bajo = bajoBoveda(f.getBoundingClientRect());
    const alto = f.clientHeight - (bajo || 0);
    let m = eje("to bottom", alto, a, b);
    if (bajo) {
        m = m.replace(/\)$/, `, transparent ${f.clientHeight}px)`);
    }
    f.style.setProperty("-webkit-mask-image", m);
    f.style.setProperty("mask-image", m);
    if (!f.__nodusDegradado) {
        f.__nodusDegradado = true;
        const fn = () => actualizarIframe(f);
        w.addEventListener("scroll", fn, { passive: true });
        w.addEventListener("resize", fn);
        f.addEventListener("load", () => {
            f.__nodusDegradado = false;
            actualizarIframe(f);
        });
    }
}

export const nodusDegradadoService = {
    start() {
        // Un contenedor que no estaba en la lista se registra la primera vez que se desplaza
        document.addEventListener(
            "scroll",
            (ev) => {
                const el = ev.target;
                if (el && el.nodeType === 1 && !el.classList.contains(CLASE) && !el.__nodusPend) {
                    el.__nodusPend = true;
                    requestAnimationFrame(() => {
                        el.__nodusPend = false;
                        actualizar(el);
                    });
                }
            },
            { capture: true, passive: true }
        );
        let programado = false;
        const revisar = () => {
            programado = false;
            document.querySelectorAll(CANDIDATOS).forEach(actualizar);
            // Cualquier otro contenedor que hoy tenga desplazamiento
            for (const el of document.querySelectorAll("body *")) {
                if (!el.classList.contains(CLASE) && el.offsetParent !== null && el.clientHeight > 16) {
                    const info = desplazable(el);
                    if (info && (info.x || info.y)) {
                        actualizar(el);
                    }
                }
            }
            document.querySelectorAll("." + CLASE).forEach(actualizar);
            document.querySelectorAll(".o_action_manager iframe").forEach(actualizarIframe);
        };
        const pedir = () => {
            if (!programado) {
                programado = true;
                setTimeout(() => requestAnimationFrame(revisar), 120);
            }
        };
        new MutationObserver(pedir).observe(document.body, { childList: true, subtree: true });
        window.addEventListener("resize", pedir);
        pedir();
    },
};

registry.category("services").add("nodus_degradado", nodusDegradadoService);
