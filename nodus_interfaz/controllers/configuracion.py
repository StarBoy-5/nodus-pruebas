# Copyright 2026 Hadeon
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
"""API de la pantalla Configuración de hadeon_ui, sobre los datos de Odoo.

Las rutas /nodus/api/v1/... devuelven el mismo sobre {"ok": true, "data": ...} que usa el
JavaScript de la pantalla. Solo el administrador de la empresa (o soporte) puede escribir;
las escrituras usan sudo porque el negocio no tiene permisos de administración de Odoo:
la regla de quién puede hacerlo la aplica este controlador.

Dónde se guarda cada cosa:
- Empresa: ficha de la compañía.  - Usuarios: res.users con un grupo de rol de Nodus.
- Punto de Venta / Comandas: parámetros nodus.cfg.* (propinas, mesas, estaciones, banderas).
- Contabilidad: diarios, plan de cuentas, mes fiscal de la compañía y umbral de vencimiento.
- Facturación y pagos: métodos de pago del POS, impuestos, impresora fiscal si está instalada.
"""
import base64
import calendar
import json
import logging

from odoo import http
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.http import request

_logger = logging.getLogger(__name__)

ROLES = ("admin", "supervisor", "contador", "cajero", "mesero")
PREFIJO = "nodus.cfg."
TIPOS_CUENTA = {
    "activo corriente": "asset_current", "banco": "asset_cash", "caja": "asset_cash", "banco y caja": "asset_cash",
    "por cobrar": "asset_receivable", "activo no corriente": "asset_non_current", "activo fijo": "asset_fixed",
    "pasivo corriente": "liability_current", "por pagar": "liability_payable", "pasivo no corriente": "liability_non_current",
    "patrimonio": "equity", "ingreso": "income", "ingreso otro": "income_other", "costo": "expense_direct_cost", "gasto": "expense",
}


def cuerpo():
    return json.loads(request.httprequest.data or b"{}")


def ok(datos=None):
    return request.make_json_response({"ok": True, "data": datos if datos is not None else {}})


def fallo(codigo, mensaje, estado=400):
    return request.make_json_response({"ok": False, "error": {"code": codigo, "message": mensaje}}, status=estado)


def mensaje_de(e, por_defecto):
    return e.args[0] if e.args and isinstance(e.args[0], str) else por_defecto


class NodusConfiguracionAPI(http.Controller):

    # ------------------------------------------------------------------ utilidades
    def _es_admin(self):
        u = request.env.user
        return u._is_admin() or u.has_group("nodus_interfaz.group_nodus_soporte") or u.has_group("nodus_interfaz.group_nodus_admin")

    def _exigir_admin(self):
        if not self._es_admin():
            return fallo("SIN_PERMISO", "Solo el administrador de la empresa puede cambiar esto.", 403)
        return None

    def _param(self, clave, defecto=""):
        return request.env["ir.config_parameter"].sudo().get_param(PREFIJO + clave, defecto)

    def _poner_param(self, clave, valor):
        request.env["ir.config_parameter"].sudo().set_param(PREFIJO + clave, valor)

    def _param_json(self, clave, defecto):
        crudo = self._param(clave)
        if not crudo:
            return defecto
        try:
            valor = json.loads(crudo)
        except ValueError:
            return defecto
        return valor if isinstance(valor, list) else defecto

    def _rol_de(self, user):
        for rol in ROLES:
            if user.has_group(f"nodus_interfaz.group_nodus_{rol}"):
                return rol
        return "cajero"

    def _empresa(self):
        return request.env.company.sudo()

    # ------------------------------------------------------------------ sesión y configuración general
    @http.route("/nodus/api/v1/sesion", type="http", auth="user", methods=["GET"], csrf=False)
    def sesion(self, **kw):
        u = request.env.user
        roles = [r for r in ROLES if u.has_group(f"nodus_interfaz.group_nodus_{r}")]
        return ok({"autenticado": True, "csrf_token": "", "usuario": {"id": u.id, "nombre": u.name, "login": u.login, "roles": roles or ["cajero"]}})

    @http.route("/nodus/api/v1/config", type="http", auth="user", methods=["GET"], csrf=False)
    def config(self, **kw):
        e = self._empresa()
        return ok({
            "empresa": {
                "nombre": e.name or "", "razon_social": e.name or "", "rif": e.vat or "", "direccion": e.street or "",
                "telefono": e.phone or "", "tiene_logo": bool(e.logo), "moneda": e.currency_id.name,
                "logo_url": f"/web/image/res.company/{e.id}/logo?unique={e.write_date.timestamp() if e.write_date else 0}" if e.logo else "",
            },
            "negocio": {
                "usa_propina": self._param("usa_propina", "0") == "1", "punto_unico": self._param("punto_unico", "0") == "1",
                "moneda_pos": self._param("moneda_pos", "ambos"),
                "propinas": self._param_json("propinas", [5, 10, 15]),
                "mesas": self._param_json("mesas", [{"id": "mesa-1", "nombre": "Mesa 1"}, {"id": "mesa-2", "nombre": "Mesa 2"}, {"id": "mesa-3", "nombre": "Mesa 3"}]),
                "estaciones": self._param_json("estaciones", [{"id": "cocina", "nombre": "Cocina"}, {"id": "barra", "nombre": "Barra"}, {"id": "parrilla", "nombre": "Parrilla"}]),
            },
        })

    @http.route("/nodus/api/v1/config/negocio", type="http", auth="user", methods=["POST"], csrf=False)
    def config_negocio(self, **kw):
        if (error := self._exigir_admin()):
            return error
        d = cuerpo()
        for clave in ("usa_propina", "punto_unico"):
            if clave in d:
                self._poner_param(clave, "1" if d[clave] else "0")
        if d.get("moneda_pos") in ("usd", "bs", "ambos"):
            self._poner_param("moneda_pos", d["moneda_pos"])
        for clave in ("propinas", "mesas", "estaciones"):
            if clave in d and isinstance(d[clave], list):
                self._poner_param(clave, json.dumps(d[clave]))
        return ok()

    @http.route("/nodus/api/v1/config/empresa", type="http", auth="user", methods=["POST"], csrf=False)
    def config_empresa(self, **kw):
        if (error := self._exigir_admin()):
            return error
        d = cuerpo()
        vals = {}
        if (d.get("razon_social") or "").strip():
            vals["name"] = d["razon_social"].strip()
        for origen, destino in (("rif", "vat"), ("telefono", "phone"), ("direccion", "street")):
            if origen in d:
                vals[destino] = (d[origen] or "").strip() or False
        if d.get("logo"):
            try:
                base64.b64decode(d["logo"], validate=True)
            except Exception:
                return fallo("LOGO_INVALIDO", "No se pudo leer la imagen del logo.")
            vals["logo"] = d["logo"]
        try:
            with request.env.cr.savepoint():
                self._empresa().write(vals)
        except (ValidationError, UserError) as e:
            return fallo("NO_GUARDADO", mensaje_de(e, "No se pudieron guardar los datos."))
        return ok()

    # ------------------------------------------------------------------ usuarios
    def _usuarios(self):
        Usuario = request.env["res.users"].sudo().with_context(active_test=False)
        soporte = request.env.ref("nodus_interfaz.group_nodus_soporte").sudo()
        campo = "group_ids" if "group_ids" in Usuario._fields else "groups_id"
        todos = Usuario.search([("share", "=", False), ("id", "!=", request.env.ref("base.user_root").id)], order="name")
        return todos.filtered(lambda u: soporte not in u[campo])

    def _maximo_usuarios(self):
        try:
            return int(request.env["ir.config_parameter"].sudo().get_param("nodus.max_users", "8"))
        except ValueError:
            return 8

    @http.route("/nodus/api/v1/usuarios", type="http", auth="user", methods=["GET"], csrf=False)
    def usuarios(self, **kw):
        if (error := self._exigir_admin()):
            return error
        lista = self._usuarios()
        return ok({
            "usuarios": [{"id": u.id, "nombre": u.name, "login": u.login, "rol": self._rol_de(u), "activo": u.active,
                          "esTuUsuario": u.id == request.env.uid} for u in lista],
            "cupo": {"usados": len(lista.filtered("active")), "maximo": self._maximo_usuarios()},
        })

    def _poner_rol(self, user, rol):
        campo = "group_ids" if "group_ids" in user._fields else "groups_id"
        quitar = [request.env.ref(f"nodus_interfaz.group_nodus_{r}").id for r in ROLES]
        user[campo] = [(3, g) for g in quitar] + [(4, request.env.ref(f"nodus_interfaz.group_nodus_{rol}").id)]

    def _admins_activos(self):
        return len([u for u in self._usuarios() if u.active and self._rol_de(u) == "admin"])

    @http.route("/nodus/api/v1/usuarios", type="http", auth="user", methods=["POST"], csrf=False)
    def crear_usuario(self, **kw):
        if (error := self._exigir_admin()):
            return error
        d = cuerpo()
        nombre, correo, rol = (d.get("nombre") or "").strip(), (d.get("correo") or "").strip().lower(), d.get("rol")
        if not nombre or "@" not in correo or rol not in ROLES:
            return fallo("DATOS_INVALIDOS", "Escribe el nombre, un correo válido y elige el rol.")
        Usuario = request.env["res.users"].sudo().with_context(active_test=False)
        if Usuario.search_count([("login", "=ilike", correo)]):
            return fallo("LOGIN_EXISTE", "Ya existe un usuario con ese correo.")
        if len(self._usuarios().filtered("active")) >= self._maximo_usuarios():
            return fallo("LIMITE_USUARIOS", "Alcanzaste el cupo de usuarios de tu plan.")
        try:
            with request.env.cr.savepoint():
                empresa = self._empresa()
                usuario = Usuario.create({"name": nombre, "login": correo, "email": correo,
                                          "company_id": empresa.id, "company_ids": [(6, 0, [empresa.id])]})
                self._poner_rol(usuario, rol)
        except (ValidationError, UserError) as e:
            return fallo("NO_GUARDADO", mensaje_de(e, "No se pudo crear el usuario."))
        self._invitar(usuario)
        return ok({"id": usuario.id})

    def _invitar(self, usuario):
        """Envía el correo para que la persona elija su contraseña (si el correo no está
        configurado en el servidor, el usuario queda creado y soporte le da el acceso)."""
        try:
            with request.env.cr.savepoint():
                usuario.sudo().action_reset_password()
        except Exception:
            _logger.warning("No se pudo enviar la invitación a %s", usuario.login, exc_info=True)

    @http.route("/nodus/api/v1/usuarios/<int:uid>/rol", type="http", auth="user", methods=["POST"], csrf=False)
    def usuario_rol(self, uid, **kw):
        if (error := self._exigir_admin()):
            return error
        rol = cuerpo().get("rol")
        usuario = self._usuarios().filtered(lambda u: u.id == uid)
        if rol not in ROLES:
            return fallo("ROL_INVALIDO", "Ese rol no existe.")
        if not usuario:
            return fallo("NO_ENCONTRADO", "Usuario no encontrado.", 404)
        if usuario.id == request.env.uid and rol != "admin" and self._rol_de(usuario) == "admin":
            return fallo("AUTO_DEGRADACION", "No puedes quitarte tu propio rol de Administrador.")
        if self._rol_de(usuario) == "admin" and rol != "admin" and usuario.active and self._admins_activos() <= 1:
            return fallo("ULTIMO_ADMIN", "No puedes dejar la empresa sin administrador.")
        self._poner_rol(usuario, rol)
        return ok()

    @http.route("/nodus/api/v1/usuarios/<int:uid>/estado", type="http", auth="user", methods=["POST"], csrf=False)
    def usuario_estado(self, uid, **kw):
        if (error := self._exigir_admin()):
            return error
        activo = bool(cuerpo().get("activo"))
        usuario = self._usuarios().filtered(lambda u: u.id == uid)
        if not usuario:
            return fallo("NO_ENCONTRADO", "Usuario no encontrado.", 404)
        if not activo and usuario.id == request.env.uid:
            return fallo("AUTO_DESACTIVACION", "No puedes desactivar tu propia cuenta.")
        if not activo and self._rol_de(usuario) == "admin" and self._admins_activos() <= 1:
            return fallo("ULTIMO_ADMIN", "No puedes desactivar al único administrador.")
        if activo and not usuario.active and len(self._usuarios().filtered("active")) >= self._maximo_usuarios():
            return fallo("LIMITE_USUARIOS", "No hay cupo para reactivar este usuario.")
        usuario.active = activo
        return ok()

    @http.route("/nodus/api/v1/usuarios/<int:uid>/invitacion", type="http", auth="user", methods=["POST"], csrf=False)
    def usuario_invitacion(self, uid, **kw):
        if (error := self._exigir_admin()):
            return error
        usuario = self._usuarios().filtered(lambda u: u.id == uid and u.active)
        if not usuario:
            return fallo("NO_ENCONTRADO", "Usuario no encontrado.", 404)
        self._invitar(usuario)
        return ok()

    # ------------------------------------------------------------------ contabilidad
    @http.route("/nodus/api/v1/contabilidad", type="http", auth="user", methods=["GET"], csrf=False)
    def contabilidad(self, **kw):
        e = self._empresa()
        try:
            ultimo = int(e.fiscalyear_last_month or 12)
        except ValueError:
            ultimo = 12
        diarios = request.env["account.journal"].sudo().search([("company_id", "=", e.id)])
        # Los diarios que el sistema usa por dentro (diferencias de cambio, impuestos, Punto de Venta) no se muestran
        del_sistema = e.currency_exchange_journal_id | e.tax_cash_basis_journal_id
        if "journal_id" in request.env["pos.config"]._fields:
            del_sistema |= request.env["pos.config"].sudo().with_context(active_test=False).search([]).mapped("journal_id")
        diarios -= del_sistema
        return ok({
            "umbral_dias": int(self._param("conta_umbral_dias", "5") or 5),
            "mes_fiscal": 1 if ultimo == 12 else ultimo + 1,
            "num_cuentas": request.env["account.account"].sudo().search_count([]),
            "diarios": [{"id": j.id, "nombre": j.name, "tipo": j.type} for j in diarios],
        })

    @http.route("/nodus/api/v1/contabilidad", type="http", auth="user", methods=["POST"], csrf=False)
    def contabilidad_guardar(self, **kw):
        if (error := self._exigir_admin()):
            return error
        d = cuerpo()
        try:
            dias = int(d.get("umbral_dias"))
            mes = int(d.get("mes_fiscal"))
        except (TypeError, ValueError):
            return fallo("DATOS_INVALIDOS", "Revisa los días y el mes.")
        if not (1 <= dias <= 30 and 1 <= mes <= 12):
            return fallo("DATOS_INVALIDOS", "Los días van de 1 a 30 y el mes de 1 a 12.")
        self._poner_param("conta_umbral_dias", str(dias))
        ultimo = 12 if mes == 1 else mes - 1
        try:
            with request.env.cr.savepoint():
                self._empresa().write({"fiscalyear_last_month": str(ultimo),
                                       "fiscalyear_last_day": calendar.monthrange(2025, ultimo)[1]})
        except (ValidationError, UserError, ValueError) as e:
            return fallo("NO_GUARDADO", mensaje_de(e, "No se pudo guardar el mes fiscal."))
        return ok()

    @http.route("/nodus/api/v1/diarios", type="http", auth="user", methods=["POST"], csrf=False)
    def diario_crear(self, **kw):
        if (error := self._exigir_admin()):
            return error
        nombre = (cuerpo().get("nombre") or "").strip()
        if not nombre:
            return fallo("DATOS_INVALIDOS", "Escribe el nombre del diario.")
        Diario = request.env["account.journal"].sudo()
        base = "".join(c for c in nombre.upper() if c.isalnum())[:3] or "DIA"
        codigo, n = base, 1
        while Diario.search_count([("code", "=", codigo), ("company_id", "=", self._empresa().id)]):
            n += 1
            codigo = f"{base}{n}"
        try:
            with request.env.cr.savepoint():
                diario = Diario.create({"name": nombre, "code": codigo, "type": "general", "company_id": self._empresa().id})
        except (ValidationError, UserError) as e:
            return fallo("NO_GUARDADO", mensaje_de(e, "No se pudo crear el diario."))
        return ok({"id": diario.id})

    @http.route("/nodus/api/v1/diarios/<int:jid>/renombrar", type="http", auth="user", methods=["POST"], csrf=False)
    def diario_renombrar(self, jid, **kw):
        if (error := self._exigir_admin()):
            return error
        nombre = (cuerpo().get("nombre") or "").strip()
        diario = request.env["account.journal"].sudo().browse(jid).exists()
        if not diario or not nombre:
            return fallo("DATOS_INVALIDOS", "Escribe el nombre del diario.")
        diario.name = nombre
        return ok()

    @http.route("/nodus/api/v1/diarios/<int:jid>/eliminar", type="http", auth="user", methods=["POST"], csrf=False)
    def diario_eliminar(self, jid, **kw):
        if (error := self._exigir_admin()):
            return error
        diario = request.env["account.journal"].sudo().browse(jid).exists()
        if not diario:
            return ok()
        try:
            with request.env.cr.savepoint():
                diario.unlink()
        except Exception:
            diario.active = False
            return ok({"archivado": True})
        return ok({"eliminado": True})

    @http.route("/nodus/api/v1/plan-cuentas", type="http", auth="user", methods=["POST"], csrf=False)
    def plan_cuentas(self, **kw):
        """Crea o actualiza cuentas desde las filas del CSV: codigo, nombre, tipo."""
        if (error := self._exigir_admin()):
            return error
        filas = cuerpo().get("filas") or []
        Cuenta = request.env["account.account"].sudo()
        creadas = actualizadas = 0
        errores = []
        for n, f in enumerate(filas, start=2):
            codigo, nombre = str(f.get("codigo") or "").strip(), str(f.get("nombre") or "").strip()
            tipo = TIPOS_CUENTA.get(str(f.get("tipo") or "").strip().lower())
            if not codigo or not nombre:
                errores.append(f"Fila {n}: falta el código o el nombre.")
                continue
            try:
                with request.env.cr.savepoint():
                    existente = Cuenta.search([("code", "=", codigo)], limit=1)
                    if existente:
                        existente.name = nombre
                        if tipo:
                            existente.account_type = tipo
                        actualizadas += 1
                    elif not tipo:
                        errores.append(f"Fila {n}: el tipo «{f.get('tipo') or ''}» no es válido.")
                    else:
                        Cuenta.create({"code": codigo, "name": nombre, "account_type": tipo})
                        creadas += 1
            except (ValidationError, UserError) as e:
                errores.append(f"Fila {n}: {mensaje_de(e, 'no se pudo guardar')}")
        return ok({"creadas": creadas, "actualizadas": actualizadas, "errores": errores[:20]})

    # ------------------------------------------------------------------ métodos de pago
    @http.route("/nodus/api/v1/pagos", type="http", auth="user", methods=["GET"], csrf=False)
    def pagos(self, **kw):
        Metodo = request.env["pos.payment.method"].sudo().with_context(active_test=False)
        diarios = request.env["account.journal"].sudo().search([("type", "in", ("bank", "cash")), ("company_id", "=", self._empresa().id)])
        return ok({
            "metodos": [dict({"id": m.id, "nombre": m.name, "activo": m.active, "tipo": m.journal_id.type or "",
                              "diario": m.journal_id.name or ""},
                             **({"hka_codigo": m.hka_payment_code or ""} if "hka_payment_code" in m._fields else {}))
                        for m in Metodo.search([("company_id", "=", self._empresa().id)], order="name")],
            "diarios": [{"id": j.id, "nombre": j.name, "tipo": j.type} for j in diarios],
        })

    @http.route("/nodus/api/v1/pagos", type="http", auth="user", methods=["POST"], csrf=False)
    def pago_crear(self, **kw):
        if (error := self._exigir_admin()):
            return error
        d = cuerpo()
        nombre = (d.get("nombre") or "").strip()
        diario = request.env["account.journal"].sudo().browse(int(d.get("diarioId") or 0)).exists()
        if not nombre or not diario:
            return fallo("DATOS_INVALIDOS", "Escribe el nombre y elige la cuenta donde entra el dinero.")
        try:
            with request.env.cr.savepoint():
                metodo = request.env["pos.payment.method"].sudo().create({"name": nombre, "journal_id": diario.id})
        except (ValidationError, UserError) as e:
            return fallo("NO_GUARDADO", mensaje_de(e, "No se pudo crear el método de pago."))
        return ok({"id": metodo.id})

    @http.route("/nodus/api/v1/pagos/<int:mid>/renombrar", type="http", auth="user", methods=["POST"], csrf=False)
    def pago_renombrar(self, mid, **kw):
        if (error := self._exigir_admin()):
            return error
        nombre = (cuerpo().get("nombre") or "").strip()
        metodo = request.env["pos.payment.method"].sudo().with_context(active_test=False).browse(mid).exists()
        if not metodo or not nombre:
            return fallo("DATOS_INVALIDOS", "Escribe el nombre del método de pago.")
        metodo.name = nombre
        return ok()

    @http.route("/nodus/api/v1/pagos/<int:mid>/hka", type="http", auth="user", methods=["POST"], csrf=False)
    def pago_hka(self, mid, **kw):
        """Número del medio de pago programado en la impresora fiscal (01 a 19)."""
        if (error := self._exigir_admin()):
            return error
        metodo = request.env["pos.payment.method"].sudo().with_context(active_test=False).browse(mid).exists()
        if not metodo or "hka_payment_code" not in metodo._fields:
            return fallo("NO_INSTALADO", "La impresora fiscal no está activada en esta empresa.", 404)
        try:
            with request.env.cr.savepoint():
                metodo.hka_payment_code = (cuerpo().get("codigo") or "").strip() or False
        except (ValidationError, UserError) as e:
            return fallo("NO_GUARDADO", mensaje_de(e, "El número debe estar entre 01 y 19."))
        return ok()

    @http.route("/nodus/api/v1/pagos/<int:mid>/eliminar", type="http", auth="user", methods=["POST"], csrf=False)
    def pago_eliminar(self, mid, **kw):
        if (error := self._exigir_admin()):
            return error
        metodo = request.env["pos.payment.method"].sudo().with_context(active_test=False).browse(mid).exists()
        if not metodo:
            return ok()
        try:
            with request.env.cr.savepoint():
                metodo.unlink()
        except Exception:
            metodo.active = False
            return ok({"archivado": True})
        return ok({"eliminado": True})

    # ------------------------------------------------------------------ impuestos
    def _impuestos(self):
        return request.env["account.tax"].sudo().with_context(active_test=False).search(
            [("company_id", "=", self._empresa().id), ("amount_type", "=", "percent"), ("type_tax_use", "in", ("sale", "purchase"))],
            order="type_tax_use, name")

    @http.route("/nodus/api/v1/impuestos", type="http", auth="user", methods=["GET"], csrf=False)
    def impuestos(self, **kw):
        return ok({"impuestos": [{"id": t.id, "nombre": t.name, "monto": t.amount, "tipo": t.type_tax_use, "activo": t.active}
                                 for t in self._impuestos()]})

    @http.route("/nodus/api/v1/impuestos", type="http", auth="user", methods=["POST"], csrf=False)
    def impuesto_crear(self, **kw):
        if (error := self._exigir_admin()):
            return error
        d = cuerpo()
        nombre = (d.get("nombre") or "").strip()
        try:
            monto = float(d.get("monto"))
        except (TypeError, ValueError):
            return fallo("DATOS_INVALIDOS", "Escribe el porcentaje del impuesto.")
        if not nombre or d.get("tipo") not in ("sale", "purchase") or not (0 <= monto <= 100):
            return fallo("DATOS_INVALIDOS", "Escribe el nombre, un porcentaje de 0 a 100 y a qué aplica.")
        try:
            with request.env.cr.savepoint():
                vals = {"name": nombre, "amount": monto, "amount_type": "percent", "type_tax_use": d["tipo"], "company_id": self._empresa().id}
                grupo = request.env["account.tax.group"].sudo().search([("company_id", "in", (self._empresa().id, False))], limit=1)
                if grupo and "tax_group_id" in request.env["account.tax"]._fields:
                    vals["tax_group_id"] = grupo.id
                impuesto = request.env["account.tax"].sudo().create(vals)
        except (ValidationError, UserError) as e:
            return fallo("NO_GUARDADO", mensaje_de(e, "No se pudo crear el impuesto."))
        return ok({"id": impuesto.id})

    @http.route("/nodus/api/v1/impuestos/<int:tid>", type="http", auth="user", methods=["POST"], csrf=False)
    def impuesto_editar(self, tid, **kw):
        if (error := self._exigir_admin()):
            return error
        d = cuerpo()
        impuesto = request.env["account.tax"].sudo().with_context(active_test=False).browse(tid).exists()
        if not impuesto:
            return fallo("NO_ENCONTRADO", "Impuesto no encontrado.", 404)
        vals = {}
        if "monto" in d:
            try:
                vals["amount"] = float(d["monto"])
            except (TypeError, ValueError):
                return fallo("DATOS_INVALIDOS", "El porcentaje no es válido.")
        if "activo" in d:
            vals["active"] = bool(d["activo"])
        if (d.get("nombre") or "").strip():
            vals["name"] = d["nombre"].strip()
        try:
            with request.env.cr.savepoint():
                impuesto.write(vals)
        except (ValidationError, UserError) as e:
            return fallo("NO_GUARDADO", mensaje_de(e, "No se pudo guardar el impuesto."))
        return ok()

    # ------------------------------------------------------------------ numeración e impresora fiscal
    def _hka(self):
        return "hka.fiscal.printer" in request.env

    @http.route("/nodus/api/v1/fiscal", type="http", auth="user", methods=["GET"], csrf=False)
    def fiscal(self, **kw):
        env, empresa = request.env, self._empresa()
        diarios = env["account.journal"].sudo().search([("type", "in", ("sale", "purchase")), ("company_id", "=", empresa.id)])
        numeracion = []
        for j in diarios:
            ultima = env["account.move"].sudo().search([("journal_id", "=", j.id), ("state", "=", "posted")], order="date desc, id desc", limit=1)
            numeracion.append({"id": j.id, "nombre": j.name, "tipo": j.type, "codigo": j.code, "ultima": ultima.name or "Sin documentos todavía"})
        hka = {"instalado": self._hka(), "impresoras": [], "cajas": [], "modelos": [], "flags": [], "cuentas": []}
        if hka["instalado"]:
            Impresora = env["hka.fiscal.printer"].sudo().with_context(active_test=False)
            hka["modelos"] = [{"id": k, "nombre": v} for k, v in Impresora._fields["printer_model"].selection]
            hka["flags"] = [{"id": k, "nombre": v.split(" — ")[0]} for k, v in Impresora._fields["flag_63"].selection]
            cuentas = env["account.account"].sudo().search([("account_type", "in", ("liability_current", "expense", "income", "income_other"))], order="code")
            hka["cuentas"] = [{"id": c.id, "nombre": f"{c.code} {c.name}"} for c in cuentas]
            for p in Impresora.search([("company_id", "=", empresa.id)]):
                hka["impresoras"].append({
                    "id": p.id, "nombre": p.name, "activo": p.active, "modelo": p.printer_model, "flag": p.flag_63,
                    "iva_pct": p.general_tax_rate, "iva_reducido_pct": p.reduced_tax_rate, "percibido_pct": p.perceived_tax_rate,
                    "igtf": bool(p.igtf_enabled), "igtf_pct": p.igtf_rate, "cuenta_igtf": p.igtf_account_id.id or 0,
                    "codigo_divisa": p.foreign_payment_code})
            for c in env["pos.config"].sudo().with_context(active_test=False).search([("company_id", "=", empresa.id)]):
                hka["cajas"].append({"id": c.id, "nombre": c.name, "impresora": c.hka_printer_id.id or 0})
        return ok({"numeracion": numeracion, "hka": hka})

    @http.route("/nodus/api/v1/fiscal/diario", type="http", auth="user", methods=["POST"], csrf=False)
    def diario_fiscal(self, **kw):
        """Libro de facturas de venta con su prefijo (ej. FISC -> FISC/2026/00001)."""
        if (error := self._exigir_admin()):
            return error
        d = cuerpo()
        nombre = (d.get("nombre") or "").strip()
        prefijo = "".join(c for c in (d.get("prefijo") or "").upper() if c.isalnum())[:5]
        if not nombre or not prefijo:
            return fallo("DATOS_INVALIDOS", "Escribe el nombre y el prefijo (letras o números, hasta 5).")
        Diario = request.env["account.journal"].sudo()
        if Diario.search_count([("code", "=", prefijo), ("company_id", "=", self._empresa().id)]):
            return fallo("PREFIJO_EXISTE", "Ya existe un libro con ese prefijo.")
        try:
            with request.env.cr.savepoint():
                diario = Diario.create({"name": nombre, "code": prefijo, "type": "sale", "company_id": self._empresa().id})
        except (ValidationError, UserError) as e:
            return fallo("NO_GUARDADO", mensaje_de(e, "No se pudo crear el libro."))
        return ok({"id": diario.id})

    @http.route("/nodus/api/v1/fiscal/impresora", type="http", auth="user", methods=["POST"], csrf=False)
    def impresora_crear(self, **kw):
        if (error := self._exigir_admin()):
            return error
        if not self._hka():
            return fallo("NO_INSTALADO", "La impresora fiscal no está activada en esta empresa.", 404)
        d = cuerpo()
        nombre = (d.get("nombre") or "").strip()
        modelos = [k for k, _v in request.env["hka.fiscal.printer"]._fields["printer_model"].selection]
        if not nombre or d.get("modelo") not in modelos:
            return fallo("DATOS_INVALIDOS", "Escribe el nombre y elige el modelo de la máquina.")
        try:
            with request.env.cr.savepoint():
                p = request.env["hka.fiscal.printer"].sudo().create({"name": nombre, "printer_model": d["modelo"], "company_id": self._empresa().id})
        except (ValidationError, UserError) as e:
            return fallo("NO_GUARDADO", mensaje_de(e, "No se pudo crear la impresora."))
        return ok({"id": p.id})

    @http.route("/nodus/api/v1/fiscal/impresora/<int:pid>", type="http", auth="user", methods=["POST"], csrf=False)
    def impresora(self, pid, **kw):
        if (error := self._exigir_admin()):
            return error
        if not self._hka():
            return fallo("NO_INSTALADO", "La impresora fiscal no está activada en esta empresa.", 404)
        d = cuerpo()
        impresora = request.env["hka.fiscal.printer"].sudo().with_context(active_test=False).browse(pid).exists()
        if not impresora:
            return fallo("NO_ENCONTRADO", "Impresora no encontrada.", 404)
        vals = {}
        if "activo" in d:
            vals["active"] = bool(d["activo"])
        if "igtf" in d:
            vals["igtf_enabled"] = bool(d["igtf"])
        if (d.get("nombre") or "").strip():
            vals["name"] = d["nombre"].strip()
        if d.get("flag") in ("16", "17"):
            vals["flag_63"] = d["flag"]
        if "cuenta_igtf" in d:
            vals["igtf_account_id"] = int(d["cuenta_igtf"] or 0) or False
        for origen, destino in (("igtf_pct", "igtf_rate"), ("iva_pct", "general_tax_rate"), ("iva_reducido_pct", "reduced_tax_rate"),
                                ("percibido_pct", "perceived_tax_rate"), ("codigo_divisa", "foreign_payment_code")):
            if origen in d:
                try:
                    vals[destino] = int(d[origen]) if destino == "foreign_payment_code" else float(d[origen])
                except (TypeError, ValueError):
                    return fallo("DATOS_INVALIDOS", "Revisa los números de la impresora.")
        igtf = vals.get("igtf_enabled", impresora.igtf_enabled)
        cuenta = vals.get("igtf_account_id", impresora.igtf_account_id.id)
        if igtf and not cuenta:
            return fallo("FALTA_CUENTA_IGTF", "Para habilitar el IGTF elige la cuenta donde se registra.")
        try:
            with request.env.cr.savepoint():
                impresora.write(vals)
        except (ValidationError, UserError, AccessError) as e:
            return fallo("NO_GUARDADO", mensaje_de(e, "No se pudo guardar la impresora."))
        return ok()

    @http.route("/nodus/api/v1/fiscal/caja/<int:cid>", type="http", auth="user", methods=["POST"], csrf=False)
    def caja_impresora(self, cid, **kw):
        """Qué impresora fiscal usa cada caja del Punto de Venta."""
        if (error := self._exigir_admin()):
            return error
        if not self._hka():
            return fallo("NO_INSTALADO", "La impresora fiscal no está activada en esta empresa.", 404)
        caja = request.env["pos.config"].sudo().with_context(active_test=False).browse(cid).exists()
        if not caja:
            return fallo("NO_ENCONTRADO", "Caja no encontrada.", 404)
        try:
            with request.env.cr.savepoint():
                caja.hka_printer_id = int(cuerpo().get("impresora") or 0) or False
        except (ValidationError, UserError) as e:
            return fallo("NO_GUARDADO", mensaje_de(e, "No se pudo asignar la impresora."))
        return ok()
