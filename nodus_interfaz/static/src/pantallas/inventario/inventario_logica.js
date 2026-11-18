/** @odoo-module **/
// Lógica de la pantalla Inventario (código de Nodus). Se monta al abrir la pantalla y se limpia al salir:
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
            // Las ventanas que la pantalla agrega "al body" quedan dentro de ella: con sus estilos y se van al salir
            if (prop === "body" && obj === realDoc) return raiz;
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



document.addEventListener("DOMContentLoaded", function () {
  // En teléfono, "Lista de Precios" debe calzar con el borde izquierdo
  // de la tarjeta blanca de abajo (el buscador/filtros) — el título no
  // tiene ese problema (el diseño anterior lo deja sin padding propio), pero el
  // botón sí queda con un corrimiento que no se pudo rastrear a una
  // sola propiedad CSS puntual. En vez de adivinar un valor fijo en px
  // (frágil si algo de arriba cambia), se mide la diferencia real entre
  // los dos bordes y se corrige con margin-left — queda exacto siempre,
  // sin importar de dónde venga el corrimiento.
  const btnListaPrecios = document.getElementById('Btn-lista-precios');
  const tarjetaBuscador = document.querySelector('.inv-barra');
  if (!btnListaPrecios || !tarjetaBuscador) return;

  function alinearBotonListaPrecios() {
    if (window.innerWidth >= 768) {
      btnListaPrecios.style.marginLeft = '';
      return;
    }
    btnListaPrecios.style.marginLeft = '0px';
    const rectBoton = btnListaPrecios.getBoundingClientRect();
    const rectTarjeta = tarjetaBuscador.getBoundingClientRect();
    btnListaPrecios.style.marginLeft = (rectTarjeta.left - rectBoton.left) + 'px';
  }

  alinearBotonListaPrecios();
  window.addEventListener('resize', alinearBotonListaPrecios);
});






// Envuelve un <select> nativo con un botón + panel flotante propio
// (mismo look que el calendario de Facturación). El <select> real
// sigue siendo la fuente de verdad: se oculta pero conserva su value
// y sus eventos 'change', así que todo el código que ya lee/escribe
// sobre él sigue funcionando sin cambios.

// Degradado dinámico de scroll — mismo sistema que ya usa Facturación
// (calcularDegradadoEje + aplicarMascara): el difuminado de cada lado
// se apaga solo cuando el scroll llega a ese límite, en vez de quedar
// siempre encendido en los dos extremos.
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
  if (validos.length === 0) {
    el.style.maskImage = 'none';
    el.style.webkitMaskImage = 'none';
    el.style.removeProperty('mask-composite');
    el.style.removeProperty('-webkit-mask-composite');
  } else if (validos.length === 1) {
    el.style.maskImage = validos[0];
    el.style.webkitMaskImage = validos[0];
    el.style.removeProperty('mask-composite');
    el.style.removeProperty('-webkit-mask-composite');
  } else {
    // Dos ejes activos a la vez (un contenedor que desborda vertical Y
    // horizontalmente): hay que interseccionar los gradientes, si no el
    // mask-composite "add"/"source-over" por defecto deja el elemento
    // opaco con que CUALQUIERA de los dos diga opaco.
    el.style.maskImage = validos.join(', ');
    el.style.webkitMaskImage = validos.join(', ');
    el.style.maskComposite = 'intersect';
    el.style.webkitMaskComposite = 'source-in';
  }
}

// Conecta el degradado dinámico a un contenedor con scroll: se
// recalcula en cada scroll y cada vez que cambia su contenido. Detecta
// solo-vertical, solo-horizontal o ambos ejes automáticamente según el
// desborde real de "el" — un contenedor que solo desborda verticalmente
// (la mayoría de los casos existentes) se comporta exactamente igual
// que antes, porque calcularDegradadoEje devuelve null para el eje sin
// desborde y aplicarMascara lo filtra.
//
// El mask-image NUNCA se aplica a "el" directamente: en Chrome la
// máscara de un elemento con overflow/scrollbar también recorta y
// difumina su barra de scroll nativa. El contenido de "el" se mueve
// una sola vez a un wrapper interno sin overflow propio
// (.hadeon-degradado-inner) y es ESE el que se enmascara — la barra de
// scroll de "el" queda siempre intacta. El wrapper se expone como
// actualizar.contenedor para que el código que renderiza filas/items
// dinámicamente sepa dónde appendear.
function hadeonActivarDegradadoScroll(el) {
  if (!el) return;
  let inner = el.querySelector(':scope > .hadeon-degradado-inner');
  if (!inner) {
    inner = document.createElement('div');
    inner.className = 'hadeon-degradado-inner';
    while (el.firstChild) inner.appendChild(el.firstChild);
    el.appendChild(inner);
  }
  function actualizar() {
    const maxScrollTop = el.scrollHeight - el.clientHeight;
    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    const vertical = calcularDegradadoEje('to bottom', el.scrollTop, maxScrollTop);
    const horizontal = calcularDegradadoEje('to right', el.scrollLeft, maxScrollLeft);
    aplicarMascara(inner, [vertical, horizontal]);
  }
  el.addEventListener('scroll', actualizar);
  window.addEventListener('resize', actualizar);
  actualizar();
  actualizar.contenedor = inner;
  return actualizar;
}

// Solo un panel de este tipo puede estar abierto a la vez en toda la
// página — guarda la función para cerrar el que esté abierto ahora.
let hadeonDropdownCerrarActual = null;

function hadeonCrearDropdown(select, opciones) {
  if (!select || select.closest('.hadeon-dropdown')) return;
  opciones = opciones || {};

  const wrapper = document.createElement('div');
  wrapper.className = 'hadeon-dropdown' + (opciones.compacto ? ' hadeon-dropdown-compacto' : '');
  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);
  select.classList.add('hadeon-select-oculto');

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'hadeon-dropdown-boton' + (opciones.compacto ? ' hadeon-dropdown-boton-compacto' : '');
  const textoBoton = document.createElement('span');
  boton.appendChild(textoBoton);
  boton.insertAdjacentHTML('beforeend', '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#6b7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8l4 4 4-4"></path></svg>');
  wrapper.appendChild(boton);

  const panel = document.createElement('div');
  panel.className = 'hadeon-dropdown-panel';
  wrapper.appendChild(panel);

  function actualizarBoton() {
    const opt = select.options[select.selectedIndex];
    textoBoton.textContent = opt ? opt.textContent : '';
  }

  // El panel se "teletransporta" a <body> mientras está abierto, con
  // position:fixed calculado a mano según la posición real del botón.
  // Así nunca queda adentro de un contenedor con mask-image (el
  // degradado del scroll) ni de ningún overflow:hidden — esos efectos
  // se aplican a todo el contenido de ese contenedor, aunque el panel
  // se vea "flotando" encima. Al cerrar, vuelve a su wrapper original.
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
    if (opciones.extra) {
      const filaExtra = document.createElement('div');
      filaExtra.className = 'hadeon-dropdown-opcion hadeon-dropdown-opcion-agregar';
      filaExtra.textContent = opciones.extra.texto;
      filaExtra.addEventListener('click', () => {
        cerrarPanel();
        opciones.extra.onClick();
      });
      panel.appendChild(filaExtra);
    }

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
  const boton = document.getElementById('Btn-agregar');
  const overlay = document.getElementById('modal-agregar-overlay');
  const tarjeta = document.getElementById('modal-agregar-tarjeta');
  const btnCerrar = document.getElementById('modal-agregar-cerrar');
  const btnCancelar = document.getElementById('modal-agregar-cancelar');

  if (!boton || !overlay || !tarjeta) return;

  const selectUnidadActual = document.getElementById('agregar-stock-actual-unidad');
  const selectUnidadMinimo = document.getElementById('agregar-stock-minimo-unidad');
  if (selectUnidadActual && selectUnidadMinimo) {
    selectUnidadActual.addEventListener('change', function () {
      selectUnidadMinimo.value = selectUnidadActual.value;
      selectUnidadMinimo.dispatchEvent(new Event('change'));
    });
  }

  // --- Mini-modal "Nueva Categoría" (se abre desde el "+ Agregar" de
  // cualquier desplegable de Categoría — el del modal de Producto o el
  // del filtro de arriba — sin salir de donde estés) ---
  const overlayCategoria = document.getElementById('modal-categoria-overlay');
  const inputNuevaCategoria = document.getElementById('nueva-categoria-nombre');
  let categoriaSelectDestino = null;

  function abrirModalCategoria(selectDestino) {
    if (!overlayCategoria) return;
    categoriaSelectDestino = selectDestino;
    inputNuevaCategoria.value = '';
    inputNuevaCategoria.style.borderColor = '';
    overlayCategoria.classList.add('abierto');
    setTimeout(() => inputNuevaCategoria.focus(), 200);
  }

  function cerrarModalCategoria() {
    if (!overlayCategoria) return;
    overlayCategoria.classList.remove('abierto');
  }

  if (overlayCategoria) {
    document.getElementById('modal-categoria-cerrar').addEventListener('click', cerrarModalCategoria);
    document.getElementById('modal-categoria-cancelar').addEventListener('click', cerrarModalCategoria);
    overlayCategoria.addEventListener('click', function (e) {
      if (e.target === overlayCategoria) cerrarModalCategoria();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlayCategoria.classList.contains('abierto')) cerrarModalCategoria();
    });
    document.getElementById('modal-categoria-guardar').addEventListener('click', function () {
      const nombreCategoria = inputNuevaCategoria.value.trim();
      if (!nombreCategoria) {
        inputNuevaCategoria.style.borderColor = '#dc2626';
        return;
      }
      // La agregamos a TODOS los selects de categoría que existan en la
      // página (el del modal y el del filtro), así quede disponible en
      // los dos sin importar desde cuál se haya creado.
      document.querySelectorAll('#agregar-categoria, #filtro-categoria').forEach(selectCat => {
        if (![...selectCat.options].some(o => o.value === nombreCategoria)) {
          const opt = document.createElement('option');
          opt.value = nombreCategoria;
          opt.textContent = nombreCategoria;
          selectCat.appendChild(opt);
        }
      });
      if (categoriaSelectDestino) {
        categoriaSelectDestino.value = nombreCategoria;
        categoriaSelectDestino.dispatchEvent(new Event('change'));
      }
      cerrarModalCategoria();
    });
  }

  window.hadeonAbrirModalCategoria = abrirModalCategoria;

  hadeonCrearDropdown(document.getElementById('agregar-categoria'), {
    extra: { texto: '+ Agregar categoría', onClick: () => abrirModalCategoria(document.getElementById('agregar-categoria')) }
  });
  hadeonCrearDropdown(selectUnidadActual, { compacto: true });
  hadeonCrearDropdown(selectUnidadMinimo, { compacto: true });

  // Estación de preparación -- mismas estaciones (Cocina, Barra,
  // Parrilla...) que se configuran en Configuración > Comandas y se
  // usan como filtro en el propio módulo de Comandas. Se leen del
  // mismo localStorage (no hay backend propio para esto todavía), así
  // que si se agrega/renombra una estación ahí, acá aparece sola la
  // próxima vez que se abra este modal.
  const ESTACIONES_STORAGE_KEY_INV = "hadeon_comandas_estaciones";
  const ESTACIONES_DEFAULT_INV = [
    { id: "cocina", nombre: "Cocina" },
    { id: "barra", nombre: "Barra" },
    { id: "parrilla", nombre: "Parrilla" },
  ];
  function leerEstacionesInventario() {
    try {
      const raw = window.localStorage.getItem(ESTACIONES_STORAGE_KEY_INV);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch (err) {
      console.error("❌ [Hadeon Inventario] No se pudo leer estaciones de localStorage:", err);
    }
    return ESTACIONES_DEFAULT_INV.slice();
  }
  function poblarSelectEstacion(valorActual) {
    const select = document.getElementById('agregar-estacion');
    if (!select) return;
    select.innerHTML = '<option value="">Sin asignar</option>';
    leerEstacionesInventario().forEach(function (estacion) {
      const opt = document.createElement('option');
      opt.value = estacion.nombre;
      opt.textContent = estacion.nombre;
      select.appendChild(opt);
    });
    select.value = valorActual && [...select.options].some(o => o.value === valorActual) ? valorActual : '';
    select.dispatchEvent(new Event('change'));
  }
  hadeonCrearDropdown(document.getElementById('agregar-estacion'));

  const actualizarDegradadoAgregar = hadeonActivarDegradadoScroll(document.getElementById('modal-agregar-body-principal'));

  let enAnimacion = false;
  let productoEditandoId = null;

  const tituloModal = document.getElementById('modal-agregar-titulo');
  const btnGuardarTexto = document.getElementById('modal-agregar-guardar');

  function limpiarFormulario() {
    document.getElementById('agregar-nombre').value = '';
    document.getElementById('agregar-nombre').style.borderColor = '';
    const selectCat = document.getElementById('agregar-categoria');
    selectCat.value = '';
    selectCat.dispatchEvent(new Event('change'));
    poblarSelectEstacion('');
    document.getElementById('agregar-stock-actual').value = '';
    document.getElementById('agregar-stock-minimo').value = '';
    document.getElementById('agregar-precio').value = '';
    document.getElementById('agregar-costo').value = '';
    if (window.nodusPonerIva) window.nodusPonerIva('');
    document.getElementById('agregar-descripcion').value = '';
  }

  function abrirParaCrear() {
    productoEditandoId = null;
    if (tituloModal) tituloModal.textContent = 'Nuevo Insumo / Producto';
    if (btnGuardarTexto) btnGuardarTexto.textContent = 'Guardar Producto';
    limpiarFormulario();
    abrirModal();
  }

  function abrirParaEditar(producto) {
    productoEditandoId = producto.id;
    if (tituloModal) tituloModal.textContent = 'Editar Producto';
    if (btnGuardarTexto) btnGuardarTexto.textContent = 'Guardar Cambios';

    const selectCategoria = document.getElementById('agregar-categoria');
    if (producto.categoria && ![...selectCategoria.options].some(o => o.value === producto.categoria)) {
      const opt = document.createElement('option');
      opt.value = producto.categoria;
      opt.textContent = producto.categoria;
      selectCategoria.appendChild(opt);
    }

    document.getElementById('agregar-nombre').value = producto.nombre || '';
    document.getElementById('agregar-nombre').style.borderColor = '';
    selectCategoria.value = producto.categoria || '';
    selectCategoria.dispatchEvent(new Event('change'));
    poblarSelectEstacion(producto.estacion || '');
    document.getElementById('agregar-stock-actual').value = producto.stock;
    document.getElementById('agregar-stock-minimo').value = producto.minimo;
    selectUnidadActual.value = producto.unidad || 'un';
    selectUnidadActual.dispatchEvent(new Event('change'));
    selectUnidadMinimo.value = producto.unidad || 'un';
    selectUnidadMinimo.dispatchEvent(new Event('change'));
    document.getElementById('agregar-precio').value = producto.precio;
    document.getElementById('agregar-costo').value = producto.costo || '';
    if (window.nodusPonerIva) window.nodusPonerIva(producto.ivaId);
    document.getElementById('agregar-descripcion').value = producto.descripcion || '';

    abrirModal();
  }

  window.hadeonInventarioModal = { abrirParaEditar };

  function abrirModal() {
    if (enAnimacion) return;
    enAnimacion = true;

    overlay.classList.add('abierto');
    document.body.style.overflow = 'hidden';
    overlay.style.transition = 'none';
    overlay.style.opacity = '0';

    // Medimos DESPUÉS de mostrar el overlay, para leer la posición
    // final real de la tarjeta ya centrada (técnica FLIP)
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

        if (actualizarDegradadoAgregar) actualizarDegradadoAgregar();
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
    abrirParaCrear();
  });

  btnCerrar.addEventListener('click', cerrarModal);
  btnCancelar.addEventListener('click', cerrarModal);

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) cerrarModal();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.classList.contains('abierto')) cerrarModal();
  });

  // Guardar (POST real a Odoo)
  document.getElementById('modal-agregar-guardar').addEventListener('click', function () {
    const nombre = document.getElementById('agregar-nombre').value.trim();
    if (!nombre) {
      document.getElementById('agregar-nombre').style.borderColor = '#dc2626';
      return;
    }
    const btnGuardar = document.getElementById('modal-agregar-guardar');
    btnGuardar.disabled = true;
    const url = productoEditandoId
      ? `/hadeon/api/inventario/productos/${productoEditandoId}`
      : '/hadeon/api/inventario/productos';
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre,
        categoria: document.getElementById('agregar-categoria').value,
        estacion: document.getElementById('agregar-estacion').value,
        stockActual: document.getElementById('agregar-stock-actual').value,
        stockMinimo: document.getElementById('agregar-stock-minimo').value,
        unidad: document.getElementById('agregar-stock-actual-unidad').value,
        precio: document.getElementById('agregar-precio').value,
        costo: document.getElementById('agregar-costo').value,
        ivaId: document.getElementById('agregar-iva').value,
        descripcion: document.getElementById('agregar-descripcion').value
      })
    })
      .then(r => r.json())
      .then(() => {
        cerrarModal();
        window.location.reload();
      })
      .catch(err => {
        console.error('Error al guardar producto:', err);
        btnGuardar.disabled = false;
      });
  });
});






document.addEventListener("DOMContentLoaded", function () {
  // Productos reales desde Odoo — se recargan cada vez que se abre el modal
  let productosOdoo = [];

  // Umbral de "Crítico" configurable desde Configuración > Inventario
  // (antes 70% fijo en el código) — se pide una vez al cargar la
  // página; si todavía no se guardó ningún valor, el backend devuelve
  // el mismo 70 de siempre como default.
  let umbralCriticoRatio = 0.7;
  fetch('/hadeon/api/config/inventario')
    .then(r => r.json())
    .then(data => {
      if (data && typeof data.umbralCritico === 'number') {
        umbralCriticoRatio = data.umbralCritico / 100;
      }
    })
    .catch(err => console.error('❌ [Hadeon] No se pudo cargar el umbral de alerta:', err));

  const boton = document.getElementById('Btn-alerta');
  const overlay = document.getElementById('modal-alertas-overlay');
  const tarjeta = document.getElementById('modal-alertas-tarjeta');
  const lista = document.getElementById('modal-alertas-lista');
  const btnCerrarX = document.getElementById('modal-alertas-cerrar-x');
  const btnCerrar = document.getElementById('modal-alertas-cerrar-btn');

  if (!boton || !overlay || !tarjeta || !lista) return;

  const actualizarDegradadoAlertas = hadeonActivarDegradadoScroll(lista);
  // Las filas se appendean al wrapper interno que crea el degradado,
  // nunca a "lista" directamente — así la máscara nunca toca el
  // elemento que tiene la barra de scroll.
  const listaInner = actualizarDegradadoAlertas ? actualizarDegradadoAlertas.contenedor : lista;

  // Umbral: por debajo de umbralCriticoRatio del mínimo = Crítico (rojo);
  // entre ese umbral y 100% del mínimo = Reponer Pronto (gris/naranja)
  function renderizarAlertas() {
    listaInner.innerHTML = '';
    const enAlerta = productosOdoo.filter(p => p.stock <= p.minimo);

    if (enAlerta.length === 0) {
      listaInner.innerHTML = '<div id="modal-alertas-vacio">No hay productos con stock bajo por ahora.</div>';
      if (actualizarDegradadoAlertas) actualizarDegradadoAlertas();
      return;
    }

    enAlerta.forEach(prod => {
      const ratio = prod.stock / prod.minimo;
      const esCritico = ratio <= umbralCriticoRatio;
      const nivel = esCritico ? 'critico' : 'reponer';
      const etiqueta = esCritico ? 'Stock Crítico' : 'Reponer Pronto';

      const item = document.createElement('div');
      item.className = `alerta-item ${nivel}`;
      item.innerHTML = `
        <div class="alerta-item-info">
          <p class="alerta-item-nombre">${prod.nombre}</p>
          <div class="alerta-item-datos">
            <p class="alerta-item-actual">Actual: ${prod.stock} ${prod.unidad}</p>
            <p class="alerta-item-minimo">Mínimo: ${prod.minimo} ${prod.unidad}</p>
          </div>
        </div>
        <div class="alerta-item-acciones">
          <span class="alerta-badge ${nivel}">${etiqueta}</span>
        </div>
      `;
      listaInner.appendChild(item);
    });
    if (actualizarDegradadoAlertas) actualizarDegradadoAlertas();
  }

  let enAnimacion = false;

  function abrirModal() {
    if (enAnimacion) return;
    enAnimacion = true;

    fetch('/hadeon/api/inventario/productos')
      .then(r => r.json())
      .then(data => {
        productosOdoo = data;
        renderizarAlertas();

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

            if (actualizarDegradadoAlertas) actualizarDegradadoAlertas();
            setTimeout(() => { enAnimacion = false; }, 400);
          });
        });
      })
      .catch(err => {
        console.error('Error al cargar alertas:', err);
        enAnimacion = false;
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

  btnCerrarX.addEventListener('click', cerrarModal);
  btnCerrar.addEventListener('click', cerrarModal);

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) cerrarModal();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.classList.contains('abierto')) cerrarModal();
  });
});






document.addEventListener("DOMContentLoaded", function () {
  let columnasPrecio = [];
  let productosPrecios = [];
  const cambiosPendientes = new Map(); // clave `${productoId}:${tipoPrecioId}` -> valor

  const boton = document.getElementById('Btn-lista-precios');
  const overlay = document.getElementById('modal-precios-overlay');
  const tarjeta = document.getElementById('modal-precios-tarjeta');
  const filas = document.getElementById('modal-precios-filas');
  const btnCerrarX = document.getElementById('modal-precios-cerrar-x');
  const btnCancelar = document.getElementById('modal-precios-cancelar');
  const btnGuardar = document.getElementById('modal-precios-guardar');

  if (!boton || !overlay || !tarjeta || !filas) return;

  const actualizarDegradadoPrecios = hadeonActivarDegradadoScroll(filas);
  // Las filas se appendean al wrapper interno del degradado, nunca a
  // "filas" directamente — así la máscara nunca toca el elemento que
  // tiene la barra de scroll. position:sticky del encabezado sigue
  // funcionando igual, porque "filas" (el que tiene overflow:auto)
  // sigue siendo el contenedor de scroll de referencia.
  const filasInner = actualizarDegradadoPrecios ? actualizarDegradadoPrecios.contenedor : filas;

  // Columnas en px fijos (nada de 1fr/auto): cada fila es un grid
  // independiente, así que si una columna dependiera del contenido
  // (1fr, auto) cada fila calcularía un ancho distinto a las demás y
  // el encabezado quedaría desalineado con las filas de datos.
  function plantillasColumnas() {
    return '56px 220px ' + columnasPrecio.map(() => '120px').join(' ') + ' 160px';
  }

  function renderizarPrecios() {
    filasInner.innerHTML = '';

    if (productosPrecios.length === 0) {
      filasInner.innerHTML = '<div id="modal-precios-vacio">No hay productos para mostrar.</div>';
      if (actualizarDegradadoPrecios) actualizarDegradadoPrecios();
      return;
    }

    const encabezado = document.createElement('div');
    encabezado.className = 'precios-fila-encabezado';
    encabezado.style.gridTemplateColumns = plantillasColumnas();
    encabezado.innerHTML = '<span></span><span>Producto</span>' +
      columnasPrecio.map(col => `<span>${col.nombre}</span>`).join('');
    const celdaAgregar = document.createElement('button');
    celdaAgregar.type = 'button';
    celdaAgregar.className = 'precios-btn-agregar-col';
    celdaAgregar.innerHTML = '<svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 4v12M4 10h12"></path></svg> Agregar precio';
    celdaAgregar.addEventListener('click', abrirModalColumna);
    encabezado.appendChild(celdaAgregar);
    filasInner.appendChild(encabezado);

    productosPrecios.forEach(prod => {
      const fila = document.createElement('div');
      fila.className = 'precios-fila';
      fila.style.gridTemplateColumns = plantillasColumnas();

      const icono = document.createElement('div');
      icono.className = 'precios-img-icono';
      icono.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
      fila.appendChild(icono);

      const nombre = document.createElement('span');
      nombre.className = 'precios-nombre';
      nombre.textContent = prod.nombre;
      fila.appendChild(nombre);

      columnasPrecio.forEach(col => {
        const clave = `${prod.id}:${col.id}`;
        const valorBase = cambiosPendientes.has(clave) ? cambiosPendientes.get(clave) : (prod.precios[col.id] || 0);

        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.01';
        input.className = 'precios-input';
        input.value = valorBase ? valorBase.toFixed(2) : '';
        input.placeholder = '0.00';
        if (cambiosPendientes.has(clave)) input.classList.add('sucio');

        input.addEventListener('input', () => {
          const valor = parseFloat(input.value) || 0;
          cambiosPendientes.set(clave, valor);
          input.classList.add('sucio');
        });

        fila.appendChild(input);
      });

      const celdaVacia = document.createElement('span');
      fila.appendChild(celdaVacia);

      filasInner.appendChild(fila);
    });

    if (actualizarDegradadoPrecios) actualizarDegradadoPrecios();
  }

  let enAnimacion = false;

  function abrirModal() {
    if (enAnimacion) return;
    enAnimacion = true;

    Promise.all([
      fetch('/hadeon/api/precios/columnas').then(r => r.json()),
      fetch('/hadeon/api/precios/productos').then(r => r.json())
    ])
      .then(([columnas, productos]) => {
        columnasPrecio = columnas;
        productosPrecios = productos;
        renderizarPrecios();

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

            if (actualizarDegradadoPrecios) actualizarDegradadoPrecios();
            setTimeout(() => {
              enAnimacion = false;
              // Rebote de entrada (una sola vez por carga de página) —
              // se espera a que termine la animación "morph" del modal
              // para no pelearse con esa transición.
              if (dispararReboteFn) dispararReboteFn();
            }, 400);
          });
        });
      })
      .catch(err => {
        console.error('Error al cargar lista de precios:', err);
        enAnimacion = false;
      });
  }

  function cerrarModal() {
    if (enAnimacion) return;
    enAnimacion = true;

    cambiosPendientes.clear();

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

  btnCerrarX.addEventListener('click', cerrarModal);
  btnCancelar.addEventListener('click', cerrarModal);

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) cerrarModal();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.classList.contains('abierto')) cerrarModal();
  });

  btnGuardar.addEventListener('click', function () {
    if (cambiosPendientes.size === 0) return;

    const valores = [...cambiosPendientes.entries()].map(([clave, valor]) => {
      const [productoId, tipoPrecioId] = clave.split(':').map(Number);
      return { productoId, tipoPrecioId, valor };
    });

    fetch('/hadeon/api/precios/guardar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valores })
    })
      .then(r => r.json())
      .then(() => {
        cambiosPendientes.clear();
        filas.querySelectorAll('.precios-input.sucio').forEach(input => input.classList.remove('sucio'));

        const textoOriginal = btnGuardar.textContent;
        btnGuardar.textContent = 'Guardado ✓';
        btnGuardar.disabled = true;
        setTimeout(() => {
          btnGuardar.textContent = textoOriginal;
          btnGuardar.disabled = false;
        }, 1500);
      })
      .catch(err => console.error('Error al guardar precios:', err));
  });

  // --- Control de scroll horizontal propio + rebote de entrada —
  // mismo sistema que ya usa Facturación (.ct-tabla-scroll): en PC se
  // ve el scrollbar nativo (azul) de "filas"; en tablet/móvil este
  // control touch-friendly lo reemplaza. A diferencia de Facturación
  // (que mueve un <table>), acá se mueve "filasInner" — el wrapper del
  // degradado — porque es el que tiene el ancho real del contenido. ---
  let dispararReboteFn = null;
  (function agregarScrollHorizontalPrecios() {
    const control = document.getElementById('modal-precios-scroll-control');
    if (!control) return;
    const track = control.querySelector('.hadeon-scroll-track');
    const thumb = control.querySelector('.hadeon-scroll-thumb');
    if (!track || !thumb) return;

    let sugerenciaMostrada = false;
    let yaAnimoEntrada = false;

    function reproducirReboteEntrada() {
      const distanciaNatural = filas.scrollWidth - filas.clientWidth;
      const extraRebote = 36;
      const distanciaTotal = distanciaNatural + extraRebote;
      const anchoTrack = track.clientWidth;
      const anchoThumb = thumb.offsetWidth;
      const maxThumbLeft = anchoTrack - anchoThumb;

      filasInner.style.transition = 'transform 0.65s cubic-bezier(0.22, 1, 0.36, 1)';
      filasInner.style.transform = `translateX(-${distanciaTotal}px)`;
      thumb.style.transition = 'left 0.65s cubic-bezier(0.22, 1, 0.36, 1)';
      thumb.style.left = maxThumbLeft + 'px';

      setTimeout(() => {
        filasInner.style.transition = 'transform 0.45s cubic-bezier(0.34, 1.4, 0.64, 1)';
        filasInner.style.transform = `translateX(-${distanciaNatural}px)`;
        thumb.style.left = maxThumbLeft + 'px';

        setTimeout(() => {
          filasInner.style.transition = 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
          filasInner.style.transform = 'translateX(0)';
          thumb.style.left = '0px';

          setTimeout(() => {
            filasInner.style.transition = '';
            filasInner.style.transform = '';
            thumb.style.transition = '';
            filas.scrollLeft = 0;
          }, 500);
        }, 450);
      }, 420);
    }

    function actualizarControl() {
      const necesitaScroll = filas.scrollWidth > filas.clientWidth + 2;
      control.classList.toggle('necesario', necesitaScroll);
      if (!necesitaScroll) return;

      const anchoTrack = track.clientWidth;
      const proporcionVisible = filas.clientWidth / filas.scrollWidth;
      const anchoThumb = Math.max(anchoTrack * proporcionVisible, 32);
      const maxScrollLeft = filas.scrollWidth - filas.clientWidth;
      const progreso = maxScrollLeft > 0 ? Math.min(Math.max(filas.scrollLeft / maxScrollLeft, 0), 1) : 0;
      const maxThumbLeft = anchoTrack - anchoThumb;

      thumb.style.width = anchoThumb + 'px';
      thumb.style.left = (progreso * maxThumbLeft) + 'px';

      if (!sugerenciaMostrada) {
        sugerenciaMostrada = true;
        thumb.classList.add('sugerencia');
        setTimeout(() => thumb.classList.remove('sugerencia'), 1500);
      }
    }

    filas.addEventListener('scroll', actualizarControl);
    window.addEventListener('resize', actualizarControl);
    if (window.ResizeObserver) {
      const observador = new ResizeObserver(actualizarControl);
      observador.observe(filas);
      observador.observe(filasInner);
    }

    // El modal no "aparece en viewport" como una tabla en una página
    // larga, así que no hay IntersectionObserver acá — el rebote se
    // dispara a mano (ver dispararReboteFn) una sola vez, la primera
    // vez que el modal se abre con desborde horizontal real.
    dispararReboteFn = function () {
      if (yaAnimoEntrada) return;
      actualizarControl();
      if (filas.scrollWidth > filas.clientWidth + 2) {
        yaAnimoEntrada = true;
        reproducirReboteEntrada();
      }
    };

    // Arrastrar el thumb con mouse o dedo
    let arrastrando = false;
    let inicioX = 0;
    let scrollInicial = 0;

    function iniciarArrastre(clientX) {
      thumb.classList.remove('sugerencia');
      arrastrando = true;
      inicioX = clientX;
      scrollInicial = filas.scrollLeft;
      thumb.style.transition = 'none';
    }
    function moverArrastre(clientX) {
      if (!arrastrando) return;
      const anchoTrack = track.clientWidth;
      const anchoThumb = thumb.offsetWidth;
      const maxScrollLeft = filas.scrollWidth - filas.clientWidth;
      const maxThumbLeft = anchoTrack - anchoThumb;
      if (maxThumbLeft <= 0) return;
      const deltaX = clientX - inicioX;
      const deltaScroll = (deltaX / maxThumbLeft) * maxScrollLeft;
      filas.scrollLeft = scrollInicial + deltaScroll;
    }
    function terminarArrastre() {
      arrastrando = false;
      thumb.style.transition = '';
    }

    thumb.addEventListener('mousedown', (e) => { e.preventDefault(); iniciarArrastre(e.clientX); });
    document.addEventListener('mousemove', (e) => moverArrastre(e.clientX));
    document.addEventListener('mouseup', terminarArrastre);

    thumb.addEventListener('touchstart', (e) => iniciarArrastre(e.touches[0].clientX), { passive: true });
    document.addEventListener('touchmove', (e) => { if (arrastrando) moverArrastre(e.touches[0].clientX); }, { passive: true });
    document.addEventListener('touchend', terminarArrastre);

    track.addEventListener('click', (e) => {
      if (e.target === thumb) return;
      const rectTrack = track.getBoundingClientRect();
      const clicX = e.clientX - rectTrack.left;
      const anchoThumb = thumb.offsetWidth;
      const maxThumbLeft = track.clientWidth - anchoThumb;
      const nuevoProgreso = Math.min(Math.max((clicX - anchoThumb / 2) / maxThumbLeft, 0), 1);
      const maxScrollLeft = filas.scrollWidth - filas.clientWidth;
      filas.scrollLeft = nuevoProgreso * maxScrollLeft;
    });

    control.querySelectorAll('.hadeon-scroll-flecha').forEach(btn => {
      btn.addEventListener('click', () => {
        const dir = parseInt(btn.getAttribute('data-dir'));
        const maxScrollLeft = filas.scrollWidth - filas.clientWidth;
        const destino = Math.min(Math.max(filas.scrollLeft + dir * 120, 0), maxScrollLeft);
        filas.scrollTo({ left: destino, behavior: 'smooth' });
      });
    });
  })();

  // --- Mini-modal "Nueva Columna de Precio" ---
  const overlayColumna = document.getElementById('modal-precios-columna-overlay');
  const inputNuevaColumna = document.getElementById('nueva-columna-precio-nombre');

  function abrirModalColumna() {
    if (!overlayColumna) return;
    inputNuevaColumna.value = '';
    inputNuevaColumna.style.borderColor = '';
    overlayColumna.classList.add('abierto');
    setTimeout(() => inputNuevaColumna.focus(), 200);
  }

  function cerrarModalColumna() {
    if (!overlayColumna) return;
    overlayColumna.classList.remove('abierto');
  }

  if (overlayColumna) {
    document.getElementById('modal-precios-columna-cerrar').addEventListener('click', cerrarModalColumna);
    document.getElementById('modal-precios-columna-cancelar').addEventListener('click', cerrarModalColumna);
    overlayColumna.addEventListener('click', function (e) {
      if (e.target === overlayColumna) cerrarModalColumna();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlayColumna.classList.contains('abierto')) cerrarModalColumna();
    });
    document.getElementById('modal-precios-columna-guardar').addEventListener('click', function () {
      const nombreColumna = inputNuevaColumna.value.trim();
      if (!nombreColumna) {
        inputNuevaColumna.style.borderColor = '#dc2626';
        return;
      }
      fetch('/hadeon/api/precios/columnas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombreColumna })
      })
        .then(r => r.json())
        .then(columna => {
          columnasPrecio.push(columna);
          renderizarPrecios();
          cerrarModalColumna();
        })
        .catch(err => console.error('Error al crear columna de precio:', err));
    });
  }
});






document.addEventListener("DOMContentLoaded", function () {

  // 1. Productos reales desde Odoo (product.product)
  let productosOdoo = [];

  let modoEliminar = false;
  const seleccionados = new Set();
  const btnEliminarModo = document.getElementById('Btn-eliminar-modo');
  const btnEliminarConfirmar = document.getElementById('Btn-eliminar-confirmar');

  const contenedorTabla = document.getElementById('contenedor-tabla-inventario');
  const filaPlantilla = document.getElementById('fila-plantilla');
  if (!contenedorTabla || !filaPlantilla) return;

  filaPlantilla.style.setProperty('display', 'none', 'important');

  // Envoltorio exclusivo para el scroll + degradado — así el degradado
  // afecta solo a las filas (imagen y texto), nunca a la caja blanca
  // con borde que las contiene (esa se queda sólida siempre).
  let scrollInventario = document.getElementById('hadeon-inventario-scroll');
  if (!scrollInventario) {
    scrollInventario = document.createElement('div');
    scrollInventario.id = 'hadeon-inventario-scroll';
    contenedorTabla.appendChild(scrollInventario);
  }
  const actualizarDegradadoTabla = typeof hadeonActivarDegradadoScroll === 'function'
    ? hadeonActivarDegradadoScroll(scrollInventario)
    : null;
  // Las filas se appendean al wrapper interno del degradado, nunca a
  // "scrollInventario" directamente — así la máscara nunca toca el
  // elemento que tiene la barra de scroll.
  const scrollInventarioInner = actualizarDegradadoTabla ? actualizarDegradadoTabla.contenedor : scrollInventario;

  const inputBuscador = document.getElementById('buscador-inventario');
  const selectCategoria = document.getElementById('filtro-categoria');
  const selectProveedor = document.getElementById('filtro-proveedor');
  if (typeof hadeonCrearDropdown === 'function') {
    hadeonCrearDropdown(selectCategoria, {
      extra: {
        texto: '+ Agregar categoría',
        onClick: () => { if (window.hadeonAbrirModalCategoria) window.hadeonAbrirModalCategoria(selectCategoria); }
      }
    });
    hadeonCrearDropdown(selectProveedor);
  }

  let textoBusqueda = '';
  let categoriaFiltro = 'Todas';
  let proveedorFiltro = 'Todos';

  // 2. Función auxiliar para inyectar texto — usa ID (así está configurado
  //    en el diseño anterior: campo "ID CSS", no "Clases CSS") en vez de clase.
  //    Nota: los clones de fila comparten el mismo id entre sí (técnicamente
  //    no es válido HTML5 tener ids duplicados en la página), pero como
  //    aquí SIEMPRE se busca "dentro de esta fila específica" (fila.querySelector),
  //    nunca se produce un cruce de datos entre filas — es seguro en la práctica.
  function inyectarTexto(fila, idCampo, texto, color = null) {
    const contenedor = fila.querySelector(`#${idCampo}`);
    if (!contenedor) return;
    const elementoTexto = contenedor.querySelector('.inv-txt') || contenedor;
    if (elementoTexto) {
        elementoTexto.innerText = texto;
        if (color) elementoTexto.style.color = color;
    }
  }

  // 3. Poblar los selects de Categoría y Proveedor dinámicamente, a
  // partir de los productos reales que llegaron de Odoo — ya no son
  // listas fijas escritas a mano.
  function poblarCategorias() {
    if (!selectCategoria) return;
    const yaListadas = new Set([...selectCategoria.options].map(o => o.value));
    const categoriasUnicas = [...new Set(productosOdoo.map(p => p.categoria).filter(Boolean))];
    categoriasUnicas.forEach(cat => {
      if (yaListadas.has(cat)) return;
      const opt = document.createElement('option');
      opt.value = cat;
      opt.innerText = cat;
      selectCategoria.appendChild(opt);
    });
  }

  function poblarProveedores() {
    if (!selectProveedor) return;
    const proveedoresUnicos = [...new Set(productosOdoo.map(p => p.proveedor))];
    proveedoresUnicos.forEach(prov => {
      const opt = document.createElement('option');
      opt.value = prov;
      opt.innerText = prov;
      selectProveedor.appendChild(opt);
    });
  }

  // 4. Render con filtros aplicados
  function renderizarTabla() {
    // 👈 fix: solo borramos las filas que NOSOTROS generamos en el render
    // anterior — antes borraba "todo lo que no sea la plantilla", lo cual
    // incluía por error el encabezado de columnas (es hermano de la
    // plantilla dentro del mismo contenedor) y lo eliminaba del DOM.
    scrollInventario.querySelectorAll('.fila-generada-inventario, .inventario-vacio').forEach(el => el.remove());

    const filtrados = productosOdoo.filter(prod => {
      const pasaTexto = prod.nombre.toLowerCase().includes(textoBusqueda);
      const pasaCategoria = categoriaFiltro === 'Todas' || prod.categoria === categoriaFiltro;
      const pasaProveedor = proveedorFiltro === 'Todos' || prod.proveedor === proveedorFiltro;
      return pasaTexto && pasaCategoria && pasaProveedor;
    });

    if (filtrados.length === 0) {
      const vacio = document.createElement('div');
      vacio.className = 'inventario-vacio';
      vacio.innerText = 'No se encontraron productos con esos filtros.';
      scrollInventarioInner.appendChild(vacio);
      if (actualizarDegradadoTabla) actualizarDegradadoTabla();
      return;
    }

    filtrados.forEach(prod => {
      const nuevaFila = filaPlantilla.cloneNode(true);
      nuevaFila.removeAttribute('id');
      nuevaFila.classList.add('fila-generada-inventario'); // 👈 marca para poder borrarla después sin tocar nada más
      nuevaFila.style.display = '';

      const enAlerta = prod.stock <= prod.minimo;
      const colorStock = enAlerta ? '#dc2626' : '#16a34a';

      if (modoEliminar) {
        const casilla = document.createElement('div');
        casilla.className = 'hadeon-fila-checkbox';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = seleccionados.has(prod.id);
        input.addEventListener('change', () => {
          if (input.checked) {
            seleccionados.add(prod.id);
          } else {
            seleccionados.delete(prod.id);
          }
          actualizarBotonEliminarConfirmar();
        });
        casilla.appendChild(input);
        nuevaFila.prepend(casilla);
      }

      inyectarTexto(nuevaFila, 'dato-nombre', prod.nombre);
      const fotoFila = nuevaFila.querySelector('#dato-icono img');
      if (fotoFila) { fotoFila.removeAttribute('srcset'); fotoFila.removeAttribute('loading'); fotoFila.src = prod.imagen ? prod.imagen : '/nodus_interfaz/static/src/img/nodus_sin_imagen.png'; fotoFila.style.objectFit = 'cover'; fotoFila.style.borderRadius = '10px'; }
      inyectarTexto(nuevaFila, 'dato-categoria', prod.categoria);
      inyectarTexto(nuevaFila, 'dato-stock', `${prod.stock} ${prod.unidad}`, colorStock);
      inyectarTexto(nuevaFila, 'dato-minimo', `${prod.minimo} ${prod.unidad}`);
      inyectarTexto(nuevaFila, 'dato-precio', `$${prod.precio.toFixed(2)}`);

      if (!modoEliminar) {
        nuevaFila.style.cursor = 'pointer';
        nuevaFila.addEventListener('click', () => {
          if (window.hadeonInventarioModal) {
            window.hadeonInventarioModal.abrirParaEditar(prod);
          }
        });

        const iconoEditar = document.createElement('div');
        iconoEditar.className = 'hadeon-fila-editar-icono';
        iconoEditar.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Ver producto"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
        nuevaFila.prepend(iconoEditar);
      }

      scrollInventarioInner.appendChild(nuevaFila);
    });
    if (actualizarDegradadoTabla) actualizarDegradadoTabla();
  }

  // 4b. Modo eliminación: muestra checkboxes y el botón de confirmación
  function actualizarBotonEliminarConfirmar() {
    if (!btnEliminarConfirmar) return;
    const n = seleccionados.size;
    btnEliminarConfirmar.style.display = modoEliminar && n > 0 ? 'inline-block' : 'none';
    btnEliminarConfirmar.textContent = `Eliminar seleccionados (${n})`;
  }

  if (btnEliminarModo) {
    btnEliminarModo.addEventListener('click', () => {
      modoEliminar = !modoEliminar;
      seleccionados.clear();
      btnEliminarModo.classList.toggle('activo', modoEliminar);
      btnEliminarModo.textContent = modoEliminar ? 'Cancelar' : 'Eliminar';
      actualizarBotonEliminarConfirmar();
      renderizarTabla();
    });
  }

  if (btnEliminarConfirmar) {
    btnEliminarConfirmar.addEventListener('click', () => {
      if (seleccionados.size === 0) return;
      if (!window.confirm(`¿Eliminar ${seleccionados.size} producto(s)? Esta acción no se puede deshacer.`)) return;
      btnEliminarConfirmar.disabled = true;
      fetch('/hadeon/api/inventario/productos/eliminar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...seleccionados] })
      })
        .then(r => r.json())
        .then(() => {
          window.location.reload();
        })
        .catch(err => {
          console.error('Error al eliminar productos:', err);
          btnEliminarConfirmar.disabled = false;
        });
    });
  }

  // 5. Listeners de los filtros
  if (inputBuscador) {
    inputBuscador.addEventListener('input', (e) => {
      textoBusqueda = e.target.value.toLowerCase();
      renderizarTabla();
    });
  }
  if (selectCategoria) {
    selectCategoria.addEventListener('change', (e) => {
      categoriaFiltro = e.target.value;
      renderizarTabla();
    });
  }
  if (selectProveedor) {
    selectProveedor.addEventListener('change', (e) => {
      proveedorFiltro = e.target.value;
      renderizarTabla();
    });
  }

  // 6. Inicialización
  // 7. Badge de Alertas — dinámico según el inventario real
  //    (igual que el ícono de carrito de una tienda: solo se ve si hay algo)
  function actualizarBadgeAlertas() {
    const contador = document.getElementById('contador-alertas');
    if (!contador) return;
    const totalAlertas = productosOdoo.filter(p => p.stock <= p.minimo).length;
    if (totalAlertas > 0) {
      contador.style.display = 'inline-flex';
      contador.innerText = totalAlertas;
    } else {
      contador.style.display = 'none';
    }
  }

  fetch('/hadeon/api/inventario/productos')
    .then(r => r.json())
    .then(data => {
      productosOdoo = data;
      poblarCategorias();
      poblarProveedores();
      renderizarTabla();
      actualizarBadgeAlertas();
    })
    .catch(err => console.error('Error al cargar productos:', err));
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






document.addEventListener("DOMContentLoaded", function () {
  /* ---------- IVA en la ficha de producto ---------- */
  var selectIva = document.getElementById('agregar-iva');
  var ivaPorDefecto = '';
  fetch('/nodus/api/impuestos?tipo=sale').then(function (r) { return r.json(); }).then(function (lista) {
    lista.forEach(function (t) {
      var o = document.createElement('option'); o.value = String(t.id); o.textContent = t.nombre; selectIva.appendChild(o);
      if (!ivaPorDefecto && Number(t.monto) > 0) { ivaPorDefecto = String(t.id); }
    });
    if (typeof hadeonCrearDropdown === 'function') { hadeonCrearDropdown(selectIva); }
    window.nodusPonerIva('');
  });
  window.nodusPonerIva = function (valor) {
    selectIva.value = valor === '' || valor === false || valor === null || valor === undefined ? ivaPorDefecto : String(valor);
    selectIva.dispatchEvent(new Event('change'));
  };

  /* ---------- Registrar Compra ---------- */
  var boton = document.getElementById('Btn-compra');
  var overlay = document.getElementById('modal-compra-overlay');
  var tarjeta = document.getElementById('modal-compra-tarjeta');
  var lineas = document.getElementById('compra-lineas');
  var selectProv = document.getElementById('compra-proveedor');
  var bloqueNuevo = document.getElementById('compra-nuevo-proveedor');
  var error = document.getElementById('compra-error');
  var productos = [];
  var enAnimacion = false;

  function dinero(v) { return '$' + (Number(v) || 0).toFixed(2); }

  function cargarProveedores() {
    return fetch('/nodus/api/proveedores').then(function (r) { return r.json(); }).then(function (lista) {
      selectProv.innerHTML = '<option value="" disabled="disabled" selected="selected">Seleccionar...</option>';
      lista.forEach(function (p) { var o = document.createElement('option'); o.value = String(p.id); o.textContent = p.nombre; selectProv.appendChild(o); });
      var nuevo = document.createElement('option'); nuevo.value = 'nuevo'; nuevo.textContent = '+ Nuevo proveedor'; selectProv.appendChild(nuevo);
      selectProv.dispatchEvent(new Event('change'));
    });
  }
  if (typeof hadeonCrearDropdown === 'function') { hadeonCrearDropdown(selectProv); }
  selectProv.addEventListener('change', function () {
    bloqueNuevo.classList.toggle('nodus-oculto', selectProv.value !== 'nuevo');
  });

  function recalcular() {
    var total = 0;
    lineas.querySelectorAll('.nodus-compra-linea').forEach(function (f) {
      total += (Number(f.querySelector('.c-cant').value) || 0) * (Number(f.querySelector('.c-costo').value) || 0);
    });
    document.getElementById('compra-total').textContent = dinero(total);
  }

  function agregarLinea() {
    var fila = document.createElement('div');
    fila.className = 'nodus-compra-linea';
    var opciones = '<option value="">Elegir producto...</option>' + productos.map(function (p) {
      return '<option value="' + p.id + '">' + p.nombre.replace(/</g, '&lt;') + '</option>';
    }).join('');
    fila.innerHTML = '<select class="c-prod">' + opciones + '</select>' +
      '<input class="c-cant" type="number" min="0" step="any" placeholder="0" />' +
      '<input class="c-costo" type="number" min="0" step="0.01" placeholder="0.00" />' +
      '<input class="c-barras" type="text" placeholder="Escanear o escribir" />' +
      '<button type="button" class="nodus-compra-quitar" aria-label="Quitar">✕</button>';
    var sel = fila.querySelector('.c-prod');
    sel.addEventListener('change', function () {
      var p = productos.find(function (x) { return String(x.id) === sel.value; });
      if (p) {
        if (!fila.querySelector('.c-costo').value) { fila.querySelector('.c-costo').value = p.costo ? Number(p.costo).toFixed(2) : ''; }
        fila.querySelector('.c-barras').value = p.codigoBarras || '';
      }
      recalcular();
    });
    fila.querySelectorAll('.c-cant, .c-costo').forEach(function (i) { i.addEventListener('input', recalcular); });
    fila.querySelector('.nodus-compra-quitar').addEventListener('click', function () { fila.remove(); recalcular(); });
    lineas.appendChild(fila);
  }
  document.getElementById('compra-agregar-linea').addEventListener('click', agregarLinea);

  function abrir() {
    if (enAnimacion) return;
    enAnimacion = true;
    error.textContent = '';
    lineas.innerHTML = '';
    document.getElementById('compra-referencia').value = '';
    document.getElementById('compra-facturar').checked = false;
    document.getElementById('compra-proveedor-nombre').value = '';
    document.getElementById('compra-proveedor-rif').value = '';
    Promise.all([
      cargarProveedores(),
      fetch('/hadeon/api/inventario/productos').then(function (r) { return r.json(); }).then(function (d) { productos = d; })
    ]).then(function () { agregarLinea(); recalcular(); });

    overlay.classList.add('abierto');
    overlay.style.transition = 'none'; overlay.style.opacity = '0';
    var rb = boton.getBoundingClientRect(), rt = tarjeta.getBoundingClientRect();
    tarjeta.style.transition = 'none';
    tarjeta.style.transform = 'translate(' + ((rb.left + rb.width / 2) - (rt.left + rt.width / 2)) + 'px,' + ((rb.top + rb.height / 2) - (rt.top + rt.height / 2)) + 'px) scale(' + (rb.width / rt.width) + ',' + (rb.height / rt.height) + ')';
    tarjeta.style.opacity = '0';
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      overlay.style.transition = 'opacity 0.3s ease'; overlay.style.opacity = '1';
      tarjeta.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease';
      tarjeta.style.transform = 'translate(0, 0) scale(1, 1)'; tarjeta.style.opacity = '1';
      setTimeout(function () { enAnimacion = false; }, 400);
    }); });
  }

  function cerrar() {
    if (enAnimacion) return;
    enAnimacion = true;
    var rb = boton.getBoundingClientRect(), rt = tarjeta.getBoundingClientRect();
    overlay.style.transition = 'opacity 0.3s ease'; overlay.style.opacity = '0';
    tarjeta.style.transition = 'transform 0.35s cubic-bezier(0.4, 0, 1, 1), opacity 0.25s ease';
    tarjeta.style.transform = 'translate(' + ((rb.left + rb.width / 2) - (rt.left + rt.width / 2)) + 'px,' + ((rb.top + rb.height / 2) - (rt.top + rt.height / 2)) + 'px) scale(' + (rb.width / rt.width) + ',' + (rb.height / rt.height) + ')';
    tarjeta.style.opacity = '0';
    setTimeout(function () { overlay.classList.remove('abierto'); enAnimacion = false; }, 350);
  }

  boton.addEventListener('click', function (e) { e.preventDefault(); abrir(); });
  document.getElementById('modal-compra-cerrar').addEventListener('click', cerrar);
  document.getElementById('modal-compra-cancelar').addEventListener('click', cerrar);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) cerrar(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay.classList.contains('abierto')) cerrar(); });

  document.getElementById('modal-compra-guardar').addEventListener('click', function () {
    var lista = [];
    lineas.querySelectorAll('.nodus-compra-linea').forEach(function (f) {
      var id = f.querySelector('.c-prod').value, cant = f.querySelector('.c-cant').value;
      if (id && Number(cant) > 0) {
        lista.push({ productoId: id, cantidad: cant, costo: f.querySelector('.c-costo').value, codigoBarras: f.querySelector('.c-barras').value });
      }
    });
    var datos = { lineas: lista, referencia: document.getElementById('compra-referencia').value, facturar: document.getElementById('compra-facturar').checked };
    if (selectProv.value === 'nuevo') {
      datos.proveedorNombre = document.getElementById('compra-proveedor-nombre').value;
      datos.proveedorRif = document.getElementById('compra-proveedor-rif').value;
    } else {
      datos.proveedorId = selectProv.value;
    }
    if (!datos.proveedorId && !(datos.proveedorNombre || '').trim()) { error.textContent = 'Indica el proveedor.'; return; }
    if (!lista.length) { error.textContent = 'Agrega al menos un producto con su cantidad.'; return; }
    var btn = document.getElementById('modal-compra-guardar');
    btn.disabled = true; error.textContent = '';
    fetch('/nodus/api/inventario/compra', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        btn.disabled = false;
        if (!res.ok || res.j.error) { error.textContent = res.j.error || 'No se pudo registrar la compra.'; return; }
        cerrar();
        setTimeout(function () { window.location.reload(); }, 360);
      })
      .catch(function () { btn.disabled = false; error.textContent = 'No se pudo registrar la compra. Revisa tu conexión.'; });
  });
});



    pendientes.forEach((fn) => fn.call(realDoc, new Event("DOMContentLoaded")));
    return () => limpiar.forEach((f) => f());
}
