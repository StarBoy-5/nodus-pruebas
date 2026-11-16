/** @odoo-module **/
// Módulos de la interfaz Nodus (los de hadeon_ui) y a qué app de Odoo corresponde cada uno.
// El orden es el del lateral de hadeon_ui. Las apps que no estén aquí solo las ve soporte,
// y salen al final con el icono de Odoo.

const IMG = "/nodus_interfaz/static/src/img/modulos/";

export const MODULOS_NODUS = [
    { xmlid: "nodus_interfaz.menu_principal", nombre: "Menú Principal", icono: IMG + "inicio.svg" },
    { xmlid: "account.menu_finance", nombre: "Contabilidad", icono: IMG + "documento.svg" },
    { xmlid: "point_of_sale.menu_point_root", nombre: "Punto de Venta", icono: IMG + "pos.svg" },
    { xmlid: "stock.menu_stock_root", nombre: "Inventario", icono: IMG + "inventario.svg" },
    { xmlid: "nodus_interfaz.menu_ventas", nombre: "Resumen", icono: IMG + "ventas.svg" },
    { xmlid: "sale.sale_menu_root", nombre: "Ventas", icono: IMG + "documento.svg" },
    { xmlid: "nodus_interfaz.menu_mensualidad", nombre: "Mensualidad", icono: IMG + "documento.svg" },
    { xmlid: "nodus_interfaz.menu_configuracion", nombre: "Configuración", icono: IMG + "configuracion.svg" },
    { xmlid: "nodus_interfaz.menu_comandas", nombre: "Comandas", icono: IMG + "comandas.svg" },
    { xmlid: "contacts.menu_contacts", nombre: "Contactos", icono: IMG + "contactos.svg" },
    { xmlid: "auto_repair_workshop.menu_workshop_root", nombre: "Taller", icono: IMG + "taller.svg" },
    // Apps de Odoo que solo ve la cuenta de soporte (el cliente no las ve): con su nombre en español e icono propio
    { xmlid: "mail.menu_root_discuss", nombre: "Conversaciones", icono: IMG + "conversaciones.svg" },
    { xmlid: "purchase.menu_purchase_root", nombre: "Compras", icono: IMG + "compras.svg" },
    { xmlid: "spreadsheet_dashboard.spreadsheet_dashboard_menu_root", nombre: "Tableros", icono: IMG + "tableros.svg" },
    { xmlid: "fleet.menu_root", nombre: "Flotilla", icono: IMG + "flotilla.svg" },
    { xmlid: "utm.menu_link_tracker_root", nombre: "Enlaces", icono: IMG + "enlaces.svg" },
    { xmlid: "base.menu_management", nombre: "Aplicaciones", icono: IMG + "aplicaciones.svg" },
    { xmlid: "base.menu_administration", nombre: "Ajustes técnicos", icono: IMG + "ajustes_tecnicos.svg" },
];

const POR_XMLID = Object.fromEntries(MODULOS_NODUS.map((m, i) => [m.xmlid, { ...m, orden: i }]));

/** Icono de una app de Odoo que no es de Nodus: su web_icon o el genérico. */
function iconoOdoo(app) {
    if (app.webIconData) {
        return app.webIconData;
    }
    if (app.webIcon && typeof app.webIcon === "string" && app.webIcon.includes(",")) {
        const [modulo, ruta] = app.webIcon.split(",");
        return `/${modulo}/${ruta}`;
    }
    return IMG + "ajustes.svg";
}

/**
 * Apps visibles para el usuario, en el orden de Nodus y con su nombre e icono.
 * `menu` es el servicio de menús de Odoo: ya filtra por los permisos del usuario.
 */
export function modulosDe(menu) {
    const lista = menu.getApps().map((app) => {
        const n = POR_XMLID[app.xmlid];
        return {
            id: app.id,
            app,
            nombre: n ? n.nombre : app.name,
            icono: n ? n.icono : iconoOdoo(app),
            propio: Boolean(n),
            orden: n ? n.orden : 1000,
        };
    });
    return lista.sort((a, b) => a.orden - b.orden);
}
