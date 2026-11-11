/** @odoo-module **/
// Resumen (pantalla "Ventas" de hadeon_ui): cuatro indicadores, el gráfico de
// ingresos y gastos por periodo y la actividad reciente, con datos reales de Odoo
// (modelo nodus.tablero).

import { Component, onWillStart, useState } from "@odoo/owl";
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

    verTodas() {
        this.action.doAction("point_of_sale.action_pos_pos_form");
    }
}

registry.category("actions").add("nodus_tablero_ventas", NodusTableroVentas);
