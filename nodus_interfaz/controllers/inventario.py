# Copyright 2026 Hadeon
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
"""API de la pantalla Inventario de hadeon_ui, sobre Odoo y hadeon_standard.

Las rutas /hadeon/api/... son las mismas que llama el JavaScript de la pantalla
(así funciona sin reescribirlo). Correspondencias:
- Precio Unitario / Costo  -> price_usd / cost_usd de hadeon_pricing_usd (o list_price / standard_price)
- Stock Actual             -> ajuste de inventario en el almacén principal (automático)
- Stock Mínimo             -> regla de reposición (stock.warehouse.orderpoint), alimenta las Alertas
- IVA                      -> impuestos de venta del producto
- Estación de Preparación  -> categoría del PdV (pos.category)
- Proveedor / Cód. barras  -> se cargan al Registrar Compra (proveedores del producto y barcode)
- Columnas de Lista de Precios -> niveles de precio de hadeon_pricelist_levels
"""
import json
import logging

from odoo import fields, http
from odoo.http import request

_logger = logging.getLogger(__name__)

UNIDAD_A_UOM = {"kg": "uom.product_uom_kgm", "L": "uom.product_uom_litre", "un": "uom.product_uom_unit"}
UOM_A_UNIDAD = {v: k for k, v in UNIDAD_A_UOM.items()}


def a_numero(valor):
    try:
        return float(valor)
    except (TypeError, ValueError):
        return 0.0


def cuerpo():
    return json.loads(request.httprequest.data or b"{}")


def responder(datos, estado=200):
    return request.make_json_response(datos, status=estado)


class NodusInventarioAPI(http.Controller):

    # ------------------------------------------------------------------ utilidades
    def _plantillas(self):
        return request.env["product.template"]

    def _usd(self):
        return "price_usd" in self._plantillas()._fields

    def _almacen(self):
        return request.env["stock.warehouse"].search([("company_id", "=", request.env.company.id)], limit=1)

    def _unidad(self, uom):
        if not uom:
            return "un"
        xmlid = uom.get_external_id().get(uom.id, "")
        return UOM_A_UNIDAD.get(xmlid, uom.name)

    def _minimo(self, producto):
        regla = request.env["stock.warehouse.orderpoint"].search([("product_id", "=", producto.id)], limit=1)
        return regla.product_min_qty if regla else 0.0

    def _producto_a_dict(self, producto):
        tmpl = producto.product_tmpl_id
        usd = self._usd()
        proveedores = [s.partner_id.name for s in tmpl.seller_ids if s.partner_id]
        return {
            "id": producto.id,
            "nombre": producto.name,
            "categoria": tmpl.categ_id.name or "",
            "proveedor": proveedores[0] if proveedores else "",
            "proveedores": list(dict.fromkeys(proveedores)),
            "estacion": tmpl.pos_categ_ids[:1].name or "",
            "stock": producto.qty_available,
            "minimo": self._minimo(producto),
            "unidad": self._unidad(tmpl.uom_id),
            "precio": tmpl.price_usd if usd else tmpl.list_price,
            "precioBs": tmpl.list_price if usd else None,
            "costo": tmpl.cost_usd if usd else tmpl.standard_price,
            "ivaId": tmpl.taxes_id[:1].id or False,
            "iva": tmpl.taxes_id[:1].name or "",
            "codigoBarras": producto.barcode or "",
            "descripcion": tmpl.description_sale or "",
            "imagen": f"/web/image/product.product/{producto.id}/image_128" if producto.image_128 else "",
        }

    def _aplicar_stock(self, producto, cantidad):
        almacen = self._almacen()
        if not almacen:
            return
        quant = request.env["stock.quant"].with_context(inventory_mode=True).create({
            "product_id": producto.id,
            "location_id": almacen.lot_stock_id.id,
            "inventory_quantity": cantidad,
        })
        quant.action_apply_inventory()

    def _aplicar_minimo(self, producto, minimo):
        Regla = request.env["stock.warehouse.orderpoint"]
        regla = Regla.search([("product_id", "=", producto.id)], limit=1)
        if regla:
            regla.write({"product_min_qty": minimo, "product_max_qty": max(regla.product_max_qty, minimo)})
        elif minimo:
            almacen = self._almacen()
            Regla.create({
                "product_id": producto.id,
                "warehouse_id": almacen.id,
                "location_id": almacen.lot_stock_id.id,
                "product_min_qty": minimo,
                "product_max_qty": minimo,
            })

    def _vals(self, datos):
        env = request.env
        vals = {
            "name": (datos.get("nombre") or "").strip(),
            "description_sale": datos.get("descripcion") or "",
        }
        nombre_cat = (datos.get("categoria") or "").strip()
        if nombre_cat:
            categ = env["product.category"].search([("name", "=", nombre_cat)], limit=1) or \
                env["product.category"].create({"name": nombre_cat})
            vals["categ_id"] = categ.id
        uom = env.ref(UNIDAD_A_UOM.get(datos.get("unidad") or "un", "uom.product_uom_unit"), raise_if_not_found=False)
        if uom:
            vals["uom_id"] = uom.id
        estacion = (datos.get("estacion") or "").strip()
        if estacion:
            pos_cat = env["pos.category"].search([("name", "=", estacion)], limit=1) or \
                env["pos.category"].create({"name": estacion})
            vals["pos_categ_ids"] = [(6, 0, [pos_cat.id])]
        elif "estacion" in datos:
            vals["pos_categ_ids"] = [(5, 0, 0)]
        if "precio" in datos:
            vals["price_usd" if self._usd() else "list_price"] = a_numero(datos.get("precio"))
        if datos.get("costo") not in (None, ""):
            vals["cost_usd" if self._usd() else "standard_price"] = a_numero(datos.get("costo"))
        if "ivaId" in datos:
            iva = int(datos["ivaId"]) if str(datos.get("ivaId") or "").isdigit() else False
            vals["taxes_id"] = [(6, 0, [iva] if iva else [])]
        return vals

    # ------------------------------------------------------------------ productos
    @http.route("/hadeon/api/inventario/productos", type="http", auth="user", methods=["GET"], csrf=False)
    def listar_productos(self, **kw):
        return responder([self._producto_a_dict(p) for p in self._productos_inventario()])

    def _productos_inventario(self):
        """Bienes que se llevan en inventario (no servicios ni productos internos del PdV como Propinas)."""
        dominio = [("type", "=", "consu")]
        if "is_storable" in self._plantillas()._fields:
            dominio.append(("is_storable", "=", True))
        return request.env["product.product"].search(dominio, order="name")

    @http.route("/hadeon/api/inventario/productos", type="http", auth="user", methods=["POST"], csrf=False)
    def crear_producto(self, **kw):
        datos = cuerpo()
        if not (datos.get("nombre") or "").strip():
            return responder({"error": "nombre requerido"}, 400)
        vals = self._vals(datos)
        vals["type"] = "consu"
        if "is_storable" in self._plantillas()._fields:
            vals["is_storable"] = True
        # Se crea la plantilla (no la variante) para que los campos de plantilla con
        # inverso, como cost_usd de hadeon_pricing_usd, se guarden al crear
        producto = request.env["product.template"].create(vals).product_variant_id
        if a_numero(datos.get("stockActual")):
            self._aplicar_stock(producto, a_numero(datos.get("stockActual")))
        self._aplicar_minimo(producto, a_numero(datos.get("stockMinimo")))
        return responder(self._producto_a_dict(producto))

    @http.route("/hadeon/api/inventario/productos/<int:producto_id>", type="http", auth="user", methods=["POST"], csrf=False)
    def editar_producto(self, producto_id, **kw):
        producto = request.env["product.product"].browse(producto_id).exists()
        if not producto:
            return responder({"error": "producto no encontrado"}, 404)
        datos = cuerpo()
        if not (datos.get("nombre") or "").strip():
            return responder({"error": "nombre requerido"}, 400)
        producto.product_tmpl_id.write(self._vals(datos))
        # El stock que manda el formulario es la nueva cantidad real (ajuste de inventario)
        if datos.get("stockActual") not in (None, "") and a_numero(datos["stockActual"]) != producto.qty_available:
            self._aplicar_stock(producto, a_numero(datos["stockActual"]))
        if datos.get("stockMinimo") not in (None, ""):
            self._aplicar_minimo(producto, a_numero(datos["stockMinimo"]))
        return responder(self._producto_a_dict(producto))

    @http.route("/hadeon/api/inventario/productos/eliminar", type="http", auth="user", methods=["POST"], csrf=False)
    def eliminar_productos(self, **kw):
        ids = [int(i) for i in cuerpo().get("ids") or [] if str(i).isdigit()]
        eliminados, archivados = [], []
        for producto in request.env["product.product"].browse(ids).exists():
            try:
                with request.env.cr.savepoint():
                    producto.product_tmpl_id.unlink()
                eliminados.append(producto.id)
            except Exception:
                # con ventas, compras o movimientos no se puede borrar: se archiva
                producto.product_tmpl_id.active = False
                archivados.append(producto.id)
        return responder({"eliminados": eliminados, "archivados": archivados})

    # ------------------------------------------------------------------ catálogos
    @http.route("/nodus/api/impuestos", type="http", auth="user", methods=["GET"], csrf=False)
    def impuestos(self, **kw):
        tipo = kw.get("tipo") or "sale"
        imp = request.env["account.tax"].search([("type_tax_use", "=", tipo), ("company_id", "=", request.env.company.id)])
        return responder([{"id": t.id, "nombre": t.name, "monto": t.amount} for t in imp])

    @http.route("/nodus/api/proveedores", type="http", auth="user", methods=["GET"], csrf=False)
    def proveedores(self, **kw):
        socios = request.env["res.partner"].search([("supplier_rank", ">", 0)], order="name", limit=500)
        return responder([{"id": p.id, "nombre": p.name, "rif": p.vat or ""} for p in socios])

    # ------------------------------------------------------------------ configuración y categorías
    PARAM_UMBRAL = "nodus_interfaz.inventario_umbral_critico"

    @http.route("/hadeon/api/config/inventario", type="http", auth="user", methods=["GET"], csrf=False)
    def obtener_config(self, **kw):
        valor = request.env["ir.config_parameter"].sudo().get_param(self.PARAM_UMBRAL)
        return responder({"umbralCritico": a_numero(valor) if valor else 70.0})

    @http.route("/hadeon/api/config/inventario", type="http", auth="user", methods=["POST"], csrf=False)
    def guardar_config(self, **kw):
        umbral = a_numero(cuerpo().get("umbralCritico"))
        if not 1 <= umbral <= 99:
            return responder({"error": "El umbral debe estar entre 1 y 99."}, 400)
        request.env["ir.config_parameter"].sudo().set_param(self.PARAM_UMBRAL, str(umbral))
        return responder({"umbralCritico": umbral})

    @http.route("/hadeon/api/inventario/categorias", type="http", auth="user", methods=["GET"], csrf=False)
    def categorias(self, **kw):
        datos = []
        for c in request.env["product.category"].search([]):
            datos.append({"id": c.id, "nombre": c.name,
                          "cantidadProductos": request.env["product.template"].search_count([("categ_id", "=", c.id)])})
        return responder(datos)

    @http.route("/hadeon/api/inventario/categorias/<int:cid>/renombrar", type="http", auth="user", methods=["POST"], csrf=False)
    def renombrar_categoria(self, cid, **kw):
        cat = request.env["product.category"].browse(cid).exists()
        nombre = (cuerpo().get("nombre") or "").strip()
        if not cat or not nombre:
            return responder({"error": "datos inválidos"}, 400)
        cat.name = nombre
        return responder({"id": cat.id, "nombre": cat.name})

    @http.route("/hadeon/api/inventario/categorias/<int:cid>/eliminar", type="http", auth="user", methods=["POST"], csrf=False)
    def eliminar_categoria(self, cid, **kw):
        cat = request.env["product.category"].browse(cid).exists()
        try:
            with request.env.cr.savepoint():
                cat.unlink()
        except Exception:
            return responder({"error": "No se pudo eliminar la categoría: todavía tiene productos asociados."}, 400)
        return responder({"eliminado": True})

    # ------------------------------------------------------------------ lista de precios (niveles)
    def _niveles(self):
        if "hadeon.price.level" not in request.env:
            return None
        return request.env["hadeon.price.level"].search([("is_base", "=", False)])

    @http.route("/hadeon/api/precios/columnas", type="http", auth="user", methods=["GET"], csrf=False)
    def columnas(self, **kw):
        niveles = self._niveles()
        return responder([{"id": n.id, "nombre": n.name} for n in niveles] if niveles is not None else [])

    @http.route("/hadeon/api/precios/columnas", type="http", auth="user", methods=["POST"], csrf=False)
    def crear_columna(self, **kw):
        nombre = (cuerpo().get("nombre") or "").strip()
        if not nombre or self._niveles() is None:
            return responder({"error": "nombre requerido"}, 400)
        nivel = request.env["hadeon.price.level"].create({"name": nombre})
        return responder({"id": nivel.id, "nombre": nivel.name})

    @http.route("/hadeon/api/precios/columnas/<int:nid>/renombrar", type="http", auth="user", methods=["POST"], csrf=False)
    def renombrar_columna(self, nid, **kw):
        nivel = request.env["hadeon.price.level"].browse(nid).exists()
        nombre = (cuerpo().get("nombre") or "").strip()
        if not nivel or not nombre:
            return responder({"error": "datos inválidos"}, 400)
        nivel.name = nombre
        return responder({"id": nivel.id, "nombre": nivel.name})

    @http.route("/hadeon/api/precios/columnas/<int:nid>/eliminar", type="http", auth="user", methods=["POST"], csrf=False)
    def eliminar_columna(self, nid, **kw):
        nivel = request.env["hadeon.price.level"].browse(nid).exists()
        try:
            with request.env.cr.savepoint():
                nivel.unlink()
        except Exception:
            nivel.active = False
        return responder({"eliminado": True})

    @http.route("/hadeon/api/precios/productos", type="http", auth="user", methods=["GET"], csrf=False)
    def productos_con_precios(self, **kw):
        productos = self._productos_inventario().filtered("sale_ok")
        precios = {}
        if self._niveles() is not None:
            for linea in request.env["hadeon.product.price.level"].search([
                ("product_tmpl_id", "in", productos.product_tmpl_id.ids), ("min_qty", "<=", 1.0),
            ]):
                precios.setdefault(linea.product_tmpl_id.id, {})[linea.level_id.id] = linea.price_usd
        return responder([{"id": p.id, "nombre": p.name, "precios": precios.get(p.product_tmpl_id.id, {})} for p in productos])

    @http.route("/hadeon/api/precios/guardar", type="http", auth="user", methods=["POST"], csrf=False)
    def guardar_precios(self, **kw):
        Linea = request.env["hadeon.product.price.level"] if "hadeon.product.price.level" in request.env else None
        guardados = 0
        for entrada in cuerpo().get("valores") or []:
            try:
                producto = request.env["product.product"].browse(int(entrada.get("productoId"))).exists()
                nivel = request.env["hadeon.price.level"].browse(int(entrada.get("tipoPrecioId"))).exists()
            except (TypeError, ValueError):
                continue
            if not (producto and nivel and Linea is not None):
                continue
            with request.env.cr.savepoint():
                linea = Linea.search([("product_tmpl_id", "=", producto.product_tmpl_id.id), ("level_id", "=", nivel.id),
                                      ("min_qty", "<=", 1.0)], limit=1)
                valor = a_numero(entrada.get("valor"))
                if linea:
                    linea.price_usd = valor
                else:
                    Linea.create({"product_tmpl_id": producto.product_tmpl_id.id, "level_id": nivel.id, "min_qty": 1.0, "price_usd": valor})
                guardados += 1
        return responder({"guardados": guardados})

    # ------------------------------------------------------------------ compra (automatizada)
    @http.route("/nodus/api/inventario/compra", type="http", auth="user", methods=["POST"], csrf=False)
    def registrar_compra(self, **kw):
        """Registra una compra en un solo paso: orden de compra confirmada, mercancía recibida
        (entra al inventario), proveedor agregado a cada producto, código de barras y costo
        actualizados, y la factura del proveedor en borrador si se pide."""
        env = request.env
        if "purchase.order" not in env:
            return responder({"error": "El módulo de Compras no está instalado."}, 400)
        datos = cuerpo()
        lineas = [l for l in datos.get("lineas") or [] if str(l.get("productoId") or "").isdigit() and a_numero(l.get("cantidad")) > 0]
        if not lineas:
            return responder({"error": "Agrega al menos un producto con cantidad."}, 400)

        proveedor = env["res.partner"]
        if str(datos.get("proveedorId") or "").isdigit():
            proveedor = env["res.partner"].browse(int(datos["proveedorId"])).exists()
        if not proveedor and (datos.get("proveedorNombre") or "").strip():
            proveedor = env["res.partner"].create({"name": datos["proveedorNombre"].strip(), "vat": datos.get("proveedorRif") or False,
                                                    "is_company": True, "supplier_rank": 1})
        if not proveedor:
            return responder({"error": "Indica el proveedor."}, 400)

        usd = env.ref("base.USD", raise_if_not_found=False)
        en_usd = self._usd() and usd and env.company.currency_id != usd
        orden_vals = {"partner_id": proveedor.id, "partner_ref": datos.get("referencia") or False, "order_line": []}
        if en_usd:
            orden_vals["currency_id"] = usd.id
        for l in lineas:
            producto = env["product.product"].browse(int(l["productoId"])).exists()
            if not producto:
                continue
            if (l.get("codigoBarras") or "").strip() and producto.barcode != l["codigoBarras"].strip():
                producto.barcode = l["codigoBarras"].strip()
            orden_vals["order_line"].append((0, 0, {
                "product_id": producto.id,
                "product_qty": a_numero(l["cantidad"]),
                "price_unit": a_numero(l.get("costo")),
            }))
        orden = env["purchase.order"].create(orden_vals)
        orden.button_confirm()  # Odoo agrega el proveedor a cada producto al confirmar

        # Recepción inmediata: lo comprado entra al inventario
        for picking in orden.picking_ids.filtered(lambda p: p.state not in ("done", "cancel")):
            for movimiento in picking.move_ids:
                movimiento.quantity = movimiento.product_uom_qty
            picking.with_context(skip_backorder=True).button_validate()

        # El costo del producto pasa a ser el último costo de compra (en dólares si la
        # compra fue en dólares y existe cost_usd; si no, en la moneda de la empresa)
        for linea in orden.order_line:
            tmpl = linea.product_id.product_tmpl_id
            if en_usd and "cost_usd" in tmpl._fields:
                tmpl.cost_usd = linea.price_unit
            else:
                tmpl.standard_price = orden.currency_id._convert(
                    linea.price_unit, env.company.currency_id, env.company, fields.Date.context_today(orden))

        factura = False
        if datos.get("facturar"):
            orden.action_create_invoice()
            factura = orden.invoice_ids[:1]
            if factura and datos.get("referencia"):
                factura.ref = datos["referencia"]
        return responder({
            "ok": True,
            "orden": orden.name,
            "factura": factura.name if factura else False,
            "productos": [self._producto_a_dict(l.product_id) for l in orden.order_line],
        })
