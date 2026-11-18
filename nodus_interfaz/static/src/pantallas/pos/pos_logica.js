/** @odoo-module **/
// Lógica del Punto de Venta (código de Nodus). Se monta al abrir la pantalla y se limpia al salir.
// El POS vivía en un iframe: aquí "la ventana" es la tarjeta (ancho, alto y media queries miran la tarjeta),
// y lo que se agrega "al body" queda dentro de la pantalla.

import { crearEntorno } from "../entorno";

export function montar(raiz) {
    const { document, window, matchMedia, setInterval, setTimeout, arrancar, detener } = crearEntorno(raiz);




document.addEventListener('DOMContentLoaded', function () {
  // ===== Nodus: pagar con varios métodos =====
  const vista = document.getElementById('vista-checkout-pos');
  const efectivoEl = document.getElementById('efectivo');
  if (!vista || !efectivoEl) return;
  window.hadeonPOS = window.hadeonPOS || {};
  const NOMBRES = { targeta: 'Tarjeta', efectivo: 'Efectivo', pagomovil: 'Pago móvil', 'bio-pago': 'Bio-Pago' };
  const ETIQ_EFECTIVO = { bolivares: 'Bs', euros: '€', dolares: '$' };
  let activo = false;
  let pagos = [];

  const panel = document.createElement('div');
  panel.className = 'nodus-split';
  panel.innerHTML = '<div class="nodus-split-cab"><span>¿Paga con varios métodos?</span><button type="button" class="nodus-btn-mini" id="nodus-split-btn">Dividir pago</button></div><div id="nodus-split-cuerpo"></div>';
  efectivoEl.parentElement.insertAdjacentElement('afterend', panel);
  const cuerpo = panel.querySelector('#nodus-split-cuerpo');
  const btn = panel.querySelector('#nodus-split-btn');

  const dinero = n => '$' + Number(n || 0).toFixed(2);
  const totalActual = () => {
    const el = vista.querySelector('.txt-total-checkout');
    const n = parseFloat(((el && el.innerText) || '0').replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  };
  const suma = () => pagos.reduce((a, p) => a + p.monto, 0);

  function sincronizar() {
    window.hadeonPOS.pagosMixtos = activo ? pagos.map(p => ({ metodo_id: p.metodo_id, monto: p.monto, referencia: p.referencia })) : [];
    if (activo) {
      const completo = pagos.length > 0 && Math.abs(totalActual() - suma()) <= 0.011;
      window.hadeonPOS.metodoPagoId = completo ? pagos[0].metodo_id : null;
    }
  }

  function render() {
    cuerpo.textContent = '';
    if (!activo) return;
    if (!pagos.length) {
      const a = document.createElement('p'); a.className = 'nodus-split-ayuda';
      a.textContent = 'Toca un método de pago y escribe cuánto paga con él. Repite hasta cubrir el total.';
      cuerpo.appendChild(a);
    }
    pagos.forEach((p, i) => {
      const fila = document.createElement('div'); fila.className = 'nodus-split-item';
      const n = document.createElement('span'); n.textContent = p.nombre + (p.referencia ? ' · ref. ' + p.referencia : '');
      const m = document.createElement('strong'); m.textContent = dinero(p.monto);
      const x = document.createElement('button'); x.type = 'button'; x.textContent = '✕'; x.title = 'Quitar';
      x.addEventListener('click', () => { pagos.splice(i, 1); render(); sincronizar(); });
      fila.appendChild(n); fila.appendChild(m); fila.appendChild(x); cuerpo.appendChild(fila);
    });
    const falta = totalActual() - suma();
    const e = document.createElement('div');
    if (Math.abs(falta) <= 0.011 && pagos.length) { e.className = 'nodus-split-estado ok'; e.textContent = 'Pago completo ✓'; }
    else if (falta > 0) { e.className = 'nodus-split-estado falta'; e.textContent = 'Falta: ' + dinero(falta); }
    else { e.className = 'nodus-split-estado falta'; e.textContent = 'Te pasaste por ' + dinero(-falta); }
    cuerpo.appendChild(e);
  }

  function pedirMonto(idEl) {
    const falta = Math.max(totalActual() - suma(), 0);
    if (falta <= 0.011) { return; }
    const nombre = NOMBRES[idEl];
    const fondo = document.createElement('div');
    fondo.className = 'nodus-modal-fondo';
    fondo.innerHTML = '<div class="nodus-modal" role="dialog"><h3></h3><p class="nodus-modal-sub"></p><div id="nsp-cuerpo"></div><p class="nodus-error-form"></p>' +
      '<div class="nodus-modal-pie"><button type="button" class="nodus-btn-sec" data-c>Cancelar</button><button type="button" class="nodus-btn-pri" data-ok>Agregar</button></div></div>';
    fondo.querySelector('h3').textContent = nombre;
    fondo.querySelector('.nodus-modal-sub').textContent = 'Falta por cubrir ' + dinero(falta);
    let html = '<label>Monto que paga con este método ($)</label><input type="number" id="nsp-monto" min="0" step="0.01" inputmode="decimal" value="' + falta.toFixed(2) + '">';
    if (idEl === 'efectivo') {
      html += '<label>Tipo de efectivo</label><select id="nsp-tipo"><option value="dolares">Dólares ($)</option><option value="bolivares">Bolívares (Bs)</option><option value="euros">Euros (€)</option></select>';
    } else {
      html += '<label>Referencia (opcional)</label><input type="text" id="nsp-ref" maxlength="12" placeholder="Últimos dígitos">';
    }
    fondo.querySelector('#nsp-cuerpo').innerHTML = html;
    document.body.appendChild(fondo);
    const cerrar = () => fondo.remove();
    fondo.querySelector('[data-c]').addEventListener('click', cerrar);
    fondo.addEventListener('mousedown', e => { if (e.target === fondo) cerrar(); });
    const err = fondo.querySelector('.nodus-error-form');
    fondo.querySelector('#nsp-monto').focus();
    fondo.querySelector('[data-ok]').addEventListener('click', () => {
      const monto = Math.round((parseFloat(fondo.querySelector('#nsp-monto').value) || 0) * 100) / 100;
      if (monto <= 0) { err.textContent = 'Escribe un monto mayor que cero.'; return; }
      if (monto > falta + 0.011) { err.textContent = 'Ese monto es mayor que lo que falta (' + dinero(falta) + ').'; return; }
      const tipoSel = fondo.querySelector('#nsp-tipo');
      if (tipoSel) window.hadeonPOS.tipoEfectivo = tipoSel.value;
      const metodoId = window.hadeonPOS.resolverMetodo ? window.hadeonPOS.resolverMetodo(nombre) : null;
      if (!metodoId) { err.textContent = 'Ese método de pago no está configurado en esta caja.'; return; }
      const refEl = fondo.querySelector('#nsp-ref');
      pagos.push({ metodo_id: metodoId, monto: monto, referencia: refEl ? refEl.value.trim() : '',
                   nombre: nombre + (tipoSel ? ' (' + ETIQ_EFECTIVO[tipoSel.value] + ')' : '') });
      cerrar(); render(); sincronizar();
    });
  }

  // En modo "dividir", tocar un método agrega un pago en vez de elegirlo como único
  document.addEventListener('click', function (e) {
    if (!activo) return;
    const el = e.target.closest('#targeta, #efectivo, #pagomovil, #bio-pago');
    if (!el) return;
    e.stopPropagation(); e.preventDefault();
    pedirMonto(el.id);
  }, true);

  btn.addEventListener('click', function () {
    activo = !activo;
    pagos = [];
    btn.textContent = activo ? 'Pago único' : 'Dividir pago';
    window.hadeonPOS.metodoPagoId = null;
    vista.querySelectorAll('.metodo-pago-item.seleccionado').forEach(x => x.classList.remove('seleccionado'));
    render(); sincronizar();
  });

  window.nodusReiniciarPagos = function () {
    activo = false; pagos = []; btn.textContent = 'Dividir pago';
    window.hadeonPOS.pagosMixtos = [];
    render();
  };

  setInterval(function () { if (activo) { render(); sincronizar(); } }, 800);
});


document.addEventListener('DOMContentLoaded', function () {
  // ===== Nodus: en teléfono, el pedido es una bandeja que se sube y se baja =====
  const sb = document.getElementById('hadeon-pos-sidebar');
  const vista = document.getElementById('vista-carrito-pos');
  const grid = document.getElementById('contenedor-productos-pos');
  if (!sb || !vista || !grid) return;
  const mq = window.matchMedia('(max-width: 767px)');
  const PEEK_BASE = 80;
  // Bandeja cerrada: el asa y, si hay órdenes de la caja, también su fila de cuadritos (debajo del asa)
  const PEEK_F = () => { const t = document.querySelector('#nodus-tira-ordenes.con-ordenes'); return PEEK_BASE + (t && sb.contains(t) ? t.offsetHeight + 12 : 0); };
  let ABAJO = 92;
  const dock = () => document.documentElement.classList.contains('nodus-con-dock');
  let abierta = false, arrastrando = false;

  const asa = document.createElement('div');
  asa.className = 'nodus-asa';
  asa.innerHTML = '<div class="nodus-asa-barra"><svg viewBox="0 0 46 12" width="46" height="12" aria-hidden="true"><polyline points="3,9 23,3.5 43,9" fill="none" stroke="currentColor" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="nodus-asa-fila"><span class="nodus-asa-resumen"></span><span class="nodus-asa-flecha">▼ Bajar</span><button type="button" class="nodus-asa-btn">Ver carrito</button></div>';
  sb.insertBefore(asa, sb.firstChild);
  const resumen = asa.querySelector('.nodus-asa-resumen');
  const botonAsa = asa.querySelector('.nodus-asa-btn');
  const rotular = () => { botonAsa.textContent = abierta ? 'Ver productos' : 'Ver carrito'; };

  const maximo = () => Math.max(window.innerHeight - ABAJO - 60, PEEK_F() + 80);
  // La bandeja va cuando la pantalla de venta (catálogo + pedido) está abierta. NO se mira la cuadrícula:
  // sin bandeja nuestra propia regla oculta el catálogo, y Safari (a diferencia de Chrome) la da por oculta,
  // así que la bandeja nunca se activaba en iPhone y el catálogo no aparecía.
  const pantallaVenta = document.getElementById('pos-catalogo-y-sidebar') || sb;
  const activo = () => mq.matches && getComputedStyle(vista).display !== 'none' && pantallaVenta.getClientRects().length > 0;
  const poner = h => sb.style.setProperty('height', h + 'px', 'important');

  function ajustarGrid() {
    if (!activo()) return;
    ABAJO = dock() ? 92 : 14;
    const arriba = grid.getBoundingClientRect().top;
    const disponible = Math.max(window.innerHeight - arriba - PEEK_F() - ABAJO - 6, 240);
    const fila = Math.max(Math.floor((disponible - 20 - 8) / 3), 96);
    grid.style.setProperty('max-height', disponible + 'px', 'important');
    // Teléfono: un producto por fila, del alto de su contenido
    grid.style.setProperty('grid-auto-rows', 'auto', 'important');
  }

  function aplicar() {
    ABAJO = dock() ? 92 : 14;
    const a = activo();
    document.body.classList.toggle('nodus-bandeja', a);
    if (a) { poner(abierta ? maximo() : PEEK_F()); ajustarGrid(); }
    else { sb.style.removeProperty('height'); grid.style.removeProperty('grid-auto-rows'); abierta = false; }
    asa.classList.toggle('abierta', abierta);
    rotular();
  }

  function fijar(abrir) {
    abierta = abrir;
    sb.classList.add('nodus-anima');
    poner(abierta ? maximo() : PEEK_F());
    asa.classList.toggle('abierta', abierta);
    rotular();
    setTimeout(() => sb.classList.remove('nodus-anima'), 320);
    if (!abierta) sb.scrollTop = 0;
  }

  let y0 = 0, h0 = 0, movio = false;
  asa.addEventListener('pointerdown', function (e) {
    if (e.target.closest('.nodus-asa-btn')) return;
    arrastrando = true; movio = false; y0 = e.clientY; h0 = sb.getBoundingClientRect().height;
    asa.setPointerCapture(e.pointerId);
  });
  asa.addEventListener('pointermove', function (e) {
    if (!arrastrando) return;
    if (Math.abs(e.clientY - y0) > 4) movio = true;
    poner(Math.min(Math.max(h0 + (y0 - e.clientY), PEEK_F()), maximo()));
  });
  function soltar() {
    if (!arrastrando) return;
    arrastrando = false;
    const h = sb.getBoundingClientRect().height;
    fijar(movio ? h > (PEEK_F() + maximo()) / 2 : !abierta);
  }
  asa.addEventListener('pointerup', soltar);
  asa.addEventListener('pointercancel', soltar);

  // "Ver carrito" sube la bandeja; con la bandeja abierta, "Ver productos" la baja
  asa.querySelector('.nodus-asa-btn').addEventListener('click', function () {
    fijar(!abierta);
  });

  function actualizarResumen() {
    const filas = Array.from(document.querySelectorAll('#contenedor-carrito-pos > *')).filter(x => x.id !== 'plantilla-item-carrito' && !x.classList.contains('carrito-vacio'));
    const total = (document.querySelector('.txt-total-carrito') || {}).innerText || '$0.00';
    asa.classList.toggle('con-pedido', filas.length > 0);
    const html = (filas.length ? filas.length + (filas.length === 1 ? ' producto' : ' productos') : 'Pedido vacío') + ' · <b>' + total.trim() + '</b>';
    // Solo si cambió: reescribirlo cada 400 ms hacía que la pantalla nunca quedara quieta
    if (resumen.innerHTML !== html) resumen.innerHTML = html;
  }

  setInterval(function () {
    actualizarResumen();
    const a = activo();
    if (a !== document.body.classList.contains('nodus-bandeja')) aplicar();
    else if (a) {
      // Con la bandeja cerrada, su alto sigue a la fila de órdenes (aparece o se va una orden)
      if (!abierta && !arrastrando && Math.round(sb.getBoundingClientRect().height) !== PEEK_F()) poner(PEEK_F());
      ajustarGrid();
    }
  }, 400);
  window.addEventListener('resize', aplicar);
  aplicar();
});







document.addEventListener("DOMContentLoaded", function () {
  // 👉 Este widget SOLO controla el buscador y las flechas de scroll
  // horizontal de las categorías. La generación de los botones .pos-cat-btn
  // y toda su lógica de selección/multiselección vive en el widget 4aff4d4
  // (el que renderiza el catálogo), porque ahí es donde se recrean en
  // cada clic. No dupliques lógica de selección aquí.
  const contenedor = document.getElementById('pos-categorias');
  const flechaIzq = document.getElementById('pos-scroll-izq');
  const flechaDer = document.getElementById('pos-scroll-der');
  if (!contenedor || !flechaIzq || !flechaDer) return;

  function actualizarFlechas() {
    const puedeIzquierda = contenedor.scrollLeft > 2;
    const puedeDerecha = contenedor.scrollLeft + contenedor.clientWidth < contenedor.scrollWidth - 2;

    flechaIzq.classList.toggle('visible', puedeIzquierda);
    flechaDer.classList.toggle('visible', puedeDerecha);
  }

  flechaIzq.addEventListener('click', () => {
    contenedor.scrollBy({ left: -150, behavior: 'smooth' });
  });
  flechaDer.addEventListener('click', () => {
    contenedor.scrollBy({ left: 150, behavior: 'smooth' });
  });

  // Degradado dinámico (sustituye al fijo que traía antes el Custom
  // CSS del diseño anterior) — coexiste con las flechas sin pisarse: cada uno
  // escucha el mismo 'scroll' por su lado.
  const actualizarDegradadoCategorias = typeof hadeonActivarDegradadoScroll === 'function'
    ? hadeonActivarDegradadoScroll(contenedor)
    : null;

  contenedor.addEventListener('scroll', actualizarFlechas, { passive: true });
  window.addEventListener('resize', actualizarFlechas);

  const observador = new MutationObserver(() => {
    actualizarFlechas();
    if (actualizarDegradadoCategorias) actualizarDegradadoCategorias();
  });
  observador.observe(contenedor, { childList: true });

  actualizarFlechas();
});






document.addEventListener("DOMContentLoaded", function () {

  // ==========================================
  // 1. FUENTE ÚNICA DEL CATÁLOGO (compartida con el widget
  //    del motor/carrito, 73bcd3e) — este widget es el dueño;
  //    el otro solo lee de aquí, así no puede haber dos copias
  //    desincronizadas nunca más.
  //
  //    El array se crea vacío y se llena cuando responde la API
  //    (GET /api/v1/catalogo de nodus_api, productos reales marcados
  //    "Disponible en PdV" en Nodus). Se mantiene la MISMA
  //    referencia de array (push, no reasignación) para que el
  //    otro script, que ya guardó su propia constante apuntando
  //    a este mismo array antes de que la petición resuelva,
  //    seà viendo los datos reales en cuanto lleguen.
  // ==========================================
  window.hadeonPOS = window.hadeonPOS || {};
  window.hadeonPOS.productos = window.hadeonPOS.productos || [];
  const productosPOS = window.hadeonPOS.productos;

  // 2. Elementos del DOM
  const contenedorPOS = document.getElementById('contenedor-productos-pos');
  const plantillaPOS = document.getElementById('tarjeta-plantilla-pos');
  const contenedorCategorias = document.getElementById('pos-categorias');
  const inputBuscador = document.getElementById('pos-buscador');

  if (!contenedorPOS || !plantillaPOS) {
    console.error("❌ [Hadeon] No se encontró #contenedor-productos-pos o #tarjeta-plantilla-pos. El catálogo no puede renderizarse.");
    return;
  }
  plantillaPOS.style.display = 'none';

  const actualizarDegradadoGrid = hadeonActivarDegradadoScroll(contenedorPOS);
  window.hadeonPOS.actualizarDegradadoGrid = actualizarDegradadoGrid;

  // 3. Variables de estado para los filtros
  let categoriasSeleccionadas = new Set(["Todas"]);
  let textoBusqueda = "";

  // ==========================================
  // LÓGICA DE CATEGORÍAS DINÁMICAS
  // ==========================================
  function renderizarCategorias() {
    if (!contenedorCategorias) return;
    contenedorCategorias.innerHTML = '';

    // Se recalcula en cada render (no una sola vez al cargar) porque el
    // catálogo llega async desde Nodus — al primer render todavía puede
    // estar vacío.
    const categoriasUnicas = ["Todas", ...new Set(productosPOS.map(p => p.categoria))];

    categoriasUnicas.forEach(cat => {
      const btn = document.createElement('button');
      btn.innerText = cat;
      btn.className = `pos-cat-btn ${categoriasSeleccionadas.has(cat) ? 'active' : 'inactive'}`;

      btn.onclick = (e) => {
        e.preventDefault();

        if (cat === "Todas") {
          categoriasSeleccionadas = new Set(["Todas"]);
        } else {
          categoriasSeleccionadas.delete("Todas");

          if (categoriasSeleccionadas.has(cat)) {
            categoriasSeleccionadas.delete(cat);
          } else {
            categoriasSeleccionadas.add(cat);
          }

          if (categoriasSeleccionadas.size === 0) {
            categoriasSeleccionadas.add("Todas");
          }
        }

        renderizarCategorias();
        renderizarGrilla();
      };

      contenedorCategorias.appendChild(btn);
    });
  }

  // ==========================================
  // LÓGICA DE CLONACIÓN Y FILTRADO
  // ==========================================
  function inyectarTexto(tarjeta, claseCss, texto) {
    const contenedor = tarjeta.querySelector(`.${claseCss}`);
    if (!contenedor) return;
    const elementoTexto = contenedor.querySelector('.pv-h') || contenedor.querySelector('.pv-wc') || contenedor;
    if (elementoTexto) elementoTexto.innerText = texto;
  }

  function renderizarGrilla() {
    Array.from(contenedorPOS.children).forEach(child => {
      if (child.id !== 'tarjeta-plantilla-pos') child.remove();
    });

    const filtrados = productosPOS.filter(prod => {
      const pasaCategoria = categoriasSeleccionadas.has("Todas") || categoriasSeleccionadas.has(prod.categoria);
      const pasaTexto = prod.nombre.toLowerCase().includes(textoBusqueda);
      return pasaCategoria && pasaTexto;
    });

    if (filtrados.length === 0) {
      const vacio = document.createElement('div');
      vacio.className = 'pos-catalogo-vacio';
      vacio.style.cssText = 'grid-column: 1 / -1; text-align:center; padding: 32px 16px; color: #8d909e; font-family: "Inter", sans-serif; font-size: 14px;';
      vacio.innerText = 'No se encontraron productos con ese filtro.';
      contenedorPOS.appendChild(vacio);
      actualizarDegradadoGrid();
      return;
    }

    filtrados.forEach(prod => {
      const nuevaTarjeta = plantillaPOS.cloneNode(true);
      nuevaTarjeta.removeAttribute('id');
      nuevaTarjeta.style.display = 'flex';
      nuevaTarjeta.setAttribute('data-producto-id', prod.id);

      inyectarTexto(nuevaTarjeta, 'pos-dato-nombre', prod.nombre);
      inyectarTexto(nuevaTarjeta, 'pos-dato-desc', prod.desc);
      inyectarTexto(nuevaTarjeta, 'pos-dato-precio', `$${prod.precio.toFixed(2)}`);
      const imgProd = nuevaTarjeta.querySelector('img');
      if (imgProd) { imgProd.removeAttribute('srcset'); imgProd.removeAttribute('loading'); imgProd.src = prod.imagen ? prod.imagen : '/nodus_interfaz/static/src/img/nodus_sin_imagen.png'; imgProd.style.objectFit = 'cover'; }

      const btnAgregar = nuevaTarjeta.querySelector('.pos-btn-agregar');
      if (btnAgregar) {
        btnAgregar.style.cursor = 'pointer';
      }

      contenedorPOS.appendChild(nuevaTarjeta);
    });

    actualizarDegradadoGrid();
  }

  // ==========================================
  // INICIADORES
  // ==========================================
  if (inputBuscador) {
    inputBuscador.addEventListener('input', (e) => {
      textoBusqueda = e.target.value.toLowerCase();
      renderizarGrilla();
    });
  }

  renderizarCategorias();
  renderizarGrilla();

  // ==========================================
  // BLOQUEO "SIN PRODUCTOS" — tapa catálogo + sidebar de mesas/cajas
  // con un aviso y bloquea toda interacción mientras el catálogo real
  // venga vacío (ver CSS de #pos-bloqueo-sin-productos). El flag
  // window.hadeonPOS.catalogoVacio lo consulta también irAVista() en
  // el otro script, como segunda barrera por si algo intenta navegar
  // igual (ej. un clic que ya estaba en curso).
  // ==========================================
  function actualizarBloqueoSinProductos(vacio) {
    window.hadeonPOS.catalogoVacio = vacio;
    const contenedor = document.getElementById('pos-catalogo-y-sidebar');
    let overlay = document.getElementById('pos-bloqueo-sin-productos');

    if (vacio) {
      if (contenedor) contenedor.classList.add('pos-sin-productos');
      if (!overlay && contenedor) {
        overlay = document.createElement('div');
        overlay.id = 'pos-bloqueo-sin-productos';
        overlay.innerHTML = `
          <div class="pos-bloqueo-tarjeta">
            <div class="pos-bloqueo-icono">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
            </div>
            <h3>Tu catálogo está vacío</h3>
            <p>Todavía no hay productos marcados como disponibles para Punto de Venta. Agrega al menos uno desde Inventario antes de empezar a vender.</p>
            <a class="pos-bloqueo-link" href="/odoo/inventario" target="_top">Ir a Inventario</a>
          </div>`;
        contenedor.appendChild(overlay);
      }
    } else {
      if (contenedor) contenedor.classList.remove('pos-sin-productos');
      if (overlay) overlay.remove();
    }
  }
  window.hadeonPOS.actualizarBloqueoSinProductos = actualizarBloqueoSinProductos;

  // ==========================================
  // CARGA REAL DESDE ODOO — reemplaza el placeholder vacío con el
  // catálogo real en cuanto responde la API y vuelve a pintar.
  // ==========================================
  nodusFetch('/catalogo')
    .then(data => {
      productosPOS.push(...data.productos);
      renderizarCategorias();
      renderizarGrilla();
      actualizarBloqueoSinProductos(productosPOS.length === 0);
    })
    .catch(err => console.error('❌ [Hadeon] No se pudo cargar el catálogo de Punto de Venta:', err));

});






document.addEventListener("DOMContentLoaded", function () {
  // =========================================================
  // ALTURA EXACTA DEL GRID (solo escritorio/tablet) — medida
  // en vivo con JS. En móvil no toca nada: ahí manda el 45vh
  // fijo del CSS personalizado del diseño anterior.
  // =========================================================
  function ajustarAlturaGridPOS() {
    const grid = document.getElementById('contenedor-productos-pos');
    if (!grid) return;

    if (window.innerWidth <= 767) {
      grid.style.removeProperty('max-height');
      return;
    }

    const rect = grid.getBoundingClientRect();
    const margenInferior = 16;
    const alturaDisponible = window.innerHeight - rect.top - margenInferior;

    grid.style.setProperty('max-height', alturaDisponible + 'px', 'important');
    if (window.innerWidth > 1024) {
      const hueco = 10, filas = 4, relleno = 22;
      const alto = Math.floor((alturaDisponible - relleno - hueco * (filas - 1)) / filas);
      grid.style.setProperty('grid-auto-rows', Math.max(alto, 112) + 'px', 'important');
    } else {
      grid.style.removeProperty('grid-auto-rows');
    }

    if (window.hadeonPOS && window.hadeonPOS.actualizarDegradadoGrid) {
      window.hadeonPOS.actualizarDegradadoGrid();
    }
  }

  ajustarAlturaGridPOS();
  window.addEventListener('resize', ajustarAlturaGridPOS);
  setTimeout(ajustarAlturaGridPOS, 300);
});






document.addEventListener("DOMContentLoaded", function () {
  // =========================================================
  // FIX REAL: el diseño anterior le ponía flex-grow:1 por defecto a TODOS
  // los hijos de un contenedor flex — eso hacía que los 4
  // hermanos (títulos, buscador/filtros, grid, widget del motor)
  // se repartieran el espacio sobrante por igual, creando huecos
  // entre cada sección en vez de que solo el grid creciera.
  //
  // Aquí apagamos el flex-grow en todo menos el grid, y le damos
  // TODO el crecimiento a él — así el resto queda agrupado
  // arriba, pegado a su contenido real, y el grid se estira solo
  // hacia abajo hasta el borde del contenedor principal.
  // =========================================================
  function fijarFlexGrowColumnaCatalogo() {
    const titulos = document.querySelector('.pv-4c68d36');
    const buscadorFiltros = document.querySelector('.pv-c8c8ed4');
    const grid = document.getElementById('contenedor-productos-pos');
    const widgetMotor = document.querySelector('.pv-4aff4d4');

    // 👉 El contenedor real que reparte el espacio entre estos 4
    // hermanos es el .pv-ci de 8e60904 — ahí es donde vivía
    // el "espacio uniforme" (justify-content: space-evenly/around).
    // Lo forzamos a flex-start para que no reparta nada: todo
    // queda agrupado arriba, pegado a su contenido real.
    const columna = document.querySelector('.pv-8e60904');
    const econInner = columna ? columna.querySelector(':scope > .pv-ci') : null;
    if (econInner) {
      econInner.style.setProperty('justify-content', 'flex-start', 'important');
      econInner.style.setProperty('align-content', 'flex-start', 'important');
    }

    [titulos, buscadorFiltros, widgetMotor].forEach(el => {
      if (!el) return;
      el.style.setProperty('flex-grow', '0', 'important');
      el.style.setProperty('flex-shrink', '0', 'important');
    });

    if (grid) {
      grid.style.setProperty('flex-grow', '1', 'important');
      grid.style.setProperty('flex-shrink', '1', 'important');
      grid.style.setProperty('min-height', '0', 'important');
    }
  }

  fijarFlexGrowColumnaCatalogo();
  window.addEventListener('resize', fijarFlexGrowColumnaCatalogo);
  setTimeout(fijarFlexGrowColumnaCatalogo, 300);
});






window.mostrarToast = function (mensaje, tipo) {
  const CONFIG_TOAST = {
    advertencia: {
      color: '#ea580c',
      icono: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>'
    },
    error: {
      color: '#dc2626',
      icono: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>'
    },
    info: {
      color: '#0047ab',
      icono: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>'
    }
  };

  const cfg = CONFIG_TOAST[tipo] || CONFIG_TOAST.info;

  // Solo un toast a la vez — si ya hay uno, lo quitamos antes de mostrar el nuevo
  const existente = document.querySelector('.hadeon-toast');
  if (existente) existente.remove();

  const toast = document.createElement('div');
  toast.className = 'hadeon-toast';
  toast.style.setProperty('--toast-color', cfg.color);
  toast.innerHTML = `
    <div class="hadeon-toast-icono">${cfg.icono}</div>
    <p class="hadeon-toast-mensaje">${mensaje}</p>
    <button class="hadeon-toast-cerrar" type="button" aria-label="Cerrar">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>
  `;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });
  });

  let temporizador;
  function cerrarToast() {
    clearTimeout(temporizador);
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }

  toast.querySelector('.hadeon-toast-cerrar').addEventListener('click', cerrarToast);
  temporizador = setTimeout(cerrarToast, 4000);
};






// Cliente HTTP para la API real de NODUS (nodus_api, instalado en la
// misma Nodus — ver /api/v1/*). Todo Punto de Venta habla con este
// backend ya existente, no con uno propio de hadeon_ui. Se declara a
// nivel de documento (no dentro de un DOMContentLoaded) para que
// cualquier <script> de esta página pueda usarlo sin importar el orden
// — mismo criterio que calcularDegradadoEje más abajo.
window.hadeonPOS = window.hadeonPOS || {};
window.hadeonPOS.csrfToken = null;

async function nodusFetchReal(path, opciones) {
  opciones = opciones || {};
  const metodo = opciones.method || 'GET';
  const headers = { 'Content-Type': 'application/json' };
  if (metodo !== 'GET' && window.hadeonPOS.csrfToken) {
    headers['X-CSRF-Token'] = window.hadeonPOS.csrfToken;
  }
  let resp;
  try {
    resp = await fetch('/nodus/api/v1' + path, {
      method: metodo,
      headers: headers,
      body: opciones.body ? JSON.stringify(opciones.body) : undefined,
    });
  } catch (e) {
    // Error de red real (servidor caido, CORS, etc.) -- no nodus_api
    // respondiendo con un error de negocio.
    e.hadeonInfraError = true;
    throw e;
  }
  let sobre;
  try {
    sobre = await resp.json();
  } catch (e) {
    // La respuesta no es JSON -- normalmente la pagina 404 de Nodus
    // cuando nodus_api no esta instalado en esta base, no un error de
    // negocio de nodus_api (que siempre contesta JSON).
    const err = new Error('nodus_api no respondio JSON en /api/v1' + path + ' (status ' + resp.status + ')');
    err.hadeonInfraError = true;
    throw err;
  }
  if (!sobre.ok) {
    // NO_ENCONTRADO/SIN_PERMISO/VALIDACION/etc. — ver errors.py de
    // nodus_api. error.code es lo que hay que mirar para distinguir
    // "no existe" de un error real (permiso, validación, servidor).
    // Esto es un error REAL de negocio -- nodus_api funciona, no cae
    // al mock.
    const error = new Error((sobre.error && sobre.error.message) || 'Error de NODUS.');
    error.code = sobre.error && sobre.error.code;
    error.status = resp.status;
    throw error;
  }
  return sobre.data;
}

async function nodusFetch(path, opciones) {
  // =========================================================
  // FALLBACK AUTOMATICO A DATOS DE EJEMPLO
  //
  // Si nodus_api no esta instalado o no responde en esta Nodus (caso
  // tipico: esta base solo tiene hadeon_ui, para que el equipo vea la
  // interfaz), nodusFetchReal falla con hadeonInfraError=true y acá
  // se usan datos mock en su lugar -- sin tocar nada a mano. En
  // cuanto nodus_api SI responda bien en esta base, vuelve a usar
  // datos reales solo, sin que nadie tenga que acordarse de "apagar"
  // nada.
  //
  // Un error de NEGOCIO real (ej. "cliente no encontrado",
  // SIN_PERMISO) nunca cae acá -- nodusFetchReal solo marca
  // hadeonInfraError en fallas de infraestructura (red/JSON), no en
  // respuestas válidas de nodus_api con ok:false.
  // =========================================================
  try {
    return await nodusFetchReal(path, opciones);
  } catch (e) {
    if (e.hadeonInfraError) {
      console.warn('[Hadeon] nodus_api no disponible en esta Nodus para ' + path + ':', e.message);
      throw e;
    }
    throw e;
  }
}


document.addEventListener("DOMContentLoaded", function () {
  // Token CSRF para las escrituras (POST) — se pide una sola vez al
  // cargar la página y se reusa en toda la sesión de Punto de Venta.
  nodusFetch('/sesion')
    .then(data => { window.hadeonPOS.csrfToken = data.csrf_token; })
    .catch(err => console.error('❌ [Hadeon] No se pudo iniciar sesión con NODUS:', err));
});






// Degradado dinámico de scroll — mismo sistema que ya usa Inventario
// (calcularDegradadoEje + aplicarMascara): el difuminado de cada lado
// se apaga solo cuando el scroll llega a ese límite, en vez de quedar
// siempre encendido en los dos extremos. Se declara aquí, a nivel de
// documento (no dentro de un DOMContentLoaded), para que cualquier
// otro <script> de esta página pueda usarlo sin importar el orden.
function calcularDegradadoEje(direccionCSS, posActual, maxPos) {
  if (maxPos <= 2) return null; // no hay desborde real en este eje
  const enInicio = posActual <= 2;
  const enFin = posActual >= maxPos - 2;
  const rampaSalida = `black calc(100% - 28px), rgba(0,0,0,0.55) calc(100% - 14px), rgba(0,0,0,0.15) calc(100% - 4px), transparent 100%`;
  const rampaEntrada = `transparent 0, rgba(0,0,0,0.15) 4px, rgba(0,0,0,0.55) 14px, black 28px`;
  if (enInicio) return `linear-gradient(${direccionCSS}, black 0, ${rampaSalida})`;
  if (enFin) return `linear-gradient(${direccionCSS}, ${rampaEntrada}, black 100%)`;
  return `linear-gradient(${direccionCSS}, ${rampaEntrada}, black calc(50% - 8px), black calc(50% + 8px), ${rampaSalida})`;
}

function aplicarMascara(el, gradientes) {
  const validos = gradientes.filter(Boolean);
  const valor = validos.length === 0 ? 'none' : validos.join(', ');
  // setProperty(..., 'important'): algunos contenedores de esta página
  // (p.ej. el grid de productos) ya traen su propio mask-image fijo con
  // !important desde el CSS personalizado del diseño anterior — un !important puesto
  // por JS en el propio elemento le sigue ganando a eso.
  el.style.setProperty('mask-image', valor, 'important');
  el.style.setProperty('-webkit-mask-image', valor, 'important');
  if (validos.length > 1) {
    // Dos ejes activos a la vez: hay que interseccionar los gradientes,
    // si no el "add"/"source-over" por defecto deja el elemento opaco
    // con que CUALQUIERA de los dos diga opaco.
    el.style.setProperty('mask-composite', 'intersect', 'important');
    el.style.setProperty('-webkit-mask-composite', 'source-in', 'important');
  } else {
    el.style.removeProperty('mask-composite');
    el.style.removeProperty('-webkit-mask-composite');
  }
}

// Conecta el degradado dinámico a un contenedor con scroll: se
// recalcula en cada scroll y cada vez que cambia su contenido. Detecta
// solo-vertical, solo-horizontal o ambos ejes automáticamente según el
// desborde real de "el".
function hadeonActivarDegradadoScroll(el) {
  if (!el) return;
  function actualizar() {
    const maxScrollTop = el.scrollHeight - el.clientHeight;
    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    const vertical = calcularDegradadoEje('to bottom', el.scrollTop, maxScrollTop);
    const horizontal = calcularDegradadoEje('to right', el.scrollLeft, maxScrollLeft);
    aplicarMascara(el, [vertical, horizontal]);
  }
  el.addEventListener('scroll', actualizar);
  window.addEventListener('resize', actualizar);
  actualizar();
  return actualizar;
}






document.addEventListener("DOMContentLoaded", function () {

  // 👉 Candado de seguridad: si este script ya corrió una vez en esta
  // página (por ejemplo porque el widget quedó pegado dos veces en
  // el diseño anterior por accidente), la segunda ejecución no hace nada. Sin
  // esto, quedan listeners y elementos duplicados que rompen la lógica.
  if (window.__hadeonPOSInicializado) return;
  window.__hadeonPOSInicializado = true;

  // ==========================================
  // 1. MESAS Y CAJAS — llegan de nodus_api (GET /api/v1/mesas), se
  //    llenan cuando responde la API (ver sección 6).
  // ==========================================
  let mesasNodus = [];
  let cajasNodus = [];
  let cajaActualId = null;

  // Misma referencia de array que el widget del catálogo (73bcd3e) —
  // si ese script ya corrió, aquí ya viene lleno; si no, se llena solo
  // en cuanto resuelva su propio fetch porque es el MISMO array.
  const productosPOS = window.hadeonPOS?.productos || [];

  const TASA_IMPUESTO = 0.16;
  const CARRITOS_STORAGE_KEY = 'hadeon_pos_carritos_por_servicio';

  // ==========================================
  // 2. REFERENCIAS A VISTAS Y ELEMENTOS
  // ==========================================
  const vista1 = document.getElementById("vista-mesas-pos");
  const vista2 = document.getElementById("vista-carrito-pos");
  const vista3 = document.getElementById("vista-checkout-pos");
  const vista4 = document.getElementById("vista-factura-pos");
  const todasLasVistas = [vista1, vista2, vista3, vista4];

  const contenedorMesas = document.getElementById('contenedor-mesas-pos');
  const plantillaMesa = document.getElementById('plantilla-mesa-pos');
  const plantillaCaja = document.getElementById('plantilla-caja-pos');
  const etiquetaMesa = document.getElementById('etiqueta-mesa-actual');

  const contenedorCarrito = document.getElementById('contenedor-carrito-pos');
  const plantillaItemCarrito = document.getElementById('plantilla-item-carrito');
  if (plantillaItemCarrito) {
    plantillaItemCarrito.style.display = 'none';
    plantillaItemCarrito.classList.add('carrito-item-card');
  }

  const actualizarDegradadoCarrito = hadeonActivarDegradadoScroll(contenedorCarrito);
  window.hadeonPOS = window.hadeonPOS || {};
  window.hadeonPOS.actualizarDegradadoCarrito = actualizarDegradadoCarrito;

  const actualizarDegradadoMesas = hadeonActivarDegradadoScroll(contenedorMesas);

  const gridProductos = document.getElementById('contenedor-productos-pos');

  // 👉 Envolvemos el grid en un wrapper (posición relativa) y le
  //    agregamos al lado el mensaje de "asigne el servicio", para
  //    poder mostrarlo centrado ENCIMA del grid difuminado sin que
  //    el mensaje mismo se difumine también.
  let mensajeServicioEl = null;
  if (gridProductos && gridProductos.parentNode) {
    const wrapper = document.createElement('div');
    wrapper.id = 'wrapper-productos-pos';
    gridProductos.parentNode.insertBefore(wrapper, gridProductos);
    wrapper.appendChild(gridProductos);

    mensajeServicioEl = document.createElement('div');
    mensajeServicioEl.className = 'mensaje-asignar-servicio';
    mensajeServicioEl.innerText = 'Por favor asigne el servicio';
    wrapper.appendChild(mensajeServicioEl);
  }

  let servicioActual = null;
  let cajaIdActual = null;
  let mesaIdActual = null;

  // ==========================================
  // 3. CARRITOS INDEPENDIENTES POR SERVICIO (Mesa/Caja)
  // ==========================================
  function cargarCarritosGuardados() {
    try {
      const guardado = localStorage.getItem(CARRITOS_STORAGE_KEY);
      return guardado ? JSON.parse(guardado) : {};
    } catch (e) {
      return {};
    }
  }

  function guardarCarritos() {
    try {
      localStorage.setItem(CARRITOS_STORAGE_KEY, JSON.stringify(carritosPorServicio));
    } catch (e) { /* localStorage no disponible, seguimos sin persistir */ }
  }

  let carritosPorServicio = cargarCarritosGuardados();

  function obtenerCarritoActual() {
    const clave = servicioActual || '_sin_servicio';
    if (!carritosPorServicio[clave]) carritosPorServicio[clave] = [];
    return carritosPorServicio[clave];
  }

  // Confirma la comanda: si hay mesa asignada, la bloquea en nodus_api
  // para que nadie más la tome mientras se atiende (ver detalle abajo —
  // nodus no soporta registrar una orden sin cobrar). La usan tanto
  // "Generar Comanda" (se queda en el carrito) como "Generar Orden" (la
  // confirma y recién después navega al pago).
  function enviarComanda(onExito) {
    const carrito = obtenerCarritoActual();
    if (carrito.length === 0) {
      mostrarToast("Agrega al menos un producto antes de generar la comanda.", "advertencia");
      return;
    }
    if (window.hadeonPOS.enviandoComanda) return;   // ya hay un envío en curso
    window.hadeonPOS.enviandoComanda = true;
    const libre = () => { window.hadeonPOS.enviandoComanda = false; };
    const alTerminar = () => {
      if (window.hadeonPOS.esMesero) { irAVista(vista1); cargarMesas(); }
      else if (onExito) onExito();
    };
    // Con mesa: la cuenta se guarda en el servidor y a cocina solo va lo que aún no se había enviado
    if (mesaIdActual) {
      guardarCuentaMesa(true)
        .then(r => {
          libre();
          mostrarToast((r.emitidas && r.emitidas.length) ? "Comanda enviada." : "Esa comanda ya estaba en cocina.", "info");
          alTerminar();
        })
        .catch(err => { libre(); mostrarToast(err.message || "No se pudo enviar la comanda.", "error"); });
      return;
    }
    // Mostrador (sin mesa): a cocina solo va lo que cambió desde la última comanda
    // (lo agregado como comanda nueva y lo quitado como aviso de cancelación)
    window.hadeonPOS.comandasEnviadas = window.hadeonPOS.comandasEnviadas || {};
    const clave = servicioActual || '_sin_servicio';
    const enviado = window.hadeonPOS.comandasEnviadas[clave] || {};
    const nuevas = carrito.map(i => ({ producto_id: i.id, cantidad: i.cantidad - (enviado[i.id] || 0) })).filter(l => l.cantidad > 0);
    const enCarrito = {};
    carrito.forEach(i => { enCarrito[i.id] = (enCarrito[i.id] || 0) + i.cantidad; });
    const quitadas = Object.keys(enviado)
      .map(k => ({ producto_id: parseInt(k, 10), cantidad: enviado[k] - (enCarrito[k] || 0) }))
      .filter(l => l.cantidad > 0);
    if (nuevas.length === 0 && quitadas.length === 0) {
      libre();
      mostrarToast("Esa comanda ya estaba en cocina.", "info");
      if (onExito) onExito();
      return;
    }
    window.hadeonPOS.ventaId = window.hadeonPOS.ventaId || (Date.now() + '-' + Math.random().toString(36).slice(2));
    const envios = [];
    if (nuevas.length) envios.push(nodusFetch('/comandas', { method: 'POST', body: {
      caja_id: cajaIdActual, servicio: servicioActual, lineas: nuevas, nota: window.hadeonPOS.notaPedido || '',
      token: window.hadeonPOS.ventaId + ':' + nuevas.map(l => l.producto_id + 'x' + l.cantidad).join(',')
    } }));
    if (quitadas.length) envios.push(nodusFetch('/comandas/cancelar', { method: 'POST', body: {
      caja_id: cajaIdActual, servicio: servicioActual, lineas: quitadas
    } }));
    Promise.all(envios)
      .then(() => {
        libre();
        const ahora = {};
        carrito.forEach(i => { ahora[i.id] = (ahora[i.id] || 0) + i.cantidad; });
        window.hadeonPOS.comandasEnviadas[clave] = ahora;
        mostrarToast(!Object.keys(enviado).length ? "Comanda enviada." : nuevas.length ? "Comanda actualizada en cocina." : "Se avisó a cocina lo que se quitó.", "info");
        if (onExito) onExito();
      })
      .catch(err => { libre(); mostrarToast(err.message || "No se pudo enviar la comanda.", "error"); });
  }

  // ==========================================
  // 4. HELPERS
  // ==========================================
  function inyectarTexto(tarjeta, claseCss, texto) {
    const contenedor = tarjeta.querySelector(`.${claseCss}`);
    if (!contenedor) return;
    const elementoTexto = contenedor.querySelector('.pv-h')
      || contenedor.querySelector('.pv-wc')
      || contenedor.querySelector('p, span, h4')
      || contenedor;
    if (elementoTexto) elementoTexto.innerText = texto;
  }

  function setTextoPorClaseGlobal(claseCss, texto, scopeEl = document) {
    const el = scopeEl.querySelector(`.${claseCss}`);
    if (!el) return;
    const target = el.querySelector('.pv-h') || el.querySelector('.pv-wc') || el;
    target.innerText = texto;
  }

  function marcarCampoInvalido(input, invalido) {
    if (!input) return;
    input.classList.toggle('campo-invalido', invalido);
  }

  // ==========================================
  // 5. MÁQUINA DE ESTADOS (CAMBIO DE VISTAS)
  // ==========================================
  function irAVista(vistaDestino, nombreServicio = null, idsServicio = null) {
    // Segunda barrera (la primera es el overlay visual que tapa el
    // catálogo/mesas): si el catálogo real vino vacío, no se deja
    // avanzar a ninguna vista más allá de la 1, sin importar qué haya
    // disparado el clic.
    if (window.hadeonPOS && window.hadeonPOS.catalogoVacio && vistaDestino !== vista1) {
      mostrarToast("Agrega al menos un producto a tu catálogo antes de usar el Punto de Venta.", "advertencia");
      return;
    }

    if (nombreServicio) {
      servicioActual = nombreServicio;
      cajaIdActual = idsServicio && idsServicio.cajaId != null ? idsServicio.cajaId : null;
      mesaIdActual = idsServicio && idsServicio.mesaId != null ? idsServicio.mesaId : null;
      if (etiquetaMesa) {
        const textoTag = etiquetaMesa.querySelector('.pv-h') || etiquetaMesa;
        // "Caja Principal · Orden 2" se muestra "Orden 2": la caja ya se sabe y así cabe junto al título
        textoTag.innerText = servicioActual.replace(/^.* · (Orden \d+)$/, '$1');
        etiquetaMesa.setAttribute('title', servicioActual + ' · cambiar a quién se cobra');
      }
      renderizarCarrito();
    }

    todasLasVistas.forEach(v => {
      if (v) {
        v.style.setProperty("display", "none", "important");
        v.classList.remove("vista-animada");
      }
    });

    if (vistaDestino) {
      vistaDestino.style.setProperty("display", "flex", "important");
      void vistaDestino.offsetWidth;
      vistaDestino.classList.add("vista-animada");
    }

    if (typeof renderizarOrdenesAbiertas === 'function') renderizarOrdenesAbiertas();

    // 👉 Bloqueo/difuminado del catálogo fuera de Vista 2 (Carrito)
    if (gridProductos) {
      const debeBloquear = (vistaDestino === vista1 || vistaDestino === vista3 || vistaDestino === vista4);
      gridProductos.classList.toggle('grid-bloqueada', debeBloquear);
    }

    // 👉 El mensaje "Por favor asigne el servicio" es exclusivo de
    // Vista 1 — Checkout y Factura bloquean el grid pero NO muestran
    // este mensaje (ahí ya hay un servicio asignado).
    if (mensajeServicioEl) {
      mensajeServicioEl.classList.toggle('mensaje-visible', vistaDestino === vista1);
    }

    // Lógica de teléfono (ancho <= 767px)
    if (window.innerWidth <= 767) {
      const contenedorArriba = document.getElementById('contenedor-productos-pos');
      const barraFiltrosArriba = document.querySelector('.pos-header-bar');

      if (vistaDestino === vista1 || vistaDestino === vista3 || vistaDestino === vista4) {
        if (contenedorArriba) contenedorArriba.style.setProperty("display", "none", "important");
        if (barraFiltrosArriba) barraFiltrosArriba.style.setProperty("display", "none", "important");
      } else {
        if (contenedorArriba) contenedorArriba.style.setProperty("display", "grid", "important");
        if (barraFiltrosArriba) barraFiltrosArriba.style.setProperty("display", "flex", "important");
      }

      window.scrollTo(0, 0);
    }
  }

  irAVista(vista1);

  // ==========================================
  // 6. RENDER DE CAJAS Y MESAS (datos reales de Nodus)
  // ==========================================
  if (plantillaMesa) plantillaMesa.style.display = 'none';
  if (plantillaCaja) plantillaCaja.style.display = 'none';

  // ===== Nodus: abrir y cerrar caja =====
  function nodusModal(titulo, sub, cuerpoHtml, textoOk, alGuardar) {
    const fondo = document.createElement('div');
    fondo.className = 'nodus-modal-fondo';
    fondo.innerHTML = '<div class="nodus-modal" role="dialog"><h3></h3><p class="nodus-modal-sub"></p><div class="nodus-modal-cuerpo"></div>' +
      '<p class="nodus-error-form"></p><div class="nodus-modal-pie"><button type="button" class="nodus-btn-sec" data-nm-cerrar>Cancelar</button>' +
      '<button type="button" class="nodus-btn-pri" data-nm-ok></button></div></div>';
    fondo.querySelector('h3').textContent = titulo;
    fondo.querySelector('.nodus-modal-sub').textContent = sub;
    fondo.querySelector('.nodus-modal-cuerpo').innerHTML = cuerpoHtml;
    fondo.querySelector('[data-nm-ok]').textContent = textoOk;
    document.body.appendChild(fondo);
    const cerrar = () => fondo.remove();
    fondo.querySelector('[data-nm-cerrar]').addEventListener('click', cerrar);
    fondo.addEventListener('mousedown', e => { if (e.target === fondo) cerrar(); });
    const ok = fondo.querySelector('[data-nm-ok]');
    const err = fondo.querySelector('.nodus-error-form');
    ok.addEventListener('click', () => {
      err.textContent = '';
      ok.disabled = true;
      Promise.resolve(alGuardar(fondo)).then(() => { cerrar(); cargarMesas(); })
        .catch(e => { ok.disabled = false; err.textContent = e.message || 'No se pudo completar.'; });
    });
    const primero = fondo.querySelector('input, textarea');
    if (primero) primero.focus();
  }

  const dinero = n => '$' + Number(n || 0).toFixed(2);

  function abrirModalCaja(caja) {
    nodusModal('Abrir caja', caja.nombre, '<label>Efectivo inicial en la caja ($)</label><input type="number" id="nm-efectivo" min="0" step="0.01" value="0" inputmode="decimal">' +
      '<label>Notas (opcional)</label><textarea id="nm-notas" rows="2" placeholder="Ej. Turno de la mañana"></textarea>', 'Abrir caja', m =>
      nodusFetch('/caja/abrir', { method: 'POST', body: { caja_id: caja.id, efectivo_inicial: m.querySelector('#nm-efectivo').value, notas: m.querySelector('#nm-notas').value } })
        .then(() => mostrarToast('Caja abierta. Ya puedes vender.', 'info')));
  }

  function cerrarModalCaja(caja) {
    nodusFetch('/caja?caja_id=' + caja.id).then(est => {
      const s = est.sesion || {};
      const resumen = '<div class="nodus-resumen"><span>Ventas de la sesión</span><strong>' + dinero(s.ventas) + ' (' + (s.ordenes || 0) + ')</strong>' +
        '<span>Efectivo inicial</span><strong>' + dinero(s.efectivo_inicial) + '</strong><span>Efectivo esperado</span><strong>' + dinero(s.efectivo_esperado) + '</strong></div>' +
        (s.pendientes ? '<p class="nodus-error-form" style="margin:10px 0 0;">Hay ' + s.pendientes + (s.pendientes === 1 ? ' pedido' : ' pedidos') + ' sin cobrar en esta caja. Hay que cobrarlos o cancelarlos antes de cerrarla.</p>' : '');
      const contado = s.controla_efectivo ? '<label>Efectivo contado ($)</label><input type="number" id="nm-contado" min="0" step="0.01" value="' + Number(s.efectivo_esperado || 0).toFixed(2) + '" inputmode="decimal">' : '';
      const hayPend = !!s.pendientes;
      nodusModal('Cerrar caja', caja.nombre, resumen + contado + '<label>Notas (opcional)</label><textarea id="nm-notas" rows="2"></textarea>', 'Cerrar caja', m =>
        nodusFetch('/caja/cerrar', { method: 'POST', body: { caja_id: caja.id, efectivo_contado: m.querySelector('#nm-contado') ? m.querySelector('#nm-contado').value : null, notas: m.querySelector('#nm-notas').value } })
          .then(() => mostrarToast('Caja cerrada.', 'info')));
      if (hayPend) { const ok = document.querySelector('.nodus-modal-fondo [data-nm-ok]'); if (ok) ok.disabled = true; }
    }).catch(err => mostrarToast(err.message || 'No se pudo leer la caja.', 'error'));
  }

  // ===== Nodus: devoluciones =====
  function abrirModalDevolucion() {
    const caja = cajasNodus.find(c => c.abierta);
    if (!caja) { mostrarToast('Abre una caja para registrar devoluciones.', 'advertencia'); return; }
    const fondo = document.createElement('div');
    fondo.className = 'nodus-modal-fondo';
    fondo.innerHTML = '<div class="nodus-modal nodus-modal-ancho" role="dialog"><h3>Devolución de venta</h3>' +
      '<p class="nodus-modal-sub">Busca la venta por número de factura, ticket o nombre del cliente.</p>' +
      '<div class="nodus-buscar"><input type="text" id="nd-buscar" placeholder="Ej. INV/2026/00012 o nombre del cliente" autocomplete="off"><button type="button" class="nodus-btn-sec" id="nd-ir">Buscar</button></div>' +
      '<div id="nd-resultados" class="nodus-lista"></div><div id="nd-detalle"></div><p class="nodus-error-form" id="nd-error"></p>' +
      '<div class="nodus-modal-pie"><button type="button" class="nodus-btn-sec" data-nm-cerrar>Cancelar</button><button type="button" class="nodus-btn-pri" id="nd-ok" disabled>Registrar devolución</button></div></div>';
    document.body.appendChild(fondo);
    const q = id => fondo.querySelector('#' + id);
    const cerrar = () => fondo.remove();
    fondo.querySelector('[data-nm-cerrar]').addEventListener('click', cerrar);
    fondo.addEventListener('mousedown', e => { if (e.target === fondo) cerrar(); });
    let metodos = [], elegida = null, leer = null;
    nodusFetch('/metodos-pago?caja_id=' + caja.id).then(m => { metodos = m; }).catch(() => {});

    function buscar() {
      q('nd-error').textContent = '';
      nodusFetch('/ordenes?buscar=' + encodeURIComponent(q('nd-buscar').value.trim())).then(d => {
        const lista = q('nd-resultados');
        lista.textContent = '';
        elegida = null; leer = null; q('nd-detalle').textContent = ''; q('nd-ok').disabled = true;
        if (!d.ordenes.length) {
          const v = document.createElement('p'); v.className = 'nodus-modal-sub'; v.textContent = 'No se encontró ninguna venta con productos por devolver.'; lista.appendChild(v); return;
        }
        d.ordenes.forEach(o => {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'nodus-item-venta';
          const a = document.createElement('span'); a.textContent = o.numero + ' · ' + o.cliente;
          const c = document.createElement('strong'); c.textContent = dinero(o.total);
          const f = document.createElement('small'); f.textContent = o.fecha;
          b.appendChild(a); b.appendChild(c); b.appendChild(f);
          b.addEventListener('click', () => seleccionar(o));
          lista.appendChild(b);
        });
      }).catch(e => { q('nd-error').textContent = e.message; });
    }

    function seleccionar(o) {
      elegida = o;
      q('nd-resultados').textContent = '';
      const det = q('nd-detalle'); det.textContent = '';
      const tit = document.createElement('p'); tit.className = 'nodus-modal-sub'; tit.textContent = 'Venta ' + o.numero + ': ¿qué se devuelve?'; det.appendChild(tit);
      const inputs = [];
      o.lineas.forEach(l => {
        const fila = document.createElement('div'); fila.className = 'nodus-fila-dev';
        const n = document.createElement('span'); n.textContent = l.nombre + ' (' + dinero(l.precio) + ')';
        const inp = document.createElement('input'); inp.type = 'number'; inp.min = '0'; inp.max = l.disponible; inp.step = 'any'; inp.value = '0';
        const mx = document.createElement('small'); mx.textContent = 'de ' + l.disponible;
        inp.addEventListener('input', recalcular);
        fila.appendChild(n); fila.appendChild(inp); fila.appendChild(mx); det.appendChild(fila); inputs.push([l, inp]);
      });
      const lab = document.createElement('label'); lab.textContent = 'Devolver el dinero por'; det.appendChild(lab);
      const sel = document.createElement('select');
      let marcado = false;
      metodos.forEach(m => {
        const op = document.createElement('option'); op.value = m.id; op.textContent = m.nombre;
        if (!marcado && (o.metodos || []).indexOf(m.id) !== -1) { op.selected = true; marcado = true; }
        sel.appendChild(op);
      });
      det.appendChild(sel);
      const lab2 = document.createElement('label'); lab2.textContent = 'Motivo (opcional)'; det.appendChild(lab2);
      const mot = document.createElement('input'); mot.type = 'text'; mot.placeholder = 'Ej. producto dañado'; det.appendChild(mot);
      const tot = document.createElement('p'); tot.className = 'nodus-total-dev'; det.appendChild(tot);
      function recalcular() {
        let t = 0;
        inputs.forEach(([l, i]) => {
          let v = parseFloat(i.value) || 0;
          if (v > l.disponible) { v = l.disponible; i.value = v; }
          if (v < 0) { v = 0; i.value = 0; }
          t += v * l.precio;
        });
        tot.textContent = 'Se devuelven ' + dinero(t);
        q('nd-ok').disabled = t <= 0;
      }
      recalcular();
      leer = () => ({ lineas: inputs.map(([l, i]) => ({ linea_id: l.id, cantidad: parseFloat(i.value) || 0 })).filter(x => x.cantidad > 0), metodo_id: sel.value, motivo: mot.value });
    }

    q('nd-ir').addEventListener('click', buscar);
    q('nd-buscar').addEventListener('keydown', e => { if (e.key === 'Enter') buscar(); });
    q('nd-ok').addEventListener('click', () => {
      if (!elegida || !leer) return;
      const ok = q('nd-ok'); ok.disabled = true; q('nd-error').textContent = '';
      const datos = leer(); datos.orden_id = elegida.id; datos.caja_id = caja.id;
      nodusFetch('/devoluciones', { method: 'POST', body: datos })
        .then(r => { mostrarToast('Devolución registrada: ' + r.numero + ' (' + dinero(r.total) + ')', 'info'); cerrar(); cargarMesas(); })
        .catch(e => { ok.disabled = false; q('nd-error').textContent = e.message || 'No se pudo registrar la devolución.'; });
    });
    q('nd-buscar').focus();
    buscar();
  }

  function controlesCaja(caja) {
    const caja_el = document.createElement('div');
    caja_el.className = 'nodus-caja-estado';
    const pildora = document.createElement('span');
    pildora.className = 'nodus-pildora ' + (caja.abierta ? 'abierta' : 'cerrada');
    pildora.textContent = caja.abierta ? 'Abierta' : 'Cerrada';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nodus-btn-mini';
    btn.textContent = caja.abierta ? 'Cerrar' : 'Abrir';
    btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); caja.abierta ? cerrarModalCaja(caja) : abrirModalCaja(caja); });
    caja_el.appendChild(pildora);
    caja_el.appendChild(btn);
    return caja_el;
  }

  // ===== Nodus: cuenta abierta de la mesa (la arma el mesero, la cobra la caja) =====
  let guardadoCuenta = null;
  function guardarCuentaMesa(enviar) {
    if (!mesaIdActual) return Promise.resolve({});
    const carrito = obtenerCarritoActual();
    return nodusFetch('/cuentas/' + encodeURIComponent(mesaIdActual), { method: 'POST', body: {
      lineas: carrito.map(i => ({ producto_id: i.id, cantidad: i.cantidad })), propina_pct: window.hadeonPOS.propinaPct || 0,
      nota: window.hadeonPOS.notaPedido || '', enviar: !!enviar, caja_id: cajaIdActual, servicio: servicioActual } });
  }
  function programarGuardadoCuenta() {
    clearTimeout(guardadoCuenta);
    guardadoCuenta = setTimeout(() => { guardarCuentaMesa(false).catch(() => {}); }, 600);
  }
  function abrirCuentaMesa(mesa, cajaId) {
    nodusFetch('/cuentas/' + encodeURIComponent(mesa.id)).then(c => {
      carritosPorServicio[mesa.nombre] = (c.lineas || []).map(l => {
        const p = productosPOS.find(x => x.id === l.producto_id);
        return p ? { id: p.id, nombre: p.nombre, precio: p.precio, iva: p.iva, cantidad: l.cantidad } : null;
      }).filter(Boolean);
      window.hadeonPOS.propinaPct = c.propina_pct || 0;
      window.hadeonPOS.notaPedido = c.nota || '';
      const inp = document.getElementById('nodus-propina-pct');
      if (inp) inp.value = window.hadeonPOS.propinaPct;
      irAVista(vista2, mesa.nombre, { cajaId: cajaId, mesaId: mesa.id });
    }).catch(e => mostrarToast(e.message || 'No se pudo abrir la mesa.', 'error'));
  }
  // ===== Nodus: elegir a quién se cobra (mostrador o una mesa con cuenta abierta) =====
  (function () {
    const st = document.createElement('style');
    st.textContent = ["#etiqueta-mesa-actual { cursor: pointer !important; }", "#etiqueta-mesa-actual .pv-h { display: inline-flex !important; align-items: center !important; gap: 6px !important; }", "#etiqueta-mesa-actual .pv-h::after { content: '' !important; width: 10px !important; height: 10px !important; background: currentColor !important; -webkit-mask: url(\"data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27black%27 stroke-width=%273%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E\") center / contain no-repeat !important; mask: url(\"data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27black%27 stroke-width=%273%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E\") center / contain no-repeat !important; }", ".nodus-cobro-overlay { position: fixed !important; inset: 0 !important; z-index: 250000 !important; display: flex !important; align-items: center !important; justify-content: center !important; padding: 16px !important; background: rgba(17,24,39,.4) !important; backdrop-filter: blur(6px) !important; -webkit-backdrop-filter: blur(6px) !important; text-align: left !important; }", ".nodus-cobro-tarjeta { width: 100% !important; max-width: 420px !important; max-height: calc(100vh - 32px) !important; display: flex !important; flex-direction: column !important; background: #fff !important; border-radius: 20px !important; box-shadow: 0 20px 50px rgba(0,0,0,.25) !important; overflow: hidden !important; font-family: Inter, sans-serif !important; }", ".nodus-cobro-cab { padding: 20px 24px 12px !important; }", ".nodus-cobro-cab h3 { margin: 0 !important; font: 600 18px Poppins, sans-serif !important; color: #1A1A24 !important; }", ".nodus-cobro-cab p { margin: 4px 0 0 !important; font-size: 13px !important; color: #6B7280 !important; }", ".nodus-cobro-lista { padding: 4px 16px 16px !important; overflow-y: auto !important; display: flex !important; flex-direction: column !important; gap: 8px !important; }", ".nodus-cobro-sec { margin: 8px 8px 0 !important; font: 600 11px Poppins, sans-serif !important; letter-spacing: .05em !important; text-transform: uppercase !important; color: #6B7280 !important; }", ".nodus-cobro-op { display: flex !important; align-items: center !important; gap: 12px !important; width: 100% !important; padding: 12px 14px !important; border: 1px solid #EEF0F4 !important; border-radius: 12px !important; background: #fff !important; cursor: pointer !important; text-align: left !important; font: inherit !important; color: #1F2937 !important; transition: border-color .2s ease, background .2s ease !important; }", ".nodus-cobro-op:hover { border-color: #C9D6F2 !important; background: #F7F9FF !important; }", ".nodus-cobro-op.activa { border-color: #0047AB !important; background: #E8F0FF !important; }", ".nodus-cobro-ic { flex: 0 0 36px !important; width: 36px !important; height: 36px !important; border-radius: 10px !important; display: flex !important; align-items: center !important; justify-content: center !important; background: #0047AB !important; color: #fff !important; font: 700 13px Poppins, sans-serif !important; }", ".nodus-cobro-txt { flex: 1 1 auto !important; min-width: 0 !important; display: flex !important; flex-direction: column !important; }", ".nodus-cobro-txt b { font-size: 14px !important; font-weight: 600 !important; color: #1A1A24 !important; }", ".nodus-cobro-txt span { font-size: 12px !important; color: #6B7280 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }", ".nodus-cobro-vacio { padding: 16px !important; border: 1px dashed #E5E7EB !important; border-radius: 12px !important; text-align: center !important; font-size: 13px !important; color: #9CA3AF !important; }", ".nodus-cobro-pie { padding: 12px 24px 20px !important; display: flex !important; justify-content: flex-end !important; border-top: 1px solid #EEF0F4 !important; }", ".nodus-cobro-pie button { height: 40px !important; padding: 0 18px !important; border: 1px solid #D1D5DB !important; border-radius: 8px !important; background: #fff !important; color: #374151 !important; font: 600 14px Inter, sans-serif !important; cursor: pointer !important; }"].join('\n');
    document.head.appendChild(st);
  })();

  function escCobro(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function cerrarSelectorCobro() {
    const o = document.getElementById('nodus-cobro-overlay');
    if (o) o.remove();
  }
  function abrirSelectorCobro() {
    if (!cajaIdActual) return;   // el mesero no elige: trabaja en su mesa
    nodusFetch('/mesas').then(data => {
      if ((data.rol || '') === 'mesero') return;
      const caja = (data.cajas || []).find(c => c.id === cajaIdActual) || { nombre: 'Mostrador' };
      const abiertas = (data.mesas || []).filter(m => m.ocupada);
      cerrarSelectorCobro();
      const iniciales = n => String(n).split(' ').filter(Boolean).map(x => x[0]).join('').slice(0, 2).toUpperCase();
      let html = '<div class="nodus-cobro-tarjeta" role="dialog" aria-modal="true">' +
        '<div class="nodus-cobro-cab"><h3>¿A quién le cobras?</h3><p>Elige la venta de mostrador o una mesa con cuenta abierta.</p></div>' +
        '<div class="nodus-cobro-lista"><div class="nodus-cobro-sec">Mostrador</div>' +
        '<button type="button" class="nodus-cobro-op" data-tipo="caja">' +
        '<span class="nodus-cobro-ic">' + escCobro(iniciales(caja.nombre)) + '</span>' +
        '<span class="nodus-cobro-txt"><b>' + escCobro(caja.nombre) + '</b><span>Empezar una orden nueva en esta caja</span></span></button>' +
        ordenesDeCaja(caja).map(o => '<button type="button" class="nodus-cobro-op' + (o.clave === servicioActual ? ' activa' : '') +
          '" data-tipo="orden" data-clave="' + escCobro(o.clave) + '"><span class="nodus-cobro-ic">#' + o.n + '</span>' +
          '<span class="nodus-cobro-txt"><b>Orden ' + o.n + '</b><span>' + escCobro(caja.nombre) + ' · $' + totalDeCarrito(o.carrito).toFixed(2) + '</span></span></button>').join('') +
        '<div class="nodus-cobro-sec">Mesas con cuenta abierta</div>';
      if (!abiertas.length) {
        html += '<div class="nodus-cobro-vacio">No hay mesas con cuenta abierta.</div>';
      } else {
        abiertas.forEach(m => {
          html += '<button type="button" class="nodus-cobro-op' + (String(m.id) === String(mesaIdActual) ? ' activa' : '') +
            '" data-tipo="mesa" data-id="' + escCobro(m.id) + '">' +
            '<span class="nodus-cobro-ic">' + escCobro(iniciales(m.nombre)) + '</span>' +
            '<span class="nodus-cobro-txt"><b>' + escCobro(m.nombre) + '</b><span>' + escCobro(m.estado) + '</span></span></button>';
        });
      }
      html += '</div><div class="nodus-cobro-pie"><button type="button" data-tipo="cerrar">Cancelar</button></div></div>';
      const ov = document.createElement('div');
      ov.id = 'nodus-cobro-overlay';
      ov.className = 'nodus-cobro-overlay';
      ov.innerHTML = html;
      ov.addEventListener('click', e => {
        if (e.target === ov) { cerrarSelectorCobro(); return; }
        const b = e.target.closest('[data-tipo]');
        if (!b) return;
        const tipo = b.getAttribute('data-tipo');
        cerrarSelectorCobro();
        if (tipo === 'caja') {
          irAVista(vista2, nuevaOrdenDeCaja(caja), { cajaId: cajaIdActual, mesaId: null });
        } else if (tipo === 'orden') {
          const clave = b.getAttribute('data-clave');
          if (clave !== servicioActual) irAVista(vista2, clave, { cajaId: cajaIdActual, mesaId: null });
        } else if (tipo === 'mesa') {
          const mesa = abiertas.find(m => String(m.id) === b.getAttribute('data-id'));
          if (mesa && String(mesa.id) !== String(mesaIdActual)) abrirCuentaMesa(mesa, cajaIdActual);
        }
      });
      document.body.appendChild(ov);
    }).catch(e => mostrarToast(e.message || 'No se pudieron cargar las mesas.', 'error'));
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarSelectorCobro(); });
  (function () {
    const tag = document.getElementById('etiqueta-mesa-actual');
    if (!tag) return;
    tag.setAttribute('title', 'Cambiar a quién se cobra');
    tag.addEventListener('click', abrirSelectorCobro);
  })();

  (function () {
    if (document.getElementById('nodus-aviso-caja')) return;
    const av = document.createElement('div');
    av.id = 'nodus-aviso-caja';
    av.innerHTML = '<div class="nodus-aviso-tarjeta"><strong>La caja está cerrada</strong><span>Para poder trabajar, primero hay que abrir la caja. Avísale al cajero.</span></div>';
    document.body.appendChild(av);
  })();
  const inputPropina = document.getElementById('nodus-propina-pct');
  if (inputPropina) inputPropina.addEventListener('input', () => {
    let v = parseFloat(inputPropina.value); if (isNaN(v) || v < 0) v = 0; if (v > 100) v = 100;
    window.hadeonPOS.propinaPct = v; renderizarCarrito();
  });

  // ===== Nodus: órdenes abiertas =====
  // En la caja se pueden tener varias órdenes a la vez ("Caja Principal · Orden 2"); las mesas con cuenta abierta
  // también aparecen en la lista. Tocar una orden la retoma donde se dejó.
  const PREFIJO_ORDEN = ' · Orden ';
  function totalDeCarrito(carrito) {
    return carrito.reduce((acc, i) => acc + i.precio * i.cantidad * (1 + (typeof i.iva === 'number' ? i.iva : TASA_IMPUESTO)), 0);
  }
  function numeroDeOrden(caja, clave) {
    return clave === caja.nombre ? 1 : parseInt(clave.slice((caja.nombre + PREFIJO_ORDEN).length), 10) || 0;
  }
  function ordenesDeCaja(caja) {
    return Object.keys(carritosPorServicio)
      .filter(k => (k === caja.nombre || k.indexOf(caja.nombre + PREFIJO_ORDEN) === 0) && (carritosPorServicio[k] || []).length)
      .map(k => ({ clave: k, n: numeroDeOrden(caja, k), carrito: carritosPorServicio[k] }))
      .sort((x, y) => x.n - y.n);
  }
  function nuevaOrdenDeCaja(caja) {
    const usados = Object.keys(carritosPorServicio)
      .filter(k => k === caja.nombre || k.indexOf(caja.nombre + PREFIJO_ORDEN) === 0)
      .map(k => numeroDeOrden(caja, k));
    const n = (usados.length ? Math.max.apply(null, usados) : 0) + 1;
    return caja.nombre + PREFIJO_ORDEN + n;
  }
  function entrarAMesa(mesa) {
    // nodus_api no liga cada mesa a una caja propia: resuelve una sola "caja_actual" para todo el punto de venta.
    const cajaDeRespaldo = cajasNodus.length ? cajasNodus[0].id : null;
    const cajaDeMesa = cajasNodus.find(c => c.id === (cajaActualId || cajaDeRespaldo));
    if (cajaDeMesa && !cajaDeMesa.abierta) { abrirModalCaja(cajaDeMesa); return; }
    abrirCuentaMesa(mesa, cajaActualId || cajaDeRespaldo);
  }
  // Tira de órdenes: un cuadrito (#1, #2…) por cada orden de la caja, a la derecha del panel de pasos.
  // Solo existe con la caja abierta y al menos una orden; el panel de pasos se corre a la izquierda para dejarle sitio.
  function renderizarOrdenesAbiertas() {
    const fila = document.getElementById('pos-catalogo-y-sidebar');
    const lateral = document.getElementById('hadeon-pos-sidebar');
    if (!fila || !lateral) return;
    let tira = document.getElementById('nodus-tira-ordenes');
    if (!tira) {
      tira = document.createElement('div');
      tira.id = 'nodus-tira-ordenes';
      tira.setAttribute('aria-label', 'Órdenes abiertas');
    }
    // Con el panel de pasos como bandeja (teléfono/tablet) la tira va dentro, arriba; en escritorio, a su derecha.
    const estrecho = window.innerWidth <= 1024;
    const asaBandeja = lateral.querySelector(':scope > .nodus-asa');
    if (estrecho) {
      const ref = asaBandeja ? asaBandeja.nextSibling : lateral.firstChild;
      if (tira.parentNode !== lateral || tira.previousSibling !== (asaBandeja || null)) lateral.insertBefore(tira, ref);
    }
    else if (tira.previousElementSibling !== lateral) lateral.insertAdjacentElement('afterend', tira);
    tira.classList.toggle('nodus-tira-horizontal', estrecho);

    const items = [];
    cajasNodus.filter(c => c.abierta).forEach(caja => {
      const ordenes = ordenesDeCaja(caja);
      const actual = !mesaIdActual && servicioActual && cajaIdActual === caja.id
        && servicioActual.indexOf(caja.nombre + PREFIJO_ORDEN) === 0 && !ordenes.some(o => o.clave === servicioActual);
      if (actual) ordenes.push({ clave: servicioActual, n: numeroDeOrden(caja, servicioActual), carrito: [] });
      ordenes.sort((x, y) => x.n - y.n).forEach(o => items.push({ caja, o }));
    });
    // Las mesas con cuenta abierta (o la mesa que se está atendiendo) también son órdenes de la caja
    const cajasAbiertas = cajasNodus.filter(c => c.abierta);
    const cajaBase = cajasAbiertas.find(c => c.id === cajaIdActual) || cajasAbiertas[0];
    if (cajaBase) {
      mesasNodus.filter(m => m.ocupada || m.id === mesaIdActual).forEach(m => items.push({ caja: cajaBase, mesa: m }));
    }
    const hay = items.length > 0;
    tira.classList.toggle('con-ordenes', hay);
    fila.classList.toggle('nodus-hay-ordenes', hay);
    tira.textContent = '';
    if (!hay) return;
    const rotulo = document.createElement('span');
    rotulo.className = 'nodus-tira-rotulo';
    rotulo.textContent = 'ÓRDENES';
    tira.appendChild(rotulo);
    items.forEach(({ caja, o, mesa }) => {
      if (mesa) {
        const bm = document.createElement('button');
        bm.type = 'button';
        bm.className = 'nodus-orden-cuadro nodus-orden-mesa' + (mesa.id === mesaIdActual ? ' activa' : '');
        bm.textContent = 'M' + (String(mesa.nombre).match(/\d+/) || [''])[0];
        bm.title = mesa.nombre + (mesa.estado ? ' · ' + mesa.estado : '');
        bm.addEventListener('click', e => { e.preventDefault(); if (mesa.id !== mesaIdActual) entrarAMesa(mesa); });
        tira.appendChild(bm);
        return;
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'nodus-orden-cuadro' + (o.clave === servicioActual ? ' activa' : '');
      b.textContent = '#' + o.n;
      const unidades = o.carrito.reduce((a, i) => a + i.cantidad, 0);
      b.title = o.clave + ' · ' + unidades + (unidades === 1 ? ' producto' : ' productos') + ' · $' + totalDeCarrito(o.carrito).toFixed(2);
      b.addEventListener('click', e => { e.preventDefault(); irAVista(vista2, o.clave, { cajaId: caja.id, mesaId: null }); });
      tira.appendChild(b);
    });
    const abierta = { caja: cajaBase };
    const mas = document.createElement('button');
    mas.type = 'button';
    mas.className = 'nodus-orden-cuadro nodus-orden-nueva';
    mas.textContent = '+';
    mas.title = 'Nueva orden';
    mas.addEventListener('click', e => { e.preventDefault(); irAVista(vista2, nuevaOrdenDeCaja(abierta.caja), { cajaId: abierta.caja.id, mesaId: null }); });
    tira.appendChild(mas);
    const activa = tira.querySelector('.activa');
    if (activa && estrecho) tira.scrollLeft = Math.max(0, activa.offsetLeft - 12);
  }
  window.addEventListener('resize', () => renderizarOrdenesAbiertas());

  // ===== Nodus: cancelar la orden abierta (papelera junto a la etiqueta de la orden) =====
  function cerrarConfirmaCancelar() {
    const v = document.getElementById('nodus-confirma-cancelar');
    if (v) v.remove();
  }
  function enviadoACocina() {
    if (mesaIdActual) return obtenerCarritoActual().some(i => i.enviado > 0);
    const env = (window.hadeonPOS.comandasEnviadas || {})[servicioActual || '_sin_servicio'] || {};
    return Object.keys(env).some(k => env[k] > 0);
  }
  function pedirCancelarOrden() {
    if (!servicioActual) return;
    cerrarConfirmaCancelar();
    const nombre = mesaIdActual ? servicioActual : servicioActual.replace(/^.* \u00b7 (Orden \d+)$/, '$1');
    const ov = document.createElement('div');
    ov.id = 'nodus-confirma-cancelar';
    ov.className = 'nodus-confirma';
    const t = document.createElement('div');
    t.className = 'nodus-confirma-tarjeta';
    t.setAttribute('role', 'alertdialog');
    t.setAttribute('aria-modal', 'true');
    const h = document.createElement('h3');
    h.textContent = '\u00bfCancelar ' + nombre + '?';
    const p = document.createElement('p');
    p.textContent = (mesaIdActual ? 'Se vac\u00eda la cuenta y la mesa queda libre.' : 'Se quitan todos sus productos.')
      + (enviadoACocina() ? ' Lo que ya sali\u00f3 a cocina se avisar\u00e1 como cancelado.' : '');
    const fila = document.createElement('div');
    fila.className = 'nodus-confirma-botones';
    const volver = document.createElement('button');
    volver.type = 'button'; volver.className = 'nodus-confirma-volver'; volver.textContent = 'Volver';
    const si = document.createElement('button');
    si.type = 'button'; si.className = 'nodus-confirma-si'; si.textContent = 'Cancelar orden';
    volver.addEventListener('click', cerrarConfirmaCancelar);
    ov.addEventListener('click', e => { if (e.target === ov) cerrarConfirmaCancelar(); });
    si.addEventListener('click', () => { si.disabled = true; cancelarOrden().finally(cerrarConfirmaCancelar); });
    fila.appendChild(volver); fila.appendChild(si);
    t.appendChild(h); t.appendChild(p); t.appendChild(fila); ov.appendChild(t);
    document.body.appendChild(ov);
    si.focus();
  }
  async function cancelarOrden() {
    const clave = servicioActual;
    try {
      if (mesaIdActual) {
        await nodusFetch('/cuentas/' + encodeURIComponent(mesaIdActual), { method: 'POST', body: { lineas: [], caja_id: cajaIdActual } });
      } else {
        const env = (window.hadeonPOS.comandasEnviadas || {})[clave] || {};
        const lineas = Object.keys(env).filter(k => env[k] > 0).map(k => ({ producto_id: parseInt(k, 10), cantidad: env[k] }));
        if (lineas.length) await nodusFetch('/comandas/cancelar', { method: 'POST', body: { servicio: clave, caja_id: cajaIdActual, lineas } });
      }
    } catch (err) {
      mostrarToast(err.message || 'No se pudo cancelar la orden.', 'error');
      return;
    }
    delete carritosPorServicio[clave];
    if (window.hadeonPOS.comandasEnviadas) delete window.hadeonPOS.comandasEnviadas[clave];
    guardarCarritos();
    window.hadeonPOS.notaPedido = '';
    window.hadeonPOS.propinaPct = 0;
    window.hadeonPOS.descuentoPct = 0;
    window.hadeonPOS.ventaId = null;
    const eraMesa = !!mesaIdActual;
    servicioActual = null;
    cajaIdActual = null;
    mesaIdActual = null;
    mostrarToast('Orden cancelada.', 'info');
    irAVista(vista1);
    if (eraMesa && typeof cargarMesas === 'function') cargarMesas();
  }
  (function () {
    const tag = document.getElementById('etiqueta-mesa-actual');
    if (!tag || document.getElementById('nodus-cancelar-orden')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'nodus-cancelar-orden';
    b.title = 'Cancelar orden';
    b.setAttribute('aria-label', 'Cancelar orden');
    b.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
    b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); pedirCancelarOrden(); });
    tag.parentNode.insertBefore(b, tag);
  })();
  document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarConfirmaCancelar(); });

  function renderizarMesasYCajas() {
    if (!contenedorMesas) return;

    contenedorMesas.querySelectorAll('.tarjeta-caja-dinamica, .tarjeta-mesa-dinamica').forEach(el => el.remove());

    if (plantillaCaja) {
      let ultimoNodoCaja = plantillaCaja;
      cajasNodus.forEach(caja => {
        const nuevaCaja = plantillaCaja.cloneNode(true);
        nuevaCaja.removeAttribute('id');
        nuevaCaja.classList.add('tarjeta-caja-dinamica');
        nuevaCaja.style.display = 'flex';

        inyectarTexto(nuevaCaja, 'pos-dato-caja-nombre', caja.nombre);
        const subtituloCaja = nuevaCaja.querySelector('.pos-dato-caja-nombre span.pv-h');
        if (subtituloCaja) subtituloCaja.innerText = caja.abierta && caja.sesion ? 'Ventas de hoy: $' + Number(caja.sesion.ventas || 0).toFixed(2) : 'Terminal de cobro';
        nuevaCaja.appendChild(controlesCaja(caja));

        // nodus_api no informa si la sesión de caja está abierta en
        // /api/v1/mesas (solo en /api/v1/caja?caja_id=X, uno por uno) —
        // no se pregunta por adelantado para no multiplicar peticiones;
        // si está cerrada, el propio Procesar Pago lo avisa (CAJA_CERRADA).
        nuevaCaja.addEventListener('click', function (e) {
          e.preventDefault();
          if (!caja.abierta) { abrirModalCaja(caja); return; }
          irAVista(vista2, nuevaOrdenDeCaja(caja), { cajaId: caja.id, mesaId: null });
        });

        ultimoNodoCaja.insertAdjacentElement('afterend', nuevaCaja);
        ultimoNodoCaja = nuevaCaja;
      });
    }

    if (plantillaMesa) {
      mesasNodus.forEach(mesa => {
        const nuevaMesa = plantillaMesa.cloneNode(true);
        nuevaMesa.removeAttribute('id');
        nuevaMesa.classList.add('tarjeta-mesa-dinamica');
        nuevaMesa.style.display = 'flex';

        inyectarTexto(nuevaMesa, 'mesa-dato-nombre', mesa.nombre);
        inyectarTexto(nuevaMesa, 'mesa-dato-estado', mesa.estado);
        const tituloMesa = nuevaMesa.querySelector('h4.pv-h'); if (tituloMesa) tituloMesa.innerText = mesa.nombre;
        const estadoMesa = nuevaMesa.querySelector('span.pv-h'); if (estadoMesa) estadoMesa.innerText = mesa.estado;

        nuevaMesa.addEventListener('click', function (e) {
          e.preventDefault();
          entrarAMesa(mesa);
        });

        contenedorMesas.appendChild(nuevaMesa);
      });
    }

    renderizarOrdenesAbiertas();
    actualizarDegradadoMesas();
  }

  renderizarMesasYCajas();

  function cargarMesas() {
    return nodusFetch('/mesas')
      .then(data => {
        // Solo se redibuja si algo cambió (se consulta cada 8 s para ver lo que hacen otros usuarios)
        const firma = JSON.stringify(data);
        if (firma === window.hadeonPOS.firmaMesas) return;
        window.hadeonPOS.firmaMesas = firma;
        cajasNodus = data.cajas || [];
        mesasNodus = data.mesas || [];
        cajaActualId = data.caja_actual || null;
        window.hadeonPOS.esMesero = data.rol === 'mesero';
        document.body.classList.toggle('nodus-mesero', window.hadeonPOS.esMesero);
        document.body.classList.toggle('nodus-sin-caja', window.hadeonPOS.esMesero && !data.caja_abierta);
        renderizarMesasYCajas();
      })
      .catch(err => console.error('No se pudieron cargar mesas/cajas:', err));
  }
  window.hadeonPOS.cargarMesas = cargarMesas;
  cargarMesas();
  setInterval(() => { if (window.hadeonPOS.esMesero || (vista1 && vista1.style.display !== 'none')) cargarMesas(); }, 8000);
  (function () {
    const vistaMesas = document.getElementById('vista-mesas-pos');
    if (!vistaMesas || document.getElementById('nodus-btn-devolucion')) return;
    const b = document.createElement('button');
    b.id = 'nodus-btn-devolucion'; b.type = 'button'; b.className = 'nodus-btn-devolucion'; b.textContent = 'Devolución de venta';
    b.addEventListener('click', abrirModalDevolucion);
    vistaMesas.appendChild(b);
  })();

  // ==========================================
  // 7. MOTOR DE CARRITO (por servicio)
  // ==========================================
  function agregarAlCarrito(productoId) {
    const producto = productosPOS.find(p => p.id === productoId);
    if (!producto) return;

    const carrito = obtenerCarritoActual();
    const itemExistente = carrito.find(i => i.id === productoId);
    if (itemExistente) {
      itemExistente.cantidad += 1;
    } else {
      carrito.push({ id: producto.id, nombre: producto.nombre, precio: producto.precio, iva: producto.iva, cantidad: 1 });
    }
    renderizarCarrito();
  }

  function cambiarCantidad(productoId, delta) {
    let carrito = obtenerCarritoActual();
    const item = carrito.find(i => i.id === productoId);
    if (!item) return;
    item.cantidad += delta;
    if (item.cantidad <= 0) {
      carritosPorServicio[servicioActual || '_sin_servicio'] = carrito.filter(i => i.id !== productoId);
    }
    renderizarCarrito();
  }

  function calcularTotales() {
    const carrito = obtenerCarritoActual();
    const bruto = carrito.reduce((acc, i) => acc + (i.precio * i.cantidad), 0);
    const descuentoPct = Math.min(Math.max((window.hadeonPOS && window.hadeonPOS.descuentoPct) || 0, 0), 100);
    const factor = 1 - descuentoPct / 100;
    const descuento = bruto * (descuentoPct / 100);
    const subtotal = bruto;
    const impuestos = carrito.reduce((acc, i) => acc + (i.precio * i.cantidad * factor * (typeof i.iva === 'number' ? i.iva : TASA_IMPUESTO)), 0);
    const propinaPct = (window.hadeonPOS && window.hadeonPOS.propinaPct) || 0;
    const propina = (bruto * factor) * (propinaPct / 100);
    const total = bruto * factor + impuestos + propina;
    return { subtotal, impuestos, propina, propinaPct, total, descuento, descuentoPct };
  }

  function renderizarCarrito() {
    if (!contenedorCarrito || !plantillaItemCarrito) return;

    guardarCarritos();
    if (mesaIdActual) programarGuardadoCuenta();

    const carrito = obtenerCarritoActual();
    if (typeof renderizarOrdenesAbiertas === 'function') renderizarOrdenesAbiertas();

    Array.from(contenedorCarrito.children).forEach(child => {
      if (child.id !== 'plantilla-item-carrito') child.remove();
    });

    let estadoVacio = contenedorCarrito.querySelector('.carrito-vacio');
    if (carrito.length === 0) {
      if (!estadoVacio) {
        estadoVacio = document.createElement('div');
        estadoVacio.className = 'carrito-vacio';
        estadoVacio.innerHTML = `
          <div style="text-align:center; padding: 48px 16px; color: #8d909e;">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto 12px;">
              <circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
            </svg>
            <p style="font-family:'Inter',sans-serif; font-size:14px; margin:0;">Aún no has agregado productos</p>
          </div>`;
        contenedorCarrito.appendChild(estadoVacio);
      }
    } else if (estadoVacio) {
      estadoVacio.remove();
    }

    carrito.forEach(item => {
      const nuevoItem = plantillaItemCarrito.cloneNode(true);
      nuevoItem.removeAttribute('id');
      nuevoItem.style.display = 'flex';

      inyectarTexto(nuevoItem, 'cart-nombre', item.nombre);
      inyectarTexto(nuevoItem, 'cart-precio', `$${(item.precio * item.cantidad).toFixed(2)}`);
      inyectarTexto(nuevoItem, 'cart-txt-cantidad', String(item.cantidad));
      const prodItem = productosPOS.find(p => p.id === item.id);
      const imgItem = nuevoItem.querySelector('.cart-img img');
      if (imgItem) { imgItem.removeAttribute('srcset'); imgItem.removeAttribute('loading'); imgItem.src = (prodItem && prodItem.imagen) ? prodItem.imagen : '/nodus_interfaz/static/src/img/nodus_sin_imagen.png'; imgItem.style.objectFit = 'cover'; }

      const btnMenos = nuevoItem.querySelector('.subtraction');
      const btnMas = nuevoItem.querySelector('.cart-btn-mas');
      if (btnMenos) btnMenos.onclick = (e) => { e.preventDefault(); cambiarCantidad(item.id, -1); };
      if (btnMas) btnMas.onclick = (e) => { e.preventDefault(); cambiarCantidad(item.id, +1); };

      contenedorCarrito.appendChild(nuevoItem);
    });

    const { subtotal, impuestos, total, descuento } = calcularTotales();
    const montoDesc = document.getElementById('nodus-descuento-monto');
    if (montoDesc) montoDesc.textContent = descuento > 0 ? '-$' + descuento.toFixed(2) : '';

    setTextoPorClaseGlobal('txt-subtotal-carrito', `$${subtotal.toFixed(2)}`, vista2);
    setTextoPorClaseGlobal('txt-impuestos-carrito', `$${impuestos.toFixed(2)}`, vista2);
    setTextoPorClaseGlobal('txt-total-carrito', `$${total.toFixed(2)}`, vista2);

    setTextoPorClaseGlobal('txt-subtotal-checkout', `$${subtotal.toFixed(2)}`, vista3);
    setTextoPorClaseGlobal('txt-impuestos-checkout', `$${impuestos.toFixed(2)}`, vista3);
    setTextoPorClaseGlobal('txt-total-checkout', `$${total.toFixed(2)}`, vista3);

    actualizarDegradadoCarrito();
  }

  window.hadeonPOS = window.hadeonPOS || {};
  window.hadeonPOS.recalcular = renderizarCarrito;
  window.hadeonPOS.descuentoPct = 0;
  const inputDescuento = document.getElementById('nodus-descuento-pct');
  if (inputDescuento) inputDescuento.addEventListener('input', () => {
    let v = parseFloat(inputDescuento.value); if (isNaN(v) || v < 0) v = 0; if (v > 100) v = 100;
    window.hadeonPOS.descuentoPct = v; renderizarCarrito();
  });

  if (gridProductos) {
    gridProductos.addEventListener('click', function (e) {
      if (gridProductos.classList.contains('grid-bloqueada')) return;

      const btn = e.target.closest('.pos-btn-agregar');
      if (!btn) return;
      e.preventDefault();

      const tarjeta = btn.closest('#contenedor-productos-pos > *');
      const nombreEl = tarjeta ? tarjeta.querySelector('.pos-dato-nombre') : null;
      const nombreTexto = nombreEl ? nombreEl.innerText.trim() : null;
      const producto = productosPOS.find(p => p.nombre === nombreTexto);
      if (!producto) return;

      agregarAlCarrito(producto.id);

      const iconoInterno = btn.querySelector('.pv-icono') || btn;
      const bgOriginal = iconoInterno.style.backgroundColor;
      iconoInterno.style.backgroundColor = '#16a34a';
      iconoInterno.style.color = '#ffffff';
      iconoInterno.style.transform = 'scale(1.1)';
      setTimeout(() => {
        iconoInterno.style.backgroundColor = bgOriginal;
        iconoInterno.style.color = '';
        iconoInterno.style.transform = 'scale(1)';
      }, 200);
    });
  }

  // ==========================================
  // 8. NAVEGACIÓN ENTRE VISTAS
  // ==========================================
  const btnVolverMesas = document.getElementById("btn-volver-mesas");
  if (btnVolverMesas) {
    btnVolverMesas.style.cursor = 'pointer';
    btnVolverMesas.addEventListener("click", function (e) {
      e.preventDefault();
      irAVista(vista1);
    });
  }

  const btnVolverCarrito = document.getElementById("btn-volver-carrito");
  if (btnVolverCarrito) {
    btnVolverCarrito.style.cursor = 'pointer';
    btnVolverCarrito.addEventListener("click", function (e) {
      e.preventDefault();
      irAVista(vista2);
    });
  }

  const btnConfirmar = document.getElementById("btn-confirmar-pedido");
  if (btnConfirmar) {
    btnConfirmar.addEventListener("click", function (e) {
      e.preventDefault();
      // "Generar Orden" también manda la comanda (con la nota, si se
      // agregó) — recién navega a la pantalla de pago si Nodus la
      // aceptó, así nunca se pasa al cobro con un pedido que no llegó.
      enviarComanda(() => irAVista(vista3));
    });
  }

  const btnGenerarComanda = document.getElementById("btn-generar-comanda");
  if (btnGenerarComanda) {
    btnGenerarComanda.addEventListener("click", function (e) {
      e.preventDefault();
      enviarComanda();
    });
  }

  // ==========================================
  // 9. VALIDACIÓN + PROCESAR PAGO
  // ==========================================
  const btnProcesarPago = document.getElementById("btn-procesar-pago");
  if (btnProcesarPago) {
    btnProcesarPago.addEventListener("click", function (e) {
      e.preventDefault();

      const inputNombre = document.getElementById("pos-cliente-nombre");
      const inputRnc = document.getElementById("pos-cliente-rnc");
      const inputTipoDoc = document.getElementById("pos-cliente-tipo-doc");
      const grupoCedula = document.getElementById("pos-cliente-cedula-grupo");

      const nombreVacio = !inputNombre || inputNombre.value.trim() === "";
      const digitosCedula = inputRnc ? inputRnc.value.replace(/\D/g, '') : '';
      const rncInvalido = !inputTipoDoc || digitosCedula.length < 6;

      marcarCampoInvalido(inputNombre, nombreVacio);
      if (grupoCedula) grupoCedula.classList.toggle('campo-invalido', rncInvalido);

      if (nombreVacio || rncInvalido) {
        mostrarToast("Completa el nombre del cliente y una cédula/RIF válida (mínimo 6 dígitos) antes de procesar el pago.", "error");
        return;
      }

      if (!window.hadeonPOS.metodoPagoId) {
        mostrarToast("Selecciona un método de pago antes de continuar.", "info");
        return;
      }

      if (!cajaIdActual) {
        mostrarToast("No se detectó la caja/mesa asignada. Vuelve a seleccionarla antes de pagar.", "error");
        return;
      }

      const carritoAPagar = obtenerCarritoActual();
      const { total, propinaPct } = calcularTotales();
      btnProcesarPago.style.pointerEvents = 'none';
      btnProcesarPago.style.opacity = '0.6';

      nodusFetch('/ordenes', {
        method: 'POST',
        body: {
          caja_id: cajaIdActual,
          mesa_id: mesaIdActual,
          lineas: carritoAPagar.map(item => ({ producto_id: item.id, cantidad: item.cantidad })),
          cliente: {
            nombre: inputNombre.value.trim(),
            tipoDoc: inputTipoDoc.value,
            numero: digitosCedula,
          },
          pagos: (window.hadeonPOS.pagosMixtos && window.hadeonPOS.pagosMixtos.length) ? window.hadeonPOS.pagosMixtos : [{
            metodo_id: window.hadeonPOS.metodoPagoId,
            monto: total,
            referencia: window.hadeonPOS.referenciaPago || '',
          }],
          propina_pct: propinaPct || 0,
          descuento_pct: (window.hadeonPOS && window.hadeonPOS.descuentoPct) || 0,
          nota: window.hadeonPOS.notaPedido || '',
        },
      })
        .then(data => {
          btnProcesarPago.style.pointerEvents = '';
          btnProcesarPago.style.opacity = '';
          mostrarToast(`Orden ${data.factura.numero} registrada.`, "info");
          finalizarYMostrarTicket(data);
        })
        .catch(err => {
          btnProcesarPago.style.pointerEvents = '';
          btnProcesarPago.style.opacity = '';
          console.error('❌ [Hadeon] Error al registrar la orden en NODUS:', err);
          mostrarToast(err.message || "No se pudo registrar la orden .", "error");
        });
    });
  }

  function finalizarYMostrarTicket(data) {
      const inputNombre = document.getElementById("pos-cliente-nombre");
      const inputTipoDoc = document.getElementById("pos-cliente-tipo-doc");
      const inputRnc = document.getElementById("pos-cliente-rnc");
      const ticketNombre = document.getElementById("factura-cliente-nombre");
      const ticketRnc = document.getElementById("factura-cliente-rif");
      if (ticketNombre) ticketNombre.innerText = inputNombre.value.trim();
      if (ticketRnc && inputTipoDoc) ticketRnc.innerText = `${inputTipoDoc.value}-${inputRnc.value.trim()}`;

      const carrito = obtenerCarritoActual();
      const cuerpoTabla = document.getElementById('factura-cuerpo-tabla');
      if (cuerpoTabla) {
        cuerpoTabla.innerHTML = '';
        carrito.forEach(item => {
          const fila = document.createElement('tr');
          fila.innerHTML = `
            <td>${item.cantidad}</td>
            <td>${item.nombre}</td>
            <td class="right">$${(item.precio * item.cantidad).toFixed(2)}</td>
          `;
          cuerpoTabla.appendChild(fila);
        });
      }

      const { subtotal, impuestos, propina, propinaPct, total } = calcularTotales();
      const elSubtotal = document.getElementById('factura-subtotal');
      const elBase = document.getElementById('factura-base');
      const elIva = document.getElementById('factura-iva');
      const elTotal = document.getElementById('factura-total-usd');
      const filaPropina = document.getElementById('factura-propina-fila');
      const elPropina = document.getElementById('factura-propina');
      const etiquetaPropina = document.getElementById('factura-propina-etiqueta');

      if (elSubtotal) elSubtotal.innerText = `$${subtotal.toFixed(2)}`;
      if (elBase) elBase.innerText = `$${subtotal.toFixed(2)}`;
      if (elIva) elIva.innerText = `$${impuestos.toFixed(2)}`;
      if (elTotal) elTotal.innerText = `$${total.toFixed(2)}`;

      if (filaPropina && elPropina) {
        if (propina > 0) {
          filaPropina.classList.remove('fila-oculta');
          elPropina.innerText = `$${propina.toFixed(2)}`;
          if (etiquetaPropina) etiquetaPropina.innerText = `Propina (${propinaPct}%)`;
        } else {
          filaPropina.classList.add('fila-oculta');
        }
      }

      // Datos reales de la orden: empresa, número de factura, tasa y total en bolívares
      if (data) {
        const poner = (id, texto) => { const el = document.getElementById(id); if (el && texto !== undefined && texto !== null) el.innerText = texto; };
        const emp = data.empresa || {};
        poner('factura-empresa-nombre', emp.nombre);
        poner('factura-empresa-rif', emp.rif ? 'RIF: ' + emp.rif : '');
        poner('factura-empresa-dir', emp.direccion || '');
        poner('factura-nro', data.factura && data.factura.numero);
        poner('factura-control', (data.factura && data.factura.control) || '—');
        poner('factura-fecha', data.factura && data.factura.fecha ? new Date(data.factura.fecha.replace(' ', 'T') + 'Z').toLocaleString('es-VE') : '');
        const tot = data.totales || {};
        poner('factura-subtotal', '$' + Number(tot.subtotal || 0).toFixed(2));
        poner('factura-base', '$' + Number(tot.baseImponible || 0).toFixed(2));
        poner('factura-iva', '$' + Number(tot.iva || 0).toFixed(2));
        poner('factura-total-usd', '$' + Number(tot.total || 0).toFixed(2));
        poner('factura-tasa-bcv', Number(data.tasa || 0).toFixed(2));
        poner('factura-total-bs', Number(tot.total_bs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        const etiquetaIva = document.querySelector('#ticket-imprimible .ticket-totals-row:nth-child(3) span');
        if (etiquetaIva) etiquetaIva.innerText = 'IVA';
        if (emp.logo_url) {
          const envoltorio = document.getElementById('ticket-logo-wrapper');
          if (envoltorio) { envoltorio.innerHTML = ''; const im = document.createElement('img'); im.src = emp.logo_url; im.alt = 'Logo'; im.style.cssText = 'max-width:100%;max-height:80px;object-fit:contain;'; envoltorio.appendChild(im); }
        } else {
          const envoltorio = document.getElementById('ticket-logo-wrapper'); if (envoltorio) envoltorio.style.display = 'none';
        }
      }

      irAVista(vista4);
  }

  const inputNombreListener = document.getElementById("pos-cliente-nombre");
  const inputRncListener = document.getElementById("pos-cliente-rnc");
  const grupoCedulaListener = document.getElementById("pos-cliente-cedula-grupo");
  if (inputNombreListener) inputNombreListener.addEventListener('input', () => marcarCampoInvalido(inputNombreListener, false));
  if (inputRncListener && grupoCedulaListener) inputRncListener.addEventListener('input', () => grupoCedulaListener.classList.remove('campo-invalido'));

  // ==========================================
  // 10. VISTA 4: ACCIONES DEL TICKET
  // ==========================================
  const btnImprimir = document.getElementById("btn-imprimir-factura");
  if (btnImprimir) {
    btnImprimir.addEventListener("click", function (e) {
      e.preventDefault();
      prepararEImprimirTicket();
    });
  }

  // El ticket se imprime desde un marco oculto con una copia suya y sus estilos: así sale solo el ticket
  // (80 mm), sin depender de la pantalla de Odoo que lo rodea. El mismo documento se puede guardar como PDF.
  function documentoDelTicket(ticket) {
    let css = '@page { size: 80mm auto; margin: 0; } html, body { margin: 0; background: #fff; }';
    const recoger = (reglas) => {
      for (const r of reglas) {
        if (r.type === CSSRule.FONT_FACE_RULE) css += r.cssText;
        else if (r.type === CSSRule.STYLE_RULE && /ticket|nd-pos\b(?!\s*[.#\w-])/.test(r.selectorText || '') && !/lienzo/.test(r.selectorText)) css += r.cssText;
        else if (r.type === CSSRule.MEDIA_RULE && !/print/.test(r.conditionText || r.media.mediaText)) recoger(r.cssRules);
      }
    };
    for (const hoja of document.styleSheets) {
      try { recoger(hoja.cssRules); } catch (e) { /* hoja de otro origen */ }
    }
    css += ' #ticket-imprimible { width: 80mm !important; max-width: 80mm !important; margin: 0 !important; padding: 4mm !important;'
      + ' box-shadow: none !important; border: 0 !important; border-radius: 0 !important; box-sizing: border-box; }'
      + ' .fila-oculta { display: none !important; }';
    return '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Factura</title><style>' + css + '</style></head>'
      + '<body><div class="nd-pos">' + ticket.outerHTML + '</div></body></html>';
  }

  function prepararEImprimirTicket() {
    const ticket = document.getElementById('ticket-imprimible');
    if (!ticket) return;
    const anterior = realDocImprimir.getElementById('nd-ticket-marco');
    if (anterior) anterior.remove();
    const marco = realDocImprimir.createElement('iframe');
    marco.id = 'nd-ticket-marco';
    marco.setAttribute('aria-hidden', 'true');
    marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    marco.srcdoc = documentoDelTicket(ticket);
    marco.addEventListener('load', () => {
      const w = marco.contentWindow;
      const fuentes = w.document.fonts ? w.document.fonts.ready : Promise.resolve();
      fuentes.then(() => setTimeout(() => {
        w.focus();
        w.print();
        setTimeout(() => marco.remove(), 60000);
      }, 200));
    }, { once: true });
    realDocImprimir.body.appendChild(marco);
  }
  const realDocImprimir = globalThis.document;

  const btnNuevaVenta = document.getElementById("btn-nueva-venta");
  if (btnNuevaVenta) {
    btnNuevaVenta.addEventListener("click", function (e) {
      e.preventDefault();
      const inputNombre = document.getElementById("pos-cliente-nombre");
      const inputRnc = document.getElementById("pos-cliente-rnc");
      if (inputNombre) inputNombre.value = "";
      if (inputRnc) inputRnc.value = "";

      if (servicioActual) {
        delete carritosPorServicio[servicioActual];
        guardarCarritos();
      }

      window.hadeonPOS.metodoPago = null;
      window.hadeonPOS.metodoPagoId = null;
      window.hadeonPOS.propinaPct = 0;
      window.hadeonPOS.notaPedido = '';
      window.hadeonPOS.descuentoPct = 0;
      if (window.nodusReiniciarPagos) window.nodusReiniciarPagos();
      if (window.hadeonPOS.comandasEnviadas && servicioActual) delete window.hadeonPOS.comandasEnviadas[servicioActual];
      window.hadeonPOS.ventaId = null;
      const campoDesc = document.getElementById('nodus-descuento-pct'); if (campoDesc) campoDesc.value = 0;
      const campoProp = document.getElementById('nodus-propina-pct'); if (campoProp) campoProp.value = 0;
      document.querySelectorAll('.metodo-pago-item.seleccionado').forEach(el => el.classList.remove('seleccionado'));
      document.querySelectorAll('.propina-seleccionada').forEach(el => el.classList.remove('propina-seleccionada'));

      servicioActual = null;
      cajaIdActual = null;
      mesaIdActual = null;
      irAVista(vista1);
    });
  }

  renderizarCarrito();

});






document.addEventListener("DOMContentLoaded", function () {
  const boton = document.getElementById('btn-nota-pedido');
  const overlay = document.getElementById('modal-nota-overlay');
  const tarjeta = document.getElementById('modal-nota-tarjeta');
  const btnCerrar = document.getElementById('modal-nota-cerrar');
  const btnCancelar = document.getElementById('modal-nota-cancelar');
  const btnGuardar = document.getElementById('modal-nota-guardar');
  const textarea = document.getElementById('modal-nota-textarea');
  const presets = document.querySelectorAll('.nota-preset-btn');

  if (!boton || !overlay || !tarjeta) return;

  document.body.appendChild(overlay);

  let enAnimacion = false;

  function abrirModal() {
    if (enAnimacion) return;
    enAnimacion = true;

    overlay.classList.add('abierto');
    document.body.style.overflow = 'hidden';
    overlay.style.transition = 'none';
    overlay.style.opacity = '0';

    const rectBoton = boton.getBoundingClientRect();
    const rectTarjeta = tarjeta.getBoundingClientRect();

    const escalaX = rectBoton.width / rectTarjeta.width;
    const escalaY = rectBoton.height / rectTarjeta.height;
    const trasladoX = (rectBoton.left + rectBoton.width / 2) - (rectTarjeta.left + rectTarjeta.width / 2);
    const trasladoY = (rectBoton.top + rectBoton.height / 2) - (rectTarjeta.top + rectTarjeta.height / 2);

    tarjeta.style.transition = 'none';
    tarjeta.style.transform = `translate(${trasladoX}px, ${trasladoY}px) scale(${escalaX}, ${escalaY})`;
    tarjeta.style.opacity = '0';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.style.transition = 'opacity 0.3s ease';
        overlay.style.opacity = '1';

        tarjeta.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease';
        tarjeta.style.transform = 'translate(0, 0) scale(1, 1)';
        tarjeta.style.opacity = '1';

        setTimeout(() => { enAnimacion = false; }, 400);
      });
    });
  }

  function cerrarModal() {
    if (enAnimacion) return;
    enAnimacion = true;

    const rectBoton = boton.getBoundingClientRect();
    const rectTarjeta = tarjeta.getBoundingClientRect();

    const escalaX = rectBoton.width / rectTarjeta.width;
    const escalaY = rectBoton.height / rectTarjeta.height;
    const trasladoX = (rectBoton.left + rectBoton.width / 2) - (rectTarjeta.left + rectTarjeta.width / 2);
    const trasladoY = (rectBoton.top + rectBoton.height / 2) - (rectTarjeta.top + rectTarjeta.height / 2);

    overlay.style.transition = 'opacity 0.3s ease';
    overlay.style.opacity = '0';

    tarjeta.style.transition = 'transform 0.35s cubic-bezier(0.4, 0, 1, 1), opacity 0.25s ease';
    tarjeta.style.transform = `translate(${trasladoX}px, ${trasladoY}px) scale(${escalaX}, ${escalaY})`;
    tarjeta.style.opacity = '0';

    setTimeout(() => {
      overlay.classList.remove('abierto');
      document.body.style.overflow = '';
      enAnimacion = false;
    }, 350);
  }

  boton.addEventListener('click', function (e) {
    e.preventDefault();
    abrirModal();
  });

  btnCerrar.addEventListener('click', cerrarModal);
  btnCancelar.addEventListener('click', cerrarModal);

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) cerrarModal();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.classList.contains('abierto')) cerrarModal();
  });

  presets.forEach(btn => {
    btn.addEventListener('click', function () {
      const texto = btn.getAttribute('data-nota');
      btn.classList.toggle('activo');

      if (btn.classList.contains('activo')) {
        const actual = textarea.value.trim();
        textarea.value = actual ? `${actual}, ${texto}` : texto;
      } else {
        textarea.value = textarea.value
          .split(',')
          .map(t => t.trim())
          .filter(t => t !== texto)
          .join(', ');
      }
    });
  });

  btnGuardar.addEventListener('click', function () {
    window.hadeonPOS = window.hadeonPOS || {};
    window.hadeonPOS.notaPedido = textarea.value.trim();
    cerrarModal();
  });
});






document.addEventListener("DOMContentLoaded", function () {
  // =========================================================
  // SCROLL DE LA LISTA DEL CARRITO — sin estirar el panel
  // =========================================================
  // Misma técnica que ya usamos para el grid del catálogo (medir
  // con JS en vez de depender del CSS del diseño anterior, que ya sabemos
  // que puede perder peleas de especificidad). La diferencia: aquí
  // hay contenido DESPUÉS de la lista dentro del mismo panel
  // (subtotal/impuestos/total, botones de Comanda/Nota de Pedido,
  // botón Generar Orden) — así que restamos también su altura real,
  // para que la lista nunca los empuje fuera de la pantalla.
  // =========================================================
  function ajustarAlturaCarritoPOS() {
    const lista = document.getElementById('contenedor-carrito-pos');
    if (!lista) return;

    // 👉 Solo PC/tablet — en móvil no tocamos nada, ahí manda el
    // comportamiento nativo (igual que en el grid y el checkout)
    if (window.innerWidth <= 767) {
      lista.style.removeProperty('max-height');
      lista.style.removeProperty('overflow-y');
      lista.style.removeProperty('overflow-x');
      return;
    }

    const rectLista = lista.getBoundingClientRect();
    const margenInferior = 16;

    // Suma la altura real de todo lo que viene DESPUÉS de la lista
    // dentro del mismo panel (así no depende de saber sus IDs exactos,
    // y sigue funcionando aunque se agregue o quite algo ahí abajo).
    let alturaHermanosDespues = 0;
    let hermano = lista.nextElementSibling;
    while (hermano) {
      alturaHermanosDespues += hermano.getBoundingClientRect().height;
      hermano = hermano.nextElementSibling;
    }

    const alturaDisponible = window.innerHeight - rectLista.top - alturaHermanosDespues - margenInferior;

    // Nunca la dejamos colapsar a algo absurdamente chico
    lista.style.setProperty('max-height', Math.max(alturaDisponible, 120) + 'px', 'important');
    lista.style.setProperty('overflow-y', 'auto', 'important');
    lista.style.setProperty('overflow-x', 'hidden', 'important');

    if (window.hadeonPOS && window.hadeonPOS.actualizarDegradadoCarrito) {
      window.hadeonPOS.actualizarDegradadoCarrito();
    }
  }

  ajustarAlturaCarritoPOS();
  window.addEventListener('resize', ajustarAlturaCarritoPOS);
  setTimeout(ajustarAlturaCarritoPOS, 300);

  // 👉 Recalcular también cada vez que el carrito cambia (se agrega/
  // quita un producto), porque eso puede mover a los hermanos de abajo
  const listaObservada = document.getElementById('contenedor-carrito-pos');
  if (listaObservada) {
    const observador = new MutationObserver(() => setTimeout(ajustarAlturaCarritoPOS, 50));
    observador.observe(listaObservada, { childList: true });
  }
});






// Envuelve un <select> nativo con un botón + panel flotante propio.
// El <select> real sigue siendo la fuente de verdad: se oculta pero
// conserva su value y sus eventos 'change', así que todo el código
// que ya lee/escribe sobre él sigue funcionando sin cambios.
let hadeonDropdownCerrarActual = null;

function hadeonCrearDropdown(select, opciones) {
  if (!select || select.closest('.hadeon-dropdown')) return;
  opciones = opciones || {};

  const wrapper = document.createElement('div');
  wrapper.className = 'hadeon-dropdown';
  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);
  select.classList.add('hadeon-select-oculto');

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'hadeon-dropdown-boton' + (opciones.claseExtra ? ' ' + opciones.claseExtra : '');
  const textoBoton = document.createElement('span');
  boton.appendChild(textoBoton);
  boton.insertAdjacentHTML('beforeend', '<svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8l4 4 4-4"></path></svg>');
  wrapper.appendChild(boton);

  const panel = document.createElement('div');
  panel.className = 'hadeon-dropdown-panel';
  wrapper.appendChild(panel);

  function actualizarBoton() {
    const opt = select.options[select.selectedIndex];
    textoBoton.textContent = opt ? opt.textContent : '';
  }

  function posicionarPanel() {
    const rect = boton.getBoundingClientRect();
    panel.style.top = (rect.bottom + 8) + 'px';
    panel.style.left = rect.left + 'px';
    panel.style.minWidth = rect.width + 'px';
  }

  function cerrarPanel() {
    panel.classList.remove('abierto');
    boton.classList.remove('abierto');
    wrapper.appendChild(panel);
    panel.style.position = '';
    panel.style.top = '';
    panel.style.left = '';
    panel.style.minWidth = '';
    window.removeEventListener('scroll', posicionarPanel, true);
    window.removeEventListener('resize', posicionarPanel);
    if (hadeonDropdownCerrarActual === cerrarPanel) {
      hadeonDropdownCerrarActual = null;
    }
  }

  function abrirPanel() {
    if (hadeonDropdownCerrarActual && hadeonDropdownCerrarActual !== cerrarPanel) {
      hadeonDropdownCerrarActual();
    }

    panel.innerHTML = '';
    Array.from(select.options).forEach(opt => {
      const fila = document.createElement('div');
      fila.className = 'hadeon-dropdown-opcion' + (opt.value === select.value ? ' seleccionada' : '');
      fila.textContent = opt.textContent;
      fila.addEventListener('click', () => {
        select.value = opt.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        cerrarPanel();
      });
      panel.appendChild(fila);
    });

    document.body.appendChild(panel);
    panel.style.position = 'fixed';
    posicionarPanel();
    window.addEventListener('scroll', posicionarPanel, true);
    window.addEventListener('resize', posicionarPanel);

    panel.classList.add('abierto');
    boton.classList.add('abierto');
    hadeonDropdownCerrarActual = cerrarPanel;
  }

  boton.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel.classList.contains('abierto')) cerrarPanel(); else abrirPanel();
  });
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target) && !panel.contains(e.target)) cerrarPanel();
  });
  select.addEventListener('change', actualizarBoton);

  actualizarBoton();
}

document.addEventListener("DOMContentLoaded", function () {
  hadeonCrearDropdown(document.getElementById('pos-cliente-tipo-doc'), { claseExtra: 'hadeon-dropdown-boton-doc' });

  // ==========================================
  // ESTADO GLOBAL COMPARTIDO DEL POS (sin backend)
  // ==========================================
  window.hadeonPOS = window.hadeonPOS || {};
  window.hadeonPOS.metodoPago = null;
  window.hadeonPOS.metodoPagoId = null;
  window.hadeonPOS.propinaPct = 0;
  window.hadeonPOS.referenciaPago = "";

  // ==========================================
  // BÚSQUEDA DE CONTACTOS EN ODOO — por número de documento
  // (res.partner.vat), en tiempo real mientras se escribe.
  // ==========================================
  // Devuelve el cliente si existe, null si NO_ENCONTRADO (caso normal,
  // no es un error), o relanza cualquier otro error (permiso/servidor)
  // para que el que llama lo distinga de "no existe todavía".
  async function buscarClientePorDocumento(tipoDoc, numero) {
    try {
      return await nodusFetch('/clientes?tipo=' + encodeURIComponent(tipoDoc) + '&numero=' + encodeURIComponent(numero));
    } catch (err) {
      if (err.code === 'NO_ENCONTRADO') return null;
      throw err;
    }
  }

  // ==========================================
  // AUTO-FORMATO DE CÉDULA: solo dígitos, con puntos
  // de miles automáticos (ej. 31802320 → 31.802.320)
  // ==========================================
  const inputCedula = document.getElementById('pos-cliente-rnc');
  const selectTipoDoc = document.getElementById('pos-cliente-tipo-doc');
  const inputNombre = document.getElementById('pos-cliente-nombre');
  const inputTelefono = document.getElementById('pos-cliente-telefono');

  if (inputCedula) {
    // 👉 AUTOCOMPLETADO en tiempo real — se dispara mientras se
    // escribe (con debounce, para no mandar una búsqueda a Nodus por
    // cada tecla) a partir de 6 dígitos, y también al salir del campo
    // o cambiar el tipo de documento, como respaldo inmediato.
    let busquedaClientePendiente = null;
    let ultimaBusquedaId = 0;

    async function intentarAutocompletar() {
      const numero = inputCedula.value.trim();
      if (!numero) return;
      const tipoDoc = selectTipoDoc ? selectTipoDoc.value : 'V';

      const idDeEstaBusqueda = ++ultimaBusquedaId;
      let cliente;
      try {
        cliente = await buscarClientePorDocumento(tipoDoc, numero);
      } catch (err) {
        // NO_ENCONTRADO no es un error (cliente nuevo, normal) — lo
        // demás (permiso, servidor) sí hay que avisarlo, no quedarse
        // callado como si el documento simplemente no existiera.
        if (idDeEstaBusqueda === ultimaBusquedaId) {
          mostrarToast(err.message || "No se pudo buscar el cliente .", "error");
        }
        return;
      }
      // Si mientras esperaba la respuesta el usuario ya arrancó OTRA
      // búsqueda más nueva, esta se descarta — evita que una respuesta
      // vieja (más lenta) pise el resultado de la más reciente.
      if (idDeEstaBusqueda !== ultimaBusquedaId || !cliente) return;

      if (inputNombre && cliente.nombre) {
        inputNombre.value = cliente.nombre;
        inputNombre.classList.add('campo-autocompletado');
        setTimeout(() => inputNombre.classList.remove('campo-autocompletado'), 1500);
      }
      if (inputTelefono && cliente.telefono) {
        inputTelefono.value = cliente.telefono;
        inputTelefono.classList.add('campo-autocompletado');
        setTimeout(() => inputTelefono.classList.remove('campo-autocompletado'), 1500);
      }
    }

    function programarAutocompletar() {
      if (busquedaClientePendiente) clearTimeout(busquedaClientePendiente);
      busquedaClientePendiente = setTimeout(intentarAutocompletar, 450);
    }

    inputCedula.addEventListener('input', () => {
      const soloDigitos = inputCedula.value.replace(/\D/g, '').slice(0, 9);
      inputCedula.value = soloDigitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      if (soloDigitos.length >= 6) programarAutocompletar();
    });

    inputCedula.addEventListener('blur', intentarAutocompletar);
    if (selectTipoDoc) selectTipoDoc.addEventListener('change', intentarAutocompletar);
  }

  const contenedorPagos = document.getElementById('vista-checkout-pos');
  if (!contenedorPagos) return;

  // ==========================================
  // MÉTODO DE PAGO — por CSS ID directo
  // ==========================================
  const idsMetodosPago = {
    'targeta':  'Tarjeta',
    'efectivo': 'Efectivo',
    'pagomovil': 'Pago móvil',
    'bio-pago': 'Bio-Pago'
  };

  const contenedoresPago = Object.keys(idsMetodosPago)
    .map(id => document.getElementById(id))
    .filter(Boolean);

  if (contenedoresPago.length === 0) {
    console.error("❌ [Hadeon] No se encontró ningún contenedor de método de pago por ID (targeta, efectivo, pagomovil, bio-pago).");
  }

  // Los 4 botones de arriba son diseño fijo, no vienen de Nodus — para
  // mandar un pagos[].metodo_id real a /api/v1/ordenes hay que resolver
  // cada uno contra la lista real de /api/v1/metodos-pago por palabras
  // clave en el nombre (mismo criterio que antes hacía el backend
  // propio). Se pide sin caja_id (usa la caja por defecto de nodus) —
  // esta pantalla vive en un <script> aparte del que guarda cajaIdActual.
  const metodosPagoNodus = [];
  const PISTAS_METODO_PAGO = {
    'Efectivo': ['efectivo', 'cash', 'contado'],
    'Tarjeta': ['tarjeta', 'card', 'bank', 'banco', 'débito', 'debito', 'crédito', 'credito', 'punto de venta'],
    'Pago móvil': ['móvil', 'movil', 'pago móvil'],
    'Bio-Pago': ['bio', 'bio-pago', 'biometric'],
  };

  nodusFetch('/metodos-pago')
    .then(data => { metodosPagoNodus.push(...data); })
    .catch(err => console.error('❌ [Hadeon] No se pudieron cargar los métodos de pago de NODUS:', err));

  function resolverMetodoPagoId(nombreMetodo) {
    if (nombreMetodo === 'Efectivo') {
      const moneda = { bolivares: 'VES', euros: 'EUR', dolares: 'USD' }[window.hadeonPOS.tipoEfectivo || 'dolares'];
      const efectivos = metodosPagoNodus.filter(m => m.efectivo);
      const exacto = efectivos.find(m => m.moneda === moneda) || efectivos[0];
      if (exacto) return exacto.id;
    }
    const palabrasClave = PISTAS_METODO_PAGO[nombreMetodo] || [];
    const encontrado = metodosPagoNodus.find(m => {
      const nombreLower = (m.nombre || '').toLowerCase();
      return palabrasClave.some(p => nombreLower.includes(p));
    });
    if (encontrado) return encontrado.id;
    const noEfectivo = metodosPagoNodus.find(m => !m.efectivo);
    return noEfectivo ? noEfectivo.id : (metodosPagoNodus.length ? metodosPagoNodus[0].id : null);
  }
  window.hadeonPOS.resolverMetodo = resolverMetodoPagoId;

  // ==========================================
  // CAMPO DE REFERENCIA (solo Pago móvil)
  // ==========================================
  let campoReferenciaWrapper = null;
  let inputReferencia = null;

  function crearCampoReferencia() {
    if (campoReferenciaWrapper) return;

    const elPagoMovil = document.getElementById('pagomovil');
    const gridPadre = elPagoMovil ? elPagoMovil.parentElement : null;
    if (!gridPadre) {
      console.error("❌ [Hadeon] No se encontró el contenedor padre de 'pagomovil' para insertar el campo de referencia.");
      return;
    }

    campoReferenciaWrapper = document.createElement('div');
    campoReferenciaWrapper.className = 'pos-referencia-wrapper';
    campoReferenciaWrapper.innerHTML = `
      <label class="pos-fact-label">Referencia (opcional)</label>
      <input id="pos-referencia-pago" class="pos-fact-input" type="text"
             inputmode="numeric" maxlength="4" placeholder="Últimos 4 dígitos">
    `;

    gridPadre.insertAdjacentElement('afterend', campoReferenciaWrapper);

    inputReferencia = campoReferenciaWrapper.querySelector('#pos-referencia-pago');
    inputReferencia.addEventListener('input', () => {
      inputReferencia.value = inputReferencia.value.replace(/\D/g, '').slice(0, 4);
      window.hadeonPOS.referenciaPago = inputReferencia.value;
    });
  }

  function mostrarCampoReferencia(mostrar) {
    if (!campoReferenciaWrapper) crearCampoReferencia();
    if (!campoReferenciaWrapper) return;

    if (mostrar) {
      campoReferenciaWrapper.classList.add('visible');
    } else {
      campoReferenciaWrapper.classList.remove('visible');
      if (inputReferencia) {
        inputReferencia.value = '';
        window.hadeonPOS.referenciaPago = '';
      }
    }
  }

  // ==========================================
  // SELECTOR DE TIPO DE EFECTIVO (solo Efectivo)
  // ==========================================
  let campoTipoEfectivoWrapper = null;
  let pillsTipoEfectivo = null;

  function crearCampoTipoEfectivo() {
    if (campoTipoEfectivoWrapper) return;

    const elEfectivo = document.getElementById('efectivo');
    const gridPadre = elEfectivo ? elEfectivo.parentElement : null;
    if (!gridPadre) {
      console.error("❌ [Hadeon] No se encontró el contenedor padre de 'efectivo' para insertar el selector de tipo de efectivo.");
      return;
    }

    campoTipoEfectivoWrapper = document.createElement('div');
    campoTipoEfectivoWrapper.className = 'pos-tipo-efectivo-wrapper';
    campoTipoEfectivoWrapper.innerHTML = `
      <label class="pos-fact-label">Tipo de efectivo</label>
      <div class="pos-tipo-efectivo-pills">
        <button type="button" class="pos-tipo-efectivo-pill" data-tipo="bolivares"><span>Bs.</span> Bolívares</button>
        <button type="button" class="pos-tipo-efectivo-pill" data-tipo="euros"><span>€</span> Euros</button>
        <button type="button" class="pos-tipo-efectivo-pill seleccionado" data-tipo="dolares"><span>$</span> Dólares</button>
      </div>
    `;

    gridPadre.insertAdjacentElement('afterend', campoTipoEfectivoWrapper);

    pillsTipoEfectivo = Array.from(campoTipoEfectivoWrapper.querySelectorAll('.pos-tipo-efectivo-pill'));
    window.hadeonPOS.tipoEfectivo = 'dolares';
    pillsTipoEfectivo.forEach(pill => {
      pill.addEventListener('click', () => {
        pillsTipoEfectivo.forEach(p => p.classList.remove('seleccionado'));
        pill.classList.add('seleccionado');
        window.hadeonPOS.tipoEfectivo = pill.getAttribute('data-tipo');
        window.hadeonPOS.metodoPagoId = resolverMetodoPagoId('Efectivo');
      });
    });
  }

  function mostrarCampoTipoEfectivo(mostrar) {
    if (!campoTipoEfectivoWrapper) crearCampoTipoEfectivo();
    if (!campoTipoEfectivoWrapper) return;

    if (mostrar) {
      campoTipoEfectivoWrapper.classList.add('visible');
    } else {
      campoTipoEfectivoWrapper.classList.remove('visible');
    }
  }

  // --- Clic en cada método de pago ---
  contenedoresPago.forEach(item => {
    item.classList.add('metodo-pago-item');
    item.addEventListener('click', () => {
      contenedoresPago.forEach(m => m.classList.remove('seleccionado'));
      item.classList.add('seleccionado');

      const nombreMetodo = idsMetodosPago[item.id];
      window.hadeonPOS.metodoPago = nombreMetodo;
      window.hadeonPOS.metodoPagoId = resolverMetodoPagoId(nombreMetodo);

      mostrarCampoReferencia(item.id === 'pagomovil');
      mostrarCampoTipoEfectivo(item.id === 'efectivo');
    });
  });

  // ==========================================
  // PROPINA — deseleccionable
  // ==========================================
  // Los 3 porcentajes rápidos (sin contar "Otro") se configuran desde
  // Configuración > Punto de Venta > Porcentajes de propina sugeridos
  // (misma clave de localStorage, mismo origen) -- acá solo se leen y
  // se pintan sobre los 3 primeros botones fijos; si configuraron
  // menos de 3, los sobrantes se ocultan en vez de mostrar texto viejo.
  (async function aplicarPorcentajesPropinaConfigurados() {
    const idsBotonesPct = ['pv-1d06ebb', 'pv-75e6f41', 'pv-eb6660d'];
    let porcentajes = [5, 10, 15];
    let usaPropina = true;
    try {
      const cfg = await nodusFetch('/config');
      const negocio = cfg.negocio || {};
      if (Array.isArray(negocio.propinas) && negocio.propinas.length) porcentajes = negocio.propinas.slice().sort((a, b) => a - b);
      usaPropina = negocio.usa_propina !== false;
    } catch (e) { console.warn('No se pudo leer la configuración de propinas:', e); }
    if (!usaPropina) {
      document.querySelectorAll('#vista-checkout-pos .pv-w-boton').forEach(w => {
        const txt = (w.querySelector('.pv-boton-texto') || {}).innerText || '';
        if (/^\s*\d+(\.\d+)?%\s*$/.test(txt) || txt.trim() === 'Otro') w.style.display = 'none';
      });
    }

    idsBotonesPct.forEach((id, i) => {
      const widget = document.querySelector('.' + id);
      if (!widget) return;
      if (i < porcentajes.length) {
        widget.style.display = '';
        const texto = widget.querySelector('.pv-boton-texto');
        if (texto) texto.textContent = porcentajes[i] + '%';
      } else {
        widget.style.display = 'none';
      }
    });
  })();

  const botonesPropina = document.querySelectorAll('#vista-checkout-pos .pv-w-boton');
  const grupoPropinas = Array.from(botonesPropina).filter(btn => {
    const texto = btn.querySelector('.pv-boton-texto')?.innerText.trim();
    return /^\d+(\.\d+)?%$/.test(texto) || texto === 'Otro';
  });
  grupoPropinas.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const texto = btn.querySelector('.pv-boton-texto')?.innerText.trim();
      const yaEstabaSeleccionado = btn.classList.contains('propina-seleccionada');

      if (yaEstabaSeleccionado) {
        btn.classList.remove('propina-seleccionada');
        window.hadeonPOS.propinaPct = 0;
      } else {
        if (texto === 'Otro') {
          const valor = prompt('Ingresa el porcentaje de propina (ej. 20):', '20');
          const pct = parseFloat(valor);
          if (isNaN(pct) || pct < 0) return;
          window.hadeonPOS.propinaPct = pct;
        } else {
          window.hadeonPOS.propinaPct = parseFloat(texto);
        }

        grupoPropinas.forEach(b => b.classList.remove('propina-seleccionada'));
        btn.classList.add('propina-seleccionada');
      }

      if (typeof window.hadeonPOS.recalcular === 'function') {
        window.hadeonPOS.recalcular();
      }
    });
  });

});






document.addEventListener("DOMContentLoaded", function () {
  // =========================================================
  // EVITAR EL ZOOM AUTOMÁTICO DE iOS AL ENFOCAR CAMPOS
  // iOS Safari hace zoom automático en cualquier input, textarea
  // o select con font-size menor a 16px. Casi todos nuestros
  // campos tienen su propia clase con font-size + !important
  // (ej. .pos-search-input), que le gana en especificidad a un
  // simple "input { font-size:16px !important }" — por eso se
  // aplica por JS en línea, que sí gana contra cualquier clase.
  // =========================================================
  function aplicarFixZoomIOS() {
    if (window.innerWidth > 1024) return; // solo teléfono y tablet
    document.querySelectorAll('input, textarea, select').forEach(function (campo) {
      campo.style.setProperty('font-size', '16px', 'important');
    });
  }
  aplicarFixZoomIOS();
  window.addEventListener('resize', aplicarFixZoomIOS);
});



    arrancar();
    return detener;
}
