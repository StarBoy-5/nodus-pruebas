/** @odoo-module **/
// Cambia la palabra "Odoo" por "Nodus" en los textos que se ven en pantalla
// (descripciones de aplicaciones, mensajes del bot, ayudas, etc.).

import { registry } from "@web/core/registry";

const PATRON = /\bodoo\b/gi;
// Respeta mayúsculas: odoo -> nodus, Odoo -> Nodus, ODOO -> NODUS
const CAMBIO = (m) => (m === "ODOO" ? "NODUS" : m[0] === "o" ? "nodus" : "Nodus");
const OMITIR = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "CODE", "PRE"]);

function cambiarAtributos(el) {
    if (!el || !el.getAttribute) {
        return;
    }
    for (const atributo of ["placeholder", "title"]) {
        const valor = el.getAttribute(atributo);
        if (valor && valor.toLowerCase().includes("odoo")) {
            const nuevo = valor.replace(/\bodoo\b/gi, CAMBIO);
            if (nuevo !== valor) {
                el.setAttribute(atributo, nuevo);
            }
        }
    }
}

function cambiarTextos(raiz) {
    if (!raiz || !raiz.nodeType) {
        return;
    }
    if (raiz.nodeType === Node.TEXT_NODE) {
        if (PATRON.test(raiz.data) && !OMITIR.has(raiz.parentElement?.tagName)) {
            PATRON.lastIndex = 0;
            raiz.data = raiz.data.replace(PATRON, CAMBIO);
        }
        PATRON.lastIndex = 0;
        return;
    }
    if (raiz.nodeType === Node.ELEMENT_NODE && (raiz.tagName === "INPUT" || raiz.tagName === "TEXTAREA")) {
        cambiarAtributos(raiz);  // el campo en sí no se toca, solo su texto de ejemplo
        return;
    }
    if (raiz.nodeType !== Node.ELEMENT_NODE || OMITIR.has(raiz.tagName) || raiz.isContentEditable) {
        return;
    }
    cambiarAtributos(raiz);
    raiz.querySelectorAll("[placeholder], [title]").forEach(cambiarAtributos);
    const recorrido = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    const nodos = [];
    while (recorrido.nextNode()) {
        nodos.push(recorrido.currentNode);
    }
    for (const nodo of nodos) {
        cambiarTextos(nodo);
    }
}

export const nodusTextoService = {
    start() {
        let pendientes = new Set();
        let programado = false;
        const procesar = () => {
            programado = false;
            const lista = pendientes;
            pendientes = new Set();
            for (const nodo of lista) {
                if (nodo.isConnected) {
                    cambiarTextos(nodo);
                }
            }
            // Textos de ejemplo que entraron sin aviso (Owl los pone al crear el campo)
            document.querySelectorAll('[placeholder*="odoo" i], [title*="odoo" i]').forEach(cambiarAtributos);
        };
        const observador = new MutationObserver((cambios) => {
            for (const cambio of cambios) {
                if (cambio.type === "attributes") {
                    cambiarAtributos(cambio.target);
                } else if (cambio.type === "characterData") {
                    pendientes.add(cambio.target);
                } else {
                    cambio.addedNodes.forEach((n) => pendientes.add(n));
                }
            }
            if (!programado && pendientes.size) {
                programado = true;
                requestAnimationFrame(procesar);
            }
        });
        // Respaldo: algunos campos ponen su texto de ejemplo sin que el observador lo vea
        setInterval(() => {
            document.querySelectorAll('[placeholder*="odoo" i], [title*="odoo" i]').forEach(cambiarAtributos);
        }, 1000);
        observador.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "title"] });
        cambiarTextos(document.body);
    },
};

registry.category("services").add("nodus_texto", nodusTextoService);
