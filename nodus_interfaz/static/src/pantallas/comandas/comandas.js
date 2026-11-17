/** @odoo-module **/
// Comandas: lo que el Punto de Venta manda a cocina, barra, parrilla... en tiempo real.

import { Component, onMounted, onWillStart, onWillUnmount, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { avisoNodus, nodusApi, usePantallaNodus } from "../comun";

const UMBRAL_RETRASO_SEG = 15 * 60; // 15 min sin terminar = retrasado
const ESTACIONES_BASE = [
    { id: "cocina", nombre: "Cocina" },
    { id: "barra", nombre: "Barra" },
    { id: "parrilla", nombre: "Parrilla" },
];
const ETIQUETA = { nuevo: "Nuevo", preparando: "Preparando", retrasado: "Retrasado", listo: "Listo" };

export class NodusComandas extends Component {
    static template = "nodus_interfaz.Comandas";
    static props = ["*"];

    setup() {
        usePantallaNodus("comandas");
        this.estado = useState({
            comandas: [],
            estaciones: ESTACIONES_BASE.slice(),
            tab: "cocina",
            estacion: "todas",
            ahora: Date.now(),
            ocupadas: {},
        });
        this.desfase = 0; // diferencia entre el reloj de este equipo y el del servidor
        this.firma = "";

        onWillStart(async () => {
            try {
                const cfg = await nodusApi("/nodus/api/v1/config");
                const est = (cfg.negocio || {}).estaciones;
                if (Array.isArray(est) && est.length) this.estado.estaciones = est;
            } catch {
                // sin configuración: quedan las estaciones de siempre
            }
            await this.recargar();
        });
        onMounted(() => {
            this.reloj = setInterval(() => (this.estado.ahora = Date.now()), 1000);
            this.refresco = setInterval(() => this.recargar(), 5000);
        });
        onWillUnmount(() => {
            clearInterval(this.reloj);
            clearInterval(this.refresco);
        });
    }

    // ---------------- Datos ----------------
    async recargar() {
        try {
            const d = await nodusApi("/nodus/api/v1/comandas");
            this.desfase = (d.ahora || Date.now()) - Date.now();
            const lista = d.comandas || [];
            const firma = JSON.stringify(lista);
            if (firma === this.firma) return; // nada cambió
            this.firma = firma;
            this.estado.comandas = lista;
        } catch (err) {
            console.error("No se pudieron cargar las comandas:", err);
        }
    }

    async llamar(ruta, cuerpo) {
        try {
            return await nodusApi("/nodus/api/v1" + ruta, { method: "POST", body: cuerpo || {} });
        } catch (err) {
            avisoNodus(err.message);
            this.recargar();
            throw err;
        }
    }

    aplicar(c) {
        const lista = this.estado.comandas;
        const i = lista.findIndex((x) => x.id === c.id);
        if (i > -1) lista[i] = c;
        else lista.push(c);
        this.firma = "";
    }

    // ---------------- Cálculos ----------------
    get ahoraServidor() {
        return this.estado.ahora + this.desfase;
    }
    tiempoDe(o) {
        if (o.cancelacion) return 0;
        const fin = o.estado === "listo" && o.terminado ? o.terminado : this.ahoraServidor;
        return Math.max(0, (fin - o.iniciado) / 1000);
    }
    formato(segundos) {
        const s = Math.max(0, Math.floor(segundos));
        const dos = (n) => String(n).padStart(2, "0");
        const h = Math.floor(s / 3600);
        const mm = dos(Math.floor((s % 3600) / 60));
        // Más de una hora: h:mm:ss, para no mostrar minutos de cuatro cifras
        return h ? `${h}:${mm}:${dos(s % 60)}` : `${mm}:${dos(s % 60)}`;
    }
    estadoVisual(o) {
        if (o.estado === "listo") return "listo";
        if ((this.ahoraServidor - o.iniciado) / 1000 > UMBRAL_RETRASO_SEG) return "retrasado";
        return o.estado; // nuevo | preparando
    }
    insignia(o) {
        const vis = this.estadoVisual(o);
        return o.cancelacion && vis !== "listo" ? "Cancelado" : ETIQUETA[vis];
    }
    textoBoton(o) {
        if (this.estadoVisual(o) === "listo") return "Completado";
        if (o.cancelacion) return "Entendido";
        if (o.estado === "nuevo") return "Iniciar preparación";
        return "Marcar listo";
    }
    get activas() {
        return this.estado.comandas.filter((o) => o.estado !== "listo");
    }
    get completadas() {
        return this.estado.comandas.filter((o) => o.estado === "listo");
    }
    get filtradas() {
        const { tab, estacion } = this.estado;
        return this.estado.comandas.filter(
            (o) =>
                (tab === "cocina" ? o.estado !== "listo" : o.estado === "listo") &&
                (estacion === "todas" || o.estacion === estacion)
        );
    }
    get promedio() {
        const act = this.activas;
        if (!act.length) return "00:00";
        const total = act.reduce((acc, o) => acc + (this.ahoraServidor - o.iniciado) / 1000, 0);
        return this.formato(total / act.length);
    }

    // ---------------- Acciones ----------------
    async accion(o, cual) {
        if (this.estado.ocupadas[o.id] || (cual === "avanzar" && this.estadoVisual(o) === "listo")) return;
        this.estado.ocupadas[o.id] = true;
        try {
            this.aplicar(await this.llamar(`/comandas/${o.id}/${cual}`));
        } catch {
            // ya se avisó
        } finally {
            delete this.estado.ocupadas[o.id];
        }
    }
    async marcarItem(o, it) {
        if (o.estado === "listo") return;
        try {
            this.aplicar(await this.llamar(`/comandas/${o.id}/item/${it.id}`));
        } catch {
            // ya se avisó
        }
    }
    async marcarTodas() {
        try {
            await this.llamar("/comandas/listas", { estacion: this.estado.estacion });
            await this.recargar();
        } catch {
            // ya se avisó
        }
    }
}

registry.category("actions").add("nodus_comandas", NodusComandas);
