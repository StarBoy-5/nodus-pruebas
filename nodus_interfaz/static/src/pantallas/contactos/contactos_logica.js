/** @odoo-module **/
// Lógica de la pantalla Contactos (código de Nodus). Se monta al abrir la pantalla y se limpia al salir:
// los escuchas de window/document y los temporizadores quedan registrados para quitarlos.

export function montar(raiz) {
    const limpiar = [];
    const realDoc = globalThis.document;
    const realWin = globalThis.window;
    const pendientes = [];
    const registrar = (obj, tipo, fn, opc) => {
        if (tipo === "DOMContentLoaded" || tipo === "load") {
            pendientes.push(fn);
            return;
        }
        obj.addEventListener(tipo, fn, opc);
        limpiar.push(() => obj.removeEventListener(tipo, fn, opc));
    };
    const envolver = (real) => new Proxy(real, {
        get(obj, prop) {
            if (prop === "addEventListener") return (t, f, o) => registrar(obj, t, f, o);
            if (prop === "setInterval") return setInterval;
            if (prop === "setTimeout") return setTimeout;
            const v = Reflect.get(obj, prop);
            return typeof v === "function" && !/^[A-Z]/.test(String(prop)) ? v.bind(obj) : v;
        },
        set(obj, prop, valor) {
            obj[prop] = valor;
            return true;
        },
    });
    const setInterval = (fn, ms, ...a) => {
        const id = realWin.setInterval(fn, ms, ...a);
        limpiar.push(() => realWin.clearInterval(id));
        return id;
    };
    const setTimeout = (fn, ms, ...a) => {
        const id = realWin.setTimeout(fn, ms, ...a);
        limpiar.push(() => realWin.clearTimeout(id));
        return id;
    };
    const document = envolver(realDoc);
    const window = envolver(realWin);



// Arrastrar con mouse para deslizar horizontal — el navegador deja
// deslizar un overflow:auto con el dedo (touch) o agarrando la barra de
// scroll, pero NO dejando el mouse apretado sobre el contenido y
// arrastrando, que es el gesto que la mayoría espera probar primero en
// escritorio (incluido el modo "Responsive" de DevTools sin emulación
// de touch activada). Esto agrega ese gesto a mano. Si hubo arrastre de
// verdad (más de unos pocos px), se bloquea el click que sigue al
// soltar — si no, soltar el mouse después de arrastrar abriría de
// paso el modal de detalle de la fila.
function habilitarArrastreScroll(el) {
  if (!el || el.dataset.arrastreListo) return;
  el.dataset.arrastreListo = '1';
  let arrastrando = false, huboArrastre = false, inicioX = 0, scrollInicial = 0;

  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    arrastrando = true;
    huboArrastre = false;
    inicioX = e.pageX;
    scrollInicial = el.scrollLeft;
  });

  window.addEventListener('mousemove', (e) => {
    if (!arrastrando) return;
    const delta = e.pageX - inicioX;
    if (Math.abs(delta) > 4) {
      huboArrastre = true;
      el.classList.add('arrastrando-scroll');
    }
    el.scrollLeft = scrollInicial - delta;
  });

  window.addEventListener('mouseup', () => {
    if (!arrastrando) return;
    arrastrando = false;
    el.classList.remove('arrastrando-scroll');
    if (huboArrastre) {
      const bloquearClick = (ev) => { ev.stopPropagation(); el.removeEventListener('click', bloquearClick, true); };
      el.addEventListener('click', bloquearClick, true);
    }
  });
}

document.addEventListener("DOMContentLoaded", function () {
  // =========================================================
  // MOCK — en producción esta base se llena/lee contra
  // /hadeon/api/contactos (clientes y proveedores) y el historial
  // de facturas viene de /hadeon/api/pos/facturas filtrado por
  // contacto_id. Cada factura cerrada en POS debe crear o
  // actualizar el contacto correspondiente (alimentación automática
  // mencionada en el roadmap — cimiento del futuro módulo de CRM).
  // =========================================================
  const AVATAR_COLORES = ['#0047ab', '#059669', '#b8860b', '#7c3aed', '#dc2626', '#0891b2'];
  function colorAvatar(id) { return AVATAR_COLORES[id % AVATAR_COLORES.length]; }
  function iniciales(nombre) {
    return nombre.split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
  }
  function formatoMoneda(n) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  let nextClienteId = 5;
  let nextProveedorId = 4;

  let CLIENTES_MOCK = [];

  let PROVEEDORES_MOCK = [];

  let filtroActual = { cliente: 'todos', proveedor: 'todos' };
  let busquedaActual = { cliente: '', proveedor: '' };
  let vistaActual = { cliente: 'lista', proveedor: 'lista' };

  function totalFacturado(contacto) {
    return contacto.facturas.reduce((acc, f) => acc + f.total, 0);
  }

  function renderBadgeEstado(estado) {
    return `<span class="contactos-badge ${estado}">${estado === 'activo' ? 'Activo' : 'Inactivo'}</span>`;
  }

  function obtenerFiltrados(tipo) {
    const datos = tipo === 'cliente' ? CLIENTES_MOCK : PROVEEDORES_MOCK;
    const filtro = filtroActual[tipo];
    const busq = busquedaActual[tipo].toLowerCase();
    return datos.filter(c => {
      const pasaFiltro = filtro === 'todos' || c.estado === filtro;
      const pasaBusqueda = !busq || c.nombre.toLowerCase().includes(busq) || c.email.toLowerCase().includes(busq) || c.idFiscal.toLowerCase().includes(busq);
      return pasaFiltro && pasaBusqueda;
    });
  }

  function htmlVacio(tipo) {
    return `
      <div class="contactos-vacio">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
        <h3>Sin resultados</h3>
        <p>No hay ${tipo === 'cliente' ? 'clientes' : 'proveedores'} que coincidan con el filtro o la búsqueda.</p>
      </div>`;
  }

  function renderVista(tipo) {
    renderTabla(tipo);
    renderTarjetas(tipo);
    document.getElementById(tipo === 'cliente' ? 'contactos-count-clientes' : 'contactos-count-proveedores').textContent =
      (tipo === 'cliente' ? CLIENTES_MOCK : PROVEEDORES_MOCK).length;
  }

  function renderTabla(tipo) {
    const tbody = document.getElementById(tipo === 'cliente' ? 'contactos-tbody-clientes' : 'contactos-tbody-proveedores');
    const filtrados = obtenerFiltrados(tipo);

    if (filtrados.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8">${htmlVacio(tipo)}</td></tr>`;
      return;
    }

    tbody.innerHTML = filtrados.map(c => `
      <tr data-id="${c.id}" data-tipo="${tipo}">
        <td>
          <div class="contactos-nombre-cell">
            <div class="contactos-avatar" style="background:${colorAvatar(c.id)};">${iniciales(c.nombre)}</div>
            <div>
              <div class="contactos-nombre-txt">${c.nombre}</div>
              <div class="contactos-nombre-sub">${c.direccion.split(',')[0]}</div>
            </div>
          </div>
        </td>
        <td>${c.telefono}</td>
        <td>${c.email}</td>
        <td>${c.idFiscal}</td>
        <td><span class="contactos-num-facturas">${c.facturas.length}</span></td>
        <td><span class="contactos-total-facturado">${formatoMoneda(totalFacturado(c))}</span></td>
        <td>${renderBadgeEstado(c.estado)}</td>
        <td>
          <div class="contactos-acciones-fila">
            <button class="contactos-icon-btn" type="button" data-accion="editar" data-id="${c.id}" data-tipo="${tipo}" title="Editar">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
            </button>
            <button class="contactos-icon-btn peligro" type="button" data-accion="eliminar" data-id="${c.id}" data-tipo="${tipo}" title="Eliminar">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function renderTarjetas(tipo) {
    const cont = document.getElementById(tipo === 'cliente' ? 'contactos-tarjetas-clientes' : 'contactos-tarjetas-proveedores');
    const filtrados = obtenerFiltrados(tipo);

    if (filtrados.length === 0) {
      cont.innerHTML = htmlVacio(tipo);
      return;
    }

    cont.innerHTML = filtrados.map(c => `
      <div class="contactos-tarjeta" data-id="${c.id}" data-tipo="${tipo}">
        <div class="contactos-tarjeta-top">
          <div class="contactos-tarjeta-id">
            <div class="contactos-avatar" style="background:${colorAvatar(c.id)};">${iniciales(c.nombre)}</div>
            <div style="min-width:0;">
              <div class="contactos-tarjeta-nombre">${c.nombre}</div>
              <div class="contactos-tarjeta-fiscal">${c.idFiscal}</div>
            </div>
          </div>
          ${renderBadgeEstado(c.estado)}
        </div>
        <div class="contactos-tarjeta-datos">
          <div><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"></path></svg><span>${c.telefono || 'Sin teléfono'}</span></div>
          <div><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg><span>${c.email || 'Sin email'}</span></div>
          <div><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg><span>${c.direccion.split(',')[0]}</span></div>
        </div>
        <div class="contactos-tarjeta-footer">
          <div class="contactos-tarjeta-metricas">
            <span class="contactos-total-facturado">${formatoMoneda(totalFacturado(c))}</span>
            <span class="contactos-num-facturas">${c.facturas.length} ${tipo === 'cliente' ? 'facturas' : 'compras'}</span>
          </div>
          <div class="contactos-tarjeta-acciones">
            <button class="contactos-icon-btn" type="button" data-accion="editar" data-id="${c.id}" data-tipo="${tipo}" title="Editar">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
            </button>
            <button class="contactos-icon-btn peligro" type="button" data-accion="eliminar" data-id="${c.id}" data-tipo="${tipo}" title="Eliminar">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
            </button>
          </div>
        </div>
      </div>
    `).join('');
  }

  function buscarContacto(tipo, id) {
    const lista = tipo === 'cliente' ? CLIENTES_MOCK : PROVEEDORES_MOCK;
    return lista.find(c => c.id === id);
  }

  // ---------------- Navegación de pestañas principales ----------------
  const tabsPrincipales = document.querySelectorAll('.contactos-tab-btn');
  const vistas = document.querySelectorAll('.contactos-vista');
  tabsPrincipales.forEach(btn => {
    btn.addEventListener('click', function () {
      const tab = this.getAttribute('data-tab');
      tabsPrincipales.forEach(b => b.classList.toggle('activo', b === this));
      vistas.forEach(v => v.classList.toggle('activa', v.id === 'contactos-vista-' + tab));
    });
  });

  // ---------------- Buscador y filtros ----------------
  document.querySelectorAll('[data-buscador]').forEach(input => {
    input.addEventListener('input', function () {
      const tipo = this.getAttribute('data-buscador');
      busquedaActual[tipo] = this.value;
      renderVista(tipo);
    });
  });
  document.querySelectorAll('[data-filtros]').forEach(grupo => {
    const tipo = grupo.getAttribute('data-filtros');
    grupo.querySelectorAll('.contactos-filtro-pill').forEach(pill => {
      pill.addEventListener('click', function () {
        grupo.querySelectorAll('.contactos-filtro-pill').forEach(p => p.classList.remove('activo'));
        this.classList.add('activo');
        filtroActual[tipo] = this.getAttribute('data-filtro');
        renderVista(tipo);
      });
    });
  });

  // ---------------- Selector de vista: Lista / Tarjetas ----------------
  document.querySelectorAll('[data-vista-switch]').forEach(grupo => {
    const tipo = grupo.getAttribute('data-vista-switch');
    grupo.querySelectorAll('.contactos-vista-switch-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const modo = this.getAttribute('data-vista-tipo');
        vistaActual[tipo] = modo;
        grupo.querySelectorAll('.contactos-vista-switch-btn').forEach(b => b.classList.toggle('activo', b === this));
        document.querySelector(`[data-contenedor="${tipo}-lista"]`).classList.toggle('activa', modo === 'lista');
        document.querySelector(`[data-contenedor="${tipo}-tarjetas"]`).classList.toggle('activa', modo === 'tarjetas');
      });
    });
  });

  // En teléfono la tabla tiene 8 columnas que genuinamente no caben
  // (de ahí el scroll horizontal con su barra azul) — en vez de pelear
  // contra eso, se arranca directo en la vista de tarjetas (cada
  // contacto en su propio bloque, todo apilado, sin ancho fijo que
  // desborde). El botón de lista/tarjetas sigue ahí por si alguien
  // prefiere la tabla igual. Solo decide el ancho inicial, una vez — no
  // vuelve a cambiar de vista solo porque la ventana se redimensione,
  // para no pisar una elección manual del usuario.
  if (window.innerWidth <= 767) {
    document.querySelectorAll('[data-vista-switch]').forEach(grupo => {
      const tipo = grupo.getAttribute('data-vista-switch');
      vistaActual[tipo] = 'tarjetas';
      grupo.querySelectorAll('.contactos-vista-switch-btn').forEach(b => {
        b.classList.toggle('activo', b.getAttribute('data-vista-tipo') === 'tarjetas');
      });
      const contLista = document.querySelector(`[data-contenedor="${tipo}-lista"]`);
      const contTarjetas = document.querySelector(`[data-contenedor="${tipo}-tarjetas"]`);
      if (contLista) contLista.classList.remove('activa');
      if (contTarjetas) contTarjetas.classList.add('activa');
    });
  }

  // ---------------- Modal de detalle ----------------
  const overlayDetalle = document.getElementById('contactos-overlay-detalle');
  let contactoActivo = null;

  function abrirDetalle(tipo, id) {
    const c = buscarContacto(tipo, id);
    if (!c) return;
    contactoActivo = { tipo, id };

    document.getElementById('contactos-detalle-avatar').style.background = colorAvatar(c.id);
    document.getElementById('contactos-detalle-avatar').textContent = iniciales(c.nombre);
    document.getElementById('contactos-detalle-nombre').textContent = c.nombre;
    document.getElementById('contactos-detalle-tipo').textContent = (tipo === 'cliente' ? 'Cliente' : 'Proveedor') + ' · ' + c.idFiscal;
    document.getElementById('contactos-detalle-telefono').textContent = c.telefono || '—';
    document.getElementById('contactos-detalle-email').textContent = c.email || '—';
    document.getElementById('contactos-detalle-idfiscal').textContent = c.idFiscal || '—';
    document.getElementById('contactos-detalle-estado').innerHTML = renderBadgeEstado(c.estado);
    document.getElementById('contactos-detalle-direccion').textContent = c.direccion || '—';
    document.getElementById('contactos-detalle-notas').textContent = (c.crudo ? c.crudo.notas : c.notas) || 'Sin notas registradas.';
    document.getElementById('contactos-detalle-contribuyente').textContent = c.contribuyenteEspecial ? 'Sí' : 'No';
    document.getElementById('contactos-detalle-dias').textContent = c.diasCredito ? c.diasCredito + ' días' : 'Al contado';

    const tbodyHist = document.getElementById('contactos-tbody-historial');
    if (c.facturas.length === 0) {
      tbodyHist.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#8d909e;padding:18px 6px;">Todavía no hay facturas vinculadas a este contacto.</td></tr>`;
    } else {
      tbodyHist.innerHTML = c.facturas.map(f => `
        <tr>
          <td><strong>${f.folio}</strong></td>
          <td>${f.fecha}</td>
          <td>${formatoMoneda(f.total)}</td>
          <td>${f.metodoPago || '—'}${(f.referencia || f.tipoEfectivo) ? ` <span class="contactos-nombre-sub">· ${f.referencia || f.tipoEfectivo}</span>` : ''}</td>
          <td><span class="contactos-estado-factura ${f.estado}">${f.estado}</span></td>
        </tr>
      `).join('');
    }
    document.getElementById('contactos-resumen-historial').innerHTML = `
      <div class="contactos-resumen-chip">
        <div class="contactos-resumen-chip-label"># ${tipo === 'cliente' ? 'Facturas' : 'Compras'}</div>
        <div class="contactos-resumen-chip-valor">${c.facturas.length}</div>
      </div>
      <div class="contactos-resumen-chip">
        <div class="contactos-resumen-chip-label">Total ${tipo === 'cliente' ? 'facturado' : 'comprado'}</div>
        <div class="contactos-resumen-chip-valor">${formatoMoneda(totalFacturado(c))}</div>
      </div>
    `;

    // Reset a la sub-pestaña "Datos"
    document.querySelectorAll('.contactos-modal-tab-btn').forEach(b => b.classList.toggle('activo', b.getAttribute('data-modal-tab') === 'datos'));
    document.querySelectorAll('.contactos-modal-vista-interna').forEach(v => v.classList.toggle('activa', v.id === 'contactos-modal-vista-datos'));

    overlayDetalle.classList.add('activo');
  }

  document.querySelectorAll('.contactos-modal-tab-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      const destino = this.getAttribute('data-modal-tab');
      document.querySelectorAll('.contactos-modal-tab-btn').forEach(b => b.classList.toggle('activo', b === this));
      document.querySelectorAll('.contactos-modal-vista-interna').forEach(v => v.classList.toggle('activa', v.id === 'contactos-modal-vista-' + destino));
    });
  });

  document.getElementById('contactos-btn-editar-desde-detalle').addEventListener('click', function () {
    if (!contactoActivo) return;
    overlayDetalle.classList.remove('activo');
    abrirFormulario(contactoActivo.tipo, contactoActivo.id);
  });

  // ---------------- Modal de alta/edición ----------------
  const overlayForm = document.getElementById('contactos-overlay-form');

  function abrirFormulario(tipo, id) {
    const esEdicion = !!id;
    const c = esEdicion ? buscarContacto(tipo, id) : null;

    document.getElementById('contactos-form-titulo').textContent = esEdicion
      ? ('Editar ' + (tipo === 'cliente' ? 'cliente' : 'proveedor'))
      : ('Nuevo ' + (tipo === 'cliente' ? 'cliente' : 'proveedor'));
    document.getElementById('contactos-form-sub').textContent = esEdicion
      ? 'Los cambios se reflejan de inmediato en la base de Contactos.'
      : 'Se agrega a la base de Contactos.';

    document.getElementById('contactos-form-id').value = esEdicion ? c.id : '';
    document.getElementById('contactos-form-tipo').value = tipo;
    document.getElementById('contactos-form-nombre').value = esEdicion ? c.crudo.nombre : '';
    document.getElementById('contactos-form-tipodoc').value = esEdicion && c.crudo.tipoDocumento ? c.crudo.tipoDocumento : (tipo === 'cliente' ? 'V' : 'J');
    document.getElementById('contactos-form-idfiscal').value = esEdicion ? c.crudo.numeroDocumento : '';
    document.getElementById('contactos-form-contribuyente').value = esEdicion && c.contribuyenteEspecial ? 'si' : 'no';
    document.getElementById('contactos-form-dias').value = esEdicion && c.diasCredito ? c.diasCredito : '';
    document.getElementById('contactos-form-error').textContent = '';
    document.getElementById('contactos-form-telefono').value = esEdicion ? c.crudo.telefono : '';
    document.getElementById('contactos-form-email').value = esEdicion ? c.crudo.email : '';
    document.getElementById('contactos-form-estado').value = esEdicion ? c.estado : 'activo';
    document.getElementById('contactos-form-direccion').value = esEdicion ? c.crudo.direccion : '';
    document.getElementById('contactos-form-notas').value = esEdicion ? c.crudo.notas : '';

    document.getElementById('contactos-form-nombre').style.borderColor = '';
    document.getElementById('contactos-form-idfiscal').style.borderColor = '';

    overlayForm.classList.add('activo');
  }

  // ---------------- Cerrar modales (botón X / Cancelar / Cerrar, y clic fuera) ----------------
  document.querySelectorAll('[data-cerrar-modal]').forEach(btn => {
    btn.addEventListener('click', function () {
      const destino = this.getAttribute('data-cerrar-modal');
      (destino === 'detalle' ? overlayDetalle : overlayForm).classList.remove('activo');
    });
  });
  [overlayDetalle, overlayForm].forEach(overlay => {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.classList.remove('activo');
    });
  });

  // ---------------- Clic en fila/tarjeta (abre detalle) + acciones editar/eliminar ----------------
  document.querySelectorAll('#contactos-tbody-clientes, #contactos-tbody-proveedores, #contactos-tarjetas-clientes, #contactos-tarjetas-proveedores').forEach(cont => {
    cont.addEventListener('click', function (e) {
      const btnAccion = e.target.closest('[data-accion]');
      if (btnAccion) {
        const tipo = btnAccion.getAttribute('data-tipo');
        const id = parseInt(btnAccion.getAttribute('data-id'), 10);
        if (btnAccion.getAttribute('data-accion') === 'editar') {
          abrirFormulario(tipo, id);
        } else if (btnAccion.getAttribute('data-accion') === 'eliminar') {
          if (!window.confirm('¿Eliminar este contacto?')) return;
          fetch('/nodus/api/contactos/' + id + '/eliminar', { method: 'POST' })
            .then(r => r.json())
            .then(res => {
              if (res.archivado) window.alert('Este contacto tiene facturas o movimientos, así que no se puede borrar: quedó como Inactivo.');
              return window.nodusCargarContactos();
            });
        }
        return;
      }
      const fila = e.target.closest('[data-id][data-tipo]');
      if (fila) {
        abrirDetalle(fila.getAttribute('data-tipo'), parseInt(fila.getAttribute('data-id'), 10));
      }
    });
  });

  // ---------------- Botones "Nuevo cliente" / "Nuevo proveedor" ----------------
  document.querySelectorAll('[data-nuevo]').forEach(btn => {
    btn.addEventListener('click', function () {
      abrirFormulario(this.getAttribute('data-nuevo'), null);
    });
  });

  // ---------------- Guardar (alta o edición) ----------------
  document.getElementById('contactos-btn-guardar-form').addEventListener('click', function () {
    const tipo = document.getElementById('contactos-form-tipo').value;
    const idRaw = document.getElementById('contactos-form-id').value;
    const nombre = document.getElementById('contactos-form-nombre').value.trim();
    const idFiscal = document.getElementById('contactos-form-idfiscal').value.trim();

    if (!nombre || !idFiscal) {
      if (!nombre) document.getElementById('contactos-form-nombre').style.borderColor = '#dc2626';
      if (!idFiscal) document.getElementById('contactos-form-idfiscal').style.borderColor = '#dc2626';
      return;
    }

    const datos = {
      tipo: tipo,
      nombre: nombre,
      tipoDocumento: document.getElementById('contactos-form-tipodoc').value,
      idFiscal: idFiscal,
      telefono: document.getElementById('contactos-form-telefono').value.trim(),
      email: document.getElementById('contactos-form-email').value.trim(),
      estado: document.getElementById('contactos-form-estado').value,
      contribuyenteEspecial: document.getElementById('contactos-form-contribuyente').value === 'si',
      diasCredito: document.getElementById('contactos-form-dias').value,
      direccion: document.getElementById('contactos-form-direccion').value.trim(),
      notas: document.getElementById('contactos-form-notas').value.trim()
    };
    const btnGuardar = this;
    const errorForm = document.getElementById('contactos-form-error');
    errorForm.textContent = '';
    btnGuardar.disabled = true;
    fetch('/nodus/api/contactos' + (idRaw ? '/' + parseInt(idRaw, 10) : ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos)
    })
      .then(r => r.json().then(j => ({ ok: r.ok, j: j })))
      .then(res => {
        btnGuardar.disabled = false;
        if (!res.ok || res.j.error) { errorForm.textContent = res.j.error || 'No se pudo guardar el contacto.'; return; }
        overlayForm.classList.remove('activo');
        return window.nodusCargarContactos();
      })
      .catch(() => { btnGuardar.disabled = false; errorForm.textContent = 'No se pudo guardar. Revisa tu conexión.'; });
  });

  // ---------------- Render inicial ----------------
  window.nodusCargarContactos = function () {
    return fetch('/nodus/api/contactos').then(r => r.json()).then(d => {
      CLIENTES_MOCK = d.clientes || [];
      PROVEEDORES_MOCK = d.proveedores || [];
      renderVista('cliente');
      renderVista('proveedor');
    }).catch(err => console.error('Error al cargar contactos:', err));
  };
  window.nodusCargarContactos();

  document.querySelectorAll('.contactos-tabla-wrap').forEach(habilitarArrastreScroll);
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



    pendientes.forEach((fn) => fn.call(realDoc, new Event("DOMContentLoaded")));
    return () => limpiar.forEach((f) => f());
}
