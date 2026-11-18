/** @odoo-module **/
// Taller: cola de órdenes arriba y un paso por vista (placa, fotos, diagnóstico, cotización, reparación, listo).
// Cada botón llama a los métodos del Taller (action_*); nada escribe el estado directamente.

import { Component, onMounted, onWillStart, onWillUnmount, useRef, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { avisoNodus, usePantallaNodus } from "@nodus_interfaz/pantallas/comun";

const MODELO = "workshop.order";
const PASOS = [
    { id: "recepcion", nombre: "Recepción" },
    { id: "fotos", nombre: "Fotos" },
    { id: "diagnostico", nombre: "Diagnóstico" },
    { id: "cotizacion", nombre: "Cotización" },
    { id: "reparacion", nombre: "En reparación" },
    { id: "listo", nombre: "Listo" },
];
const COMBUSTIBLE = [
    ["empty", "Vacío"], ["quarter", "1/4"], ["half", "1/2"], ["three_quarters", "3/4"], ["full", "Lleno"],
];
const ANGULOS = [
    ["front", "Frente"], ["rear", "Trasera"], ["left", "Lateral izquierdo"], ["right", "Lateral derecho"],
    ["trunk", "Maletero"], ["dashboard", "Tablero"],
];
const NUEVO = {
    placa: "", modelo: "", modelo_id: false, color: "", cliente: "", telefono: "", km: "", combustible: "half", falla: "",
};

export class NodusTaller extends Component {
    static template = "nodus_taller.Taller";
    static props = ["*"];

    setup() {
        usePantallaNodus("taller");
        this.orm = useService("orm");
        this.colaRef = useRef("cola");
        this.pasos = PASOS;
        this.combustibles = COMBUSTIBLE;
        this.angulos = ANGULOS;
        this.estado = useState({
            cola: [],
            seleccion: null, // id de la orden abierta; null = vehículo nuevo
            orden: null,
            paso: "recepcion",
            nuevo: { ...NUEVO },
            aviso: "",
            ocupado: false,
            modelos: [],
            servicios: [],
            elegidos: [],
            diag: { falla: "", hallazgos: "", solucion: "" },
        });
        onWillStart(async () => {
            const [modelos, servicios] = await Promise.all([
                this.orm.call(MODELO, "nodus_taller_modelos", []),
                this.orm.call(MODELO, "nodus_taller_servicios", []),
            ]);
            this.estado.modelos = modelos;
            this.estado.servicios = servicios;
            await this.cargarCola();
        });
        onMounted(() => (this.refresco = setInterval(() => this.cargarCola(), 15000)));
        onWillUnmount(() => clearInterval(this.refresco));
    }

    // ---------------- Cola ----------------
    async cargarCola() {
        try {
            this.estado.cola = await this.orm.call(MODELO, "nodus_taller_cola", []);
        } catch {
            // se reintenta en el próximo refresco
        }
    }
    // La rueda del ratón mueve la fila en horizontal; con el ratón también se puede arrastrar
    desplazarCola(ev) {
        const el = this.colaRef.el;
        if (!el || el.scrollWidth <= el.clientWidth || Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) return;
        ev.preventDefault();
        el.scrollLeft += ev.deltaY;
    }
    arrastrarCola(ev) {
        const el = this.colaRef.el;
        if (!el || ev.pointerType !== "mouse" || ev.button !== 0) return;
        const x0 = ev.clientX, s0 = el.scrollLeft;
        let movido = false;
        const mover = (e) => {
            const dx = e.clientX - x0;
            if (Math.abs(dx) > 4) { movido = true; el.classList.add("arrastrando"); }
            if (movido) el.scrollLeft = s0 - dx;
        };
        const soltar = () => {
            window.removeEventListener("pointermove", mover);
            window.removeEventListener("pointerup", soltar);
            el.classList.remove("arrastrando");
            // un arrastre no debe abrir la ficha donde se soltó
            if (movido) el.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); }, { capture: true, once: true });
        };
        window.addEventListener("pointermove", mover);
        window.addEventListener("pointerup", soltar);
    }
    nuevoVehiculo() {
        Object.assign(this.estado, { seleccion: null, orden: null, paso: "recepcion", aviso: "", elegidos: [] });
        this.estado.nuevo = { ...NUEVO };
    }
    async abrir(t) {
        await this.recargarOrden(t.id);
    }
    async recargarOrden(id) {
        const o = await this.orm.call(MODELO, "nodus_taller_orden", [[id]]);
        this.aplicarOrden(o);
        this.cargarCola();
    }
    aplicarOrden(o) {
        const e = this.estado;
        e.seleccion = o.id;
        e.orden = o;
        e.paso = o.estado === "draft" ? "recepcion" : o.paso;
        e.diag = { falla: o.falla, hallazgos: o.hallazgos, solucion: o.solucion };
        e.aviso = "";
    }
    get pasoIndice() {
        return PASOS.findIndex((p) => p.id === this.estado.paso);
    }
    get entregada() {
        return this.estado.orden && this.estado.orden.estado === "delivered";
    }

    // ---------------- Llamadas ----------------
    async ejecutar(fn) {
        if (this.estado.ocupado) return;
        this.estado.ocupado = true;
        try {
            await fn();
        } catch (err) {
            const msg = (err.data && err.data.message) || err.message || "No se pudo completar la acción.";
            avisoNodus(msg);
        } finally {
            this.estado.ocupado = false;
        }
    }
    llamarOrden(metodo, ...args) {
        return this.ejecutar(async () => {
            const o = await this.orm.call(MODELO, metodo, [[this.estado.orden.id], ...args]);
            this.aplicarOrden(o);
            this.cargarCola();
        });
    }

    // ---------------- 1. Recepción ----------------
    async buscarPlaca() {
        const n = this.estado.nuevo;
        if (!n.placa.trim()) return;
        try {
            const r = await this.orm.call(MODELO, "nodus_taller_placa", [n.placa]);
            n.placa = r.placa;
            if (!r.encontrado) {
                this.estado.aviso = "Vehículo nuevo: completa los datos.";
                return;
            }
            if (r.orden_abierta) {
                this.estado.aviso = "Este vehículo ya tiene una orden abierta.";
                return this.recargarOrden(r.orden_abierta);
            }
            Object.assign(n, { modelo: r.modelo, modelo_id: r.modelo_id, color: r.color, cliente: r.cliente, telefono: r.telefono });
            if (r.km) n.km = r.km;
            this.estado.aviso = "Vehículo conocido: datos cargados.";
        } catch (err) {
            avisoNodus((err.data && err.data.message) || err.message);
        }
    }
    cambiaModelo(ev) {
        const n = this.estado.nuevo;
        n.modelo = ev.target.value;
        const m = this.estado.modelos.find((x) => x.nombre === n.modelo);
        n.modelo_id = m ? m.id : false;
    }
    recibir() {
        return this.ejecutar(async () => {
            const id = await this.orm.call(MODELO, "nodus_taller_recibir", [{ ...this.estado.nuevo }]);
            await this.recargarOrden(id);
        });
    }

    // ---------------- 2. Fotos ----------------
    fotoDe(tipo) {
        const o = this.estado.orden;
        return o && o.fotos.find((f) => f.clave === tipo);
    }
    subirFoto(tipo, ev) {
        const archivo = ev.target.files && ev.target.files[0];
        if (!archivo) return;
        const lector = new FileReader();
        lector.onload = () =>
            this.ejecutar(async () => {
                const base64 = String(lector.result).split(",")[1];
                const o = await this.orm.call(MODELO, "nodus_taller_foto", [[this.estado.orden.id], tipo, base64]);
                this.aplicarOrden(o);
            });
        lector.readAsDataURL(archivo);
    }
    aDiagnostico() {
        return this.llamarOrden("nodus_taller_a_diagnostico");
    }

    // ---------------- 3. Diagnóstico ----------------
    get categorias() {
        const mapa = {};
        for (const s of this.estado.servicios) (mapa[s.categoria || "Servicios"] ||= []).push(s);
        return Object.entries(mapa).map(([nombre, items]) => ({ nombre, items }));
    }
    alternar(id) {
        const e = this.estado.elegidos;
        const i = e.indexOf(id);
        if (i > -1) e.splice(i, 1);
        else e.push(id);
    }
    get totalElegido() {
        return this.estado.servicios.filter((s) => this.estado.elegidos.includes(s.id)).reduce((a, s) => a + s.precio, 0);
    }
    cotizar() {
        const d = this.estado.diag;
        if (!d.hallazgos.trim() || !d.solucion.trim()) {
            avisoNodus("Escribe los hallazgos y la solución propuesta.");
            return;
        }
        return this.llamarOrden("nodus_taller_cotizar", { ...d }, [...this.estado.elegidos]);
    }

    // ---------------- 4 a 6. Cotización, reparación, listo, entrega ----------------
    aprobar() {
        return this.llamarOrden("nodus_taller_aprobar");
    }
    rechazar() {
        return this.llamarOrden("nodus_taller_rechazar");
    }
    terminar() {
        return this.llamarOrden("nodus_taller_terminar");
    }
    entregar() {
        return this.llamarOrden("nodus_taller_entregar");
    }
    dinero(n) {
        return (this.estado.orden.cotizacion ? this.estado.orden.cotizacion.moneda : "$") + Number(n || 0).toFixed(2);
    }
}

registry.category("actions").add("nodus_taller", NodusTaller);
