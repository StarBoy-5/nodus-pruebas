/** @odoo-module **/
// Resumen (pantalla "Ventas" de hadeon_ui): cuatro indicadores, el gráfico de
// ingresos y gastos por periodo y la actividad reciente, con datos reales de Odoo
// (modelo nodus.tablero).

import { Component, onMounted, onWillStart, onWillUnmount, useEffect, useRef, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

const PERIODOS = [
    { clave: "dia", nombre: "Día" },
    { clave: "semana", nombre: "Semana" },
    { clave: "mes", nombre: "Mes" },
    { clave: "anio", nombre: "Año" },
];

const DINERO = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ENTERO = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 0 });

export class NodusTableroVentas extends Component {
    static template = "nodus_interfaz.TableroVentas";
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.periodos = PERIODOS;
        this.state = useState({ periodo: "semana", datos: null, cargando: true });
        onWillStart(() => this.cargar());

        // Ventana «Ver todas las transacciones»: sale desde el botón y vuelve a él al cerrar
        this.todas = useState({ abierta: false, periodo: "dia", lista: [], cargando: false });
        this.filtros = PERIODOS.filter((p) => p.clave !== "anio");
        this.velo = useRef("veloTodas");
        this.caja = useRef("cajaTodas");
        this.rectBoton = null;
        this.animando = false;
        this.alTecla = (e) => e.key === "Escape" && this.todas.abierta && this.cerrarTodas();
        onMounted(() => document.addEventListener("keydown", this.alTecla));
        onWillUnmount(() => document.removeEventListener("keydown", this.alTecla));
        useEffect(
            (abierta) => {
                if (abierta) {
                    this.animarApertura();
                }
            },
            () => [this.todas.abierta]
        );
    }

    async cargar() {
        this.state.cargando = true;
        this.state.datos = await this.orm.call("nodus.tablero", "datos_ventas", [this.state.periodo]);
        this.state.cargando = false;
    }

    async elegir(periodo) {
        if (periodo !== this.state.periodo) {
            this.state.periodo = periodo;
            await this.cargar();
        }
    }

    dinero(valor) {
        return "$" + DINERO.format(valor || 0);
    }

    entero(valor) {
        return ENTERO.format(valor || 0);
    }

    tendencia(valor) {
        const v = valor || 0;
        return {
            texto: Math.abs(v).toFixed(1) + "%",
            clase: v > 0 ? "o_nodus_tend_sube" : v < 0 ? "o_nodus_tend_baja" : "o_nodus_tend_igual",
            flecha: v > 0 ? "↗" : v < 0 ? "↘" : "→",
        };
    }

    /** Escala del eje del gráfico: tope redondo y cuatro divisiones, como $100k / $75k / … */
    get escala() {
        const serie = this.state.datos?.serie || [];
        const maximo = Math.max(0, ...serie.map((p) => Math.max(p.ingresos, p.gastos)));
        if (!maximo) {
            return { tope: 4, marcas: [4, 3, 2, 1, 0] };
        }
        const potencia = 10 ** Math.floor(Math.log10(maximo));
        const paso = [1, 2, 2.5, 5, 10].map((f) => f * potencia).find((p) => p * 4 >= maximo);
        return { tope: paso * 4, marcas: [4, 3, 2, 1, 0].map((i) => paso * i) };
    }

    etiquetaEje(valor) {
        if (valor >= 1000000) {
            return "$" + (valor / 1000000).toFixed(valor % 1000000 ? 1 : 0) + "M";
        }
        if (valor >= 1000) {
            return "$" + (valor / 1000).toFixed(valor % 1000 ? 1 : 0) + "k";
        }
        return "$" + this.entero(valor);
    }

    alto(valor) {
        return Math.max(0, Math.min(100, ((valor || 0) / this.escala.tope) * 100)) + "%";
    }

    fecha(texto) {
        if (!texto) {
            return "";
        }
        const f = new Date(texto.replace(" ", "T") + "Z");
        return f.toLocaleString("es-VE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    }

    abrir(evento) {
        this.action.doAction({
            type: "ir.actions.act_window",
            res_model: evento.modelo,
            res_id: evento.id,
            views: [[false, "form"]],
        });
    }

    /** Posición y tamaño del botón, para que la ventana crezca desde él y vuelva a él. */
    transformDesdeBoton() {
        const rb = this.rectBoton;
        const rm = this.caja.el.getBoundingClientRect();
        const dx = rb.left + rb.width / 2 - (rm.left + rm.width / 2);
        const dy = rb.top + rb.height / 2 - (rm.top + rm.height / 2);
        return `translate(${dx}px, ${dy}px) scale(${rb.width / rm.width}, ${rb.height / rm.height})`;
    }

    async cargarTodas() {
        this.todas.cargando = true;
        this.todas.lista = await this.orm.call("nodus.tablero", "actividad_completa", [this.todas.periodo]);
        this.todas.cargando = false;
    }

    async verTodas(ev) {
        if (this.animando) {
            return;
        }
        this.rectBoton = ev.currentTarget.getBoundingClientRect();
        this.todas.periodo = "dia";
        this.todas.lista = [];
        this.todas.abierta = true;
        await this.cargarTodas();
    }

    animarApertura() {
        const velo = this.velo.el;
        const caja = this.caja.el;
        if (!velo || !caja) {
            return;
        }
        this.animando = true;
        velo.style.transition = "none";
        velo.style.opacity = "0";
        caja.style.transition = "none";
        caja.style.transform = this.transformDesdeBoton();
        caja.style.opacity = "0";
        requestAnimationFrame(() =>
            requestAnimationFrame(() => {
                velo.style.transition = "opacity .3s ease";
                velo.style.opacity = "1";
                caja.style.transition = "transform .4s cubic-bezier(0.16, 1, 0.3, 1), opacity .25s ease";
                caja.style.transform = "translate(0, 0) scale(1, 1)";
                caja.style.opacity = "1";
                setTimeout(() => (this.animando = false), 400);
            })
        );
    }

    cerrarTodas() {
        if (this.animando || !this.caja.el) {
            return;
        }
        this.animando = true;
        this.velo.el.style.transition = "opacity .3s ease";
        this.velo.el.style.opacity = "0";
        this.caja.el.style.transition = "transform .35s cubic-bezier(0.4, 0, 1, 1), opacity .25s ease";
        this.caja.el.style.transform = this.transformDesdeBoton();
        this.caja.el.style.opacity = "0";
        setTimeout(() => {
            this.todas.abierta = false;
            this.animando = false;
        }, 350);
    }

    async filtrarTodas(periodo) {
        if (periodo !== this.todas.periodo) {
            this.todas.periodo = periodo;
            await this.cargarTodas();
        }
    }

    abrirDesdeTodas(evento) {
        this.todas.abierta = false;
        this.abrir(evento);
    }
}

registry.category("actions").add("nodus_tablero_ventas", NodusTableroVentas);
