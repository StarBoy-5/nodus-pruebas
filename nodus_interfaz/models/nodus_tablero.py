# Copyright 2026 Hadeon
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
"""Datos del tablero de Ventas (pantalla Ventas de hadeon_ui).

Todo sale de Odoo, con los permisos del usuario que mira el tablero:
- Ingresos: pedidos del POS cobrados y facturas de cliente publicadas que no
  vienen del POS (así una venta del POS facturada no se cuenta dos veces).
- Gastos: facturas de proveedor publicadas.
- Tasa BCV: la del dólar que carga hadeon_bcv_currency.
Los montos se guardan en la moneda de la empresa (Bs) y se muestran en dólares
con la tasa del día, como en hadeon_ui.
"""
from datetime import datetime, time, timedelta

from dateutil.relativedelta import relativedelta

from odoo import _, api, fields, models
from odoo.exceptions import AccessError

ESTADOS_POS = ("paid", "done", "invoiced")
MESES = ("Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic")
DIAS = ("Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom")


class NodusTablero(models.AbstractModel):
    _name = "nodus.tablero"
    _description = "Tablero de Ventas de Nodus"

    # ------------------------------------------------------------------ fechas
    @api.model
    def _nodus_rangos(self, periodo, hoy):
        """Intervalos del gráfico y del periodo anterior (para la tendencia)."""
        if periodo == "dia":
            ini = datetime.combine(hoy, time.min)
            cortes = [(ini + timedelta(hours=h), ini + timedelta(hours=h + 3), f"{h:02d}h") for h in range(0, 24, 3)]
            anterior = (ini - timedelta(days=1), ini)
        elif periodo == "mes":
            ini = datetime.combine(hoy.replace(day=1), time.min)
            fin_mes = ini + relativedelta(months=1)
            cortes, desde, n = [], ini, 1
            while desde < fin_mes:
                hasta = min(desde + timedelta(days=7), fin_mes)
                cortes.append((desde, hasta, f"Sem {n}"))
                desde, n = hasta, n + 1
            anterior = (ini - relativedelta(months=1), ini)
        elif periodo == "anio":
            ini = datetime.combine(hoy.replace(month=1, day=1), time.min)
            cortes = [(ini + relativedelta(months=i), ini + relativedelta(months=i + 1), MESES[i]) for i in range(12)]
            anterior = (ini - relativedelta(years=1), ini)
        else:  # semana
            lunes = hoy - timedelta(days=hoy.weekday())
            ini = datetime.combine(lunes, time.min)
            cortes = [(ini + timedelta(days=i), ini + timedelta(days=i + 1), DIAS[i]) for i in range(7)]
            anterior = (ini - timedelta(days=7), ini)
        return cortes, anterior

    # ------------------------------------------------------------------ lecturas
    @api.model
    def _nodus_leer(self, modelo, dominio, campos, **kw):
        """search_read que devuelve [] si el modelo no existe o el usuario no tiene acceso."""
        if modelo not in self.env:
            return []
        try:
            return self.env[modelo].search_read(dominio, campos, **kw)
        except AccessError:
            return []

    @api.model
    def _nodus_movimientos(self, desde, hasta):
        """Ingresos y gastos (en moneda de la empresa) y tickets del POS entre dos fechas."""
        d, h = fields.Datetime.to_string(desde), fields.Datetime.to_string(hasta)
        pos = self._nodus_leer("pos.order", [("state", "in", ESTADOS_POS), ("date_order", ">=", d), ("date_order", "<", h)],
                               ["date_order", "amount_total"])
        facturas = self._nodus_leer("account.move", [
            ("state", "=", "posted"), ("move_type", "in", ("out_invoice", "out_refund")),
            ("invoice_date", ">=", desde.date()), ("invoice_date", "<", hasta.date() if hasta.time() == time.min else hasta.date() + timedelta(days=1)),
            *([("pos_order_ids", "=", False)] if "pos_order_ids" in self.env["account.move"]._fields else []),
        ], ["invoice_date", "amount_total_signed"])
        compras = self._nodus_leer("account.move", [
            ("state", "=", "posted"), ("move_type", "in", ("in_invoice", "in_refund")),
            ("invoice_date", ">=", desde.date()), ("invoice_date", "<", hasta.date() if hasta.time() == time.min else hasta.date() + timedelta(days=1)),
        ], ["invoice_date", "amount_total_signed"])
        return pos, facturas, compras

    @api.model
    def _nodus_tasa_bcv(self):
        """Bolívares por dólar hoy y ayer (0 si no hay tasa cargada)."""
        empresa = self.env.company
        usd = self.env.ref("base.USD", raise_if_not_found=False)
        if not usd or empresa.currency_id == usd:
            return 0.0, 0.0
        hoy = fields.Date.context_today(self)
        actual = usd._get_conversion_rate(usd, empresa.currency_id, empresa, hoy)
        ayer = usd._get_conversion_rate(usd, empresa.currency_id, empresa, hoy - timedelta(days=1))
        return actual, ayer

    @staticmethod
    def _nodus_tendencia(actual, anterior):
        if not anterior:
            return 0.0 if not actual else 100.0
        return round((actual - anterior) / abs(anterior) * 100, 1)

    # ------------------------------------------------------------------ API para la pantalla
    @api.model
    def datos_ventas(self, periodo="semana"):
        hoy = fields.Date.context_today(self)
        cortes, (ant_ini, ant_fin) = self._nodus_rangos(periodo, hoy)
        ini, fin = cortes[0][0], cortes[-1][1]
        tasa, tasa_ayer = self._nodus_tasa_bcv()
        a_usd = (lambda monto: monto / tasa) if tasa else (lambda monto: monto)

        pos, facturas, compras = self._nodus_movimientos(ini, fin)
        pos_ant, fac_ant, _com_ant = self._nodus_movimientos(ant_ini, ant_fin)

        def fecha_de(registro):
            valor = registro.get("date_order") or registro.get("invoice_date")
            return fields.Datetime.to_datetime(valor) if isinstance(valor, str) else datetime.combine(valor, time.min) if not isinstance(valor, datetime) else valor

        serie = []
        for desde, hasta, etiqueta in cortes:
            ingresos = sum(p["amount_total"] for p in pos if desde <= fecha_de(p) < hasta)
            ingresos += sum(f["amount_total_signed"] for f in facturas if desde <= fecha_de(f) < hasta)
            gastos = -sum(c["amount_total_signed"] for c in compras if desde <= fecha_de(c) < hasta)
            serie.append({"etiqueta": etiqueta, "ingresos": round(a_usd(ingresos), 2), "gastos": round(a_usd(gastos), 2)})

        total = sum(p["amount_total"] for p in pos) + sum(f["amount_total_signed"] for f in facturas)
        total_ant = sum(p["amount_total"] for p in pos_ant) + sum(f["amount_total_signed"] for f in fac_ant)
        tickets, tickets_ant = len(pos), len(pos_ant)
        promedio = (sum(p["amount_total"] for p in pos) / tickets) if tickets else 0.0
        promedio_ant = (sum(p["amount_total"] for p in pos_ant) / tickets_ant) if tickets_ant else 0.0

        return {
            "moneda_empresa": self.env.company.currency_id.symbol or "",
            "con_tasa": bool(tasa),
            "kpis": {
                "ventas": {"valor": round(a_usd(total), 2), "bs": round(total, 2), "tendencia": self._nodus_tendencia(total, total_ant)},
                "tickets": {"valor": tickets, "tendencia": self._nodus_tendencia(tickets, tickets_ant)},
                "promedio": {"valor": round(a_usd(promedio), 2), "tendencia": self._nodus_tendencia(promedio, promedio_ant)},
                "tasa": {"valor": round(tasa, 2), "tendencia": self._nodus_tendencia(tasa, tasa_ayer)},
            },
            "serie": serie,
            "actividad": self._nodus_actividad(a_usd),
        }

    @api.model
    def _nodus_actividad(self, a_usd, limite=5, desde=None):
        """Últimos movimientos (desde una fecha, si se pide): ventas del POS y facturas de cliente o proveedor."""
        eventos = []
        for p in self._nodus_leer("pos.order", [("state", "in", ESTADOS_POS)] + ([("date_order", ">=", desde)] if desde else []), ["name", "partner_id", "date_order", "amount_total", "state"],
                                  order="date_order desc", limit=limite):
            eventos.append({"tipo": "ingreso", "titulo": p["partner_id"][1] if p["partner_id"] else p["name"],
                            "fecha": fields.Datetime.to_string(p["date_order"]) if not isinstance(p["date_order"], str) else p["date_order"],
                            "monto": round(a_usd(p["amount_total"]), 2), "estado": _("Cobrado"),
                            "modelo": "pos.order", "id": p["id"]})
        for m in self._nodus_leer("account.move", [("state", "=", "posted"), ("move_type", "in", ("out_invoice", "in_invoice"))] + ([("create_date", ">=", desde)] if desde else [])
                                  + ([("pos_order_ids", "=", False)] if "pos_order_ids" in self.env["account.move"]._fields else []),  # una venta del POS facturada ya cuenta como cobro
                                  ["name", "partner_id", "create_date", "amount_total_signed", "move_type", "payment_state"],
                                  order="create_date desc", limit=limite):
            ingreso = m["move_type"] == "out_invoice"
            eventos.append({"tipo": "ingreso" if ingreso else "egreso",
                            "titulo": m["partner_id"][1] if m["partner_id"] else m["name"],
                            "fecha": m["create_date"] if isinstance(m["create_date"], str) else fields.Datetime.to_string(m["create_date"]),
                            "monto": round(a_usd(abs(m["amount_total_signed"])), 2),
                            "estado": _("Pagada") if m["payment_state"] in ("paid", "in_payment") else _("Por cobrar") if ingreso else _("Por pagar"),
                            "modelo": "account.move", "id": m["id"]})
        eventos.sort(key=lambda e: e["fecha"], reverse=True)
        return eventos[:limite]

    @api.model
    def actividad_completa(self, periodo="dia"):
        """Todos los movimientos del día, la semana o el mes (ventana «Ver todas las transacciones»)."""
        hoy = fields.Date.context_today(self)
        dias = {"dia": 0, "semana": 6, "mes": 29}.get(periodo, 0)
        desde = fields.Datetime.to_string(datetime.combine(hoy - timedelta(days=dias), time.min))
        tasa, _ayer = self._nodus_tasa_bcv()
        a_usd = (lambda monto: monto / tasa) if tasa else (lambda monto: monto)
        return self._nodus_actividad(a_usd, limite=200, desde=desde)
