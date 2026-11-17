/** @odoo-module **/
// Base común de las pantallas propias de Nodus (componentes OWL, sin iframe).

import { onMounted, onWillUnmount } from "@odoo/owl";

/** Marca el cuerpo mientras la pantalla está abierta: oculta la barra de Odoo y deja la tarjeta completa. */
export function usePantallaNodus(nombre) {
    const clases = ["o_nodus_ui_activa", "o_nodus_pag_" + nombre];
    onMounted(() => document.body.classList.add(...clases));
    onWillUnmount(() => document.body.classList.remove(...clases));
}

/** Llama a la API de Nodus (`{ok, data, error}`) y devuelve `data` o lanza el mensaje del servidor. */
export async function nodusApi(ruta, { method = "GET", body } = {}) {
    let resp;
    try {
        resp = await fetch(ruta, {
            method,
            headers: { "Content-Type": "application/json" },
            body: body ? JSON.stringify(body) : undefined,
        });
    } catch {
        throw new Error("No se pudo conectar con el servidor.");
    }
    let sobre;
    try {
        sobre = await resp.json();
    } catch {
        throw new Error("No se pudo conectar con el servidor.");
    }
    if (!sobre.ok) {
        throw new Error((sobre.error && sobre.error.message) || "No se pudo completar la acción.");
    }
    return sobre.data;
}

/** Aviso flotante abajo al centro (desaparece solo). */
export function avisoNodus(texto) {
    const el = document.createElement("div");
    el.className = "nd-aviso";
    el.textContent = texto;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
}
