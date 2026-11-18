/** @odoo-module **/
// Lógica de la pantalla Configuración (código de Nodus). Se monta al abrir la pantalla y se limpia al salir:
// los escuchas de window/document y los temporizadores quedan registrados para quitarlos.

import { crearEntorno } from "../entorno";

export function montar(raiz) {
    const { document, window, matchMedia, setInterval, setTimeout, arrancar, detener } = crearEntorno(raiz);



(function () {
  "use strict";

  // =========================================================
  // Helpers propios de esta página (copia local, misma
  // convención que Punto de Venta: cada página es standalone).
  // =========================================================

  window.hadeonConfig = window.hadeonConfig || {};
  window.hadeonConfig.csrfToken = null;

  // =========================================================
  // Dropdown flotante — mismo sistema que usa Inventario
  // (hadeonCrearDropdown): toma un <select> nativo, lo oculta y
  // arma un botón + panel flotante encima, manteniendo el select
  // real sincronizado para que el resto del código no cambie.
  // Copia local (cada página es standalone en este proyecto).
  // =========================================================

  let hadeonDropdownCerrarActual = null;

  function hadeonCrearDropdown(select, opciones) {
    if (!select || select.closest(".hadeon-dropdown")) return;
    opciones = opciones || {};

    const wrapper = document.createElement("div");
    wrapper.className = "hadeon-dropdown" + (opciones.compacto ? " hadeon-dropdown-compacto" : "");
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);
    select.classList.add("hadeon-select-oculto");

    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "hadeon-dropdown-boton" + (opciones.compacto ? " hadeon-dropdown-boton-compacto" : "");
    const textoBoton = document.createElement("span");
    boton.appendChild(textoBoton);
    boton.insertAdjacentHTML("beforeend", '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#6b7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8l4 4 4-4"></path></svg>');
    wrapper.appendChild(boton);

    const panel = document.createElement("div");
    panel.className = "hadeon-dropdown-panel";
    wrapper.appendChild(panel);

    function actualizarBoton() {
      const opt = select.options[select.selectedIndex];
      textoBoton.textContent = opt ? opt.textContent : "";
    }

    function posicionarPanel() {
      const rect = boton.getBoundingClientRect();
      const alturaPanel = panel.offsetHeight || 260;
      const espacioAbajo = window.innerHeight - rect.bottom;
      // Si no hay espacio suficiente debajo del botón (ej. está cerca del
      // borde inferior de la ventana), el panel se abre hacia arriba en
      // vez de quedar cortado.
      const abrirHaciaArriba = espacioAbajo < alturaPanel + 16 && rect.top > alturaPanel + 16;
      const top = abrirHaciaArriba ? (rect.top - alturaPanel - 8) : (rect.bottom + 8);
      // setProperty(..., "important") en vez de asignación directa: así
      // ningún !important de hoja de estilos (propio o heredado de
      // el diseño anterior) le puede ganar a la posición calculada en vivo.
      panel.style.setProperty("position", "fixed", "important");
      panel.style.setProperty("top", top + "px", "important");
      panel.style.setProperty("left", rect.left + "px", "important");
      panel.style.setProperty("min-width", rect.width + "px", "important");
    }

    function cerrarPanel() {
      panel.classList.remove("abierto");
      boton.classList.remove("abierto");
      wrapper.appendChild(panel);
      panel.style.removeProperty("position");
      panel.style.removeProperty("top");
      panel.style.removeProperty("left");
      panel.style.removeProperty("min-width");
      window.removeEventListener("scroll", posicionarPanel, true);
      window.removeEventListener("resize", posicionarPanel);
      if (hadeonDropdownCerrarActual === cerrarPanel) {
        hadeonDropdownCerrarActual = null;
      }
    }

    function abrirPanel() {
      if (hadeonDropdownCerrarActual && hadeonDropdownCerrarActual !== cerrarPanel) {
        hadeonDropdownCerrarActual();
      }

      panel.innerHTML = "";
      Array.from(select.options).forEach(function (opt) {
        const fila = document.createElement("div");
        fila.className = "hadeon-dropdown-opcion" + (opt.value === select.value ? " seleccionada" : "");
        fila.textContent = opt.textContent;
        fila.addEventListener("click", function () {
          select.value = opt.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          cerrarPanel();
        });
        panel.appendChild(fila);
      });

      document.body.appendChild(panel);
      posicionarPanel();
      window.addEventListener("scroll", posicionarPanel, true);
      window.addEventListener("resize", posicionarPanel);

      panel.classList.add("abierto");
      boton.classList.add("abierto");
      hadeonDropdownCerrarActual = cerrarPanel;
    }

    boton.addEventListener("click", function (e) {
      e.stopPropagation();
      if (panel.classList.contains("abierto")) cerrarPanel(); else abrirPanel();
    });
    document.addEventListener("click", function (e) {
      if (!wrapper.contains(e.target) && !panel.contains(e.target)) cerrarPanel();
    });
    select.addEventListener("change", actualizarBoton);

    actualizarBoton();
  }

  async function nodusFetchReal(path, opciones) {
    opciones = opciones || {};
    const metodo = opciones.method || "GET";
    const headers = { "Content-Type": "application/json" };
    if (metodo !== "GET" && window.hadeonConfig.csrfToken) {
      headers["X-CSRF-Token"] = window.hadeonConfig.csrfToken;
    }
    let resp;
    try {
      resp = await fetch("/nodus/api/v1" + path, {
        method: metodo,
        headers: headers,
        body: opciones.body ? JSON.stringify(opciones.body) : undefined,
      });
    } catch (e) {
      e.hadeonInfraError = true;
      throw e;
    }
    let sobre;
    try {
      sobre = await resp.json();
    } catch (e) {
      const err = new Error("nodus_api no respondio JSON en /api/v1" + path + " (status " + resp.status + ")");
      err.hadeonInfraError = true;
      throw err;
    }
    if (!sobre.ok) {
      const error = new Error((sobre.error && sobre.error.message) || "Error de NODUS.");
      error.code = sobre.error && sobre.error.code;
      error.status = resp.status;
      throw error;
    }
    return sobre.data;
  }

  // Fallback automatico a datos de ejemplo si nodus_api no esta
  // instalado/no responde en esta Nodus -- mismo criterio que en
  // Punto de Venta (ver el comentario largo ahi). Un error de negocio
  // real de nodus_api nunca cae al mock.
  async function nodusFetch(path, opciones) {
    try {
      return await nodusFetchReal(path, opciones);
    } catch (e) {
      if (e.hadeonInfraError) {
        console.warn("[Hadeon Config] nodus_api no disponible en esta Nodus para " + path + ":", e.message);
        throw e;
      }
      throw e;
    }
  }


  async function hadeonFetch(path, opciones) {
    opciones = opciones || {};
    const resp = await fetch(path, {
      method: opciones.method || "GET",
      headers: { "Content-Type": "application/json" },
      body: opciones.body ? JSON.stringify(opciones.body) : undefined,
    });
    const data = await resp.json().catch(function () { return {}; });
    if (!resp.ok) {
      throw new Error(data.error || "No se pudo completar la solicitud.");
    }
    return data;
  }

  const toastHost = document.getElementById("config-toast-host");
  function mostrarToast(mensaje, tipo) {
    if (!toastHost) return;
    const toast = document.createElement("div");
    toast.className = "config-toast" + (tipo ? " " + tipo : "");
    toast.textContent = mensaje;
    toastHost.appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add("visible"); });
    setTimeout(function () {
      toast.classList.remove("visible");
      setTimeout(function () { toast.remove(); }, 250);
    }, 3800);
  }

  // =========================================================
  // Cambio de pestañas
  // =========================================================

  const botonesSubnav = document.querySelectorAll(".config-subnav-item[data-config-vista]");
  const vistas = document.querySelectorAll(".config-vista");

  botonesSubnav.forEach(function (boton) {
    boton.addEventListener("click", function () {
      const destino = boton.getAttribute("data-config-vista");

      botonesSubnav.forEach(function (b) { b.classList.remove("activo"); });
      boton.classList.add("activo");

      vistas.forEach(function (vista) { vista.classList.remove("activa"); });
      const vistaDestino = document.getElementById("config-vista-" + destino);
      if (vistaDestino) vistaDestino.classList.add("activa");

      if (destino === "empresa") cargarEmpresa();
      if (destino === "pos") cargarPos();
      if (destino === "inventario") cargarInventario();
      if (destino === "facturacion") cargarFacturacion();
      if (destino === "usuarios") cargarUsuarios();

      boton.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    });
  });

  // =========================================================
  // FLECHAS DE SCROLL DEL SUBNAV EN MÓVIL — mismo patrón que las
  // pestañas de Contabilidad / el filtro de categorías del POS:
  // aparecen solo cuando hay hacia dónde deslizar.
  // =========================================================
  (function () {
    const subnavContenedor = document.getElementById("config-subnav-scroll");
    const subnavFlechaIzq = document.getElementById("config-subnav-scroll-izq");
    const subnavFlechaDer = document.getElementById("config-subnav-scroll-der");
    if (!subnavContenedor || !subnavFlechaIzq || !subnavFlechaDer) return;

    const subnavWrapperEl = subnavContenedor.closest(".config-subnav");

    function calcularDegradadoSubnav(direccionCSS, posActual, maxPos) {
      if (maxPos <= 2) return null;
      const enInicio = posActual <= 2;
      const enFin = posActual >= maxPos - 2;
      const rampaSalida = "black calc(100% - 28px), rgba(0,0,0,0.55) calc(100% - 14px), rgba(0,0,0,0.15) calc(100% - 4px), transparent 100%";
      const rampaEntrada = "transparent 0, rgba(0,0,0,0.15) 4px, rgba(0,0,0,0.55) 14px, black 28px";
      if (enInicio) return "linear-gradient(" + direccionCSS + ", black 0, " + rampaSalida + ")";
      if (enFin) return "linear-gradient(" + direccionCSS + ", " + rampaEntrada + ", black 100%)";
      return "linear-gradient(" + direccionCSS + ", " + rampaEntrada + ", black calc(50% - 8px), black calc(50% + 8px), " + rampaSalida + ")";
    }

    function actualizarFlechasSubnav() {
      const hayDesborde = subnavContenedor.scrollWidth > subnavContenedor.clientWidth + 2;
      if (subnavWrapperEl) subnavWrapperEl.classList.toggle("tiene-desborde", hayDesborde);

      if (!hayDesborde) {
        subnavFlechaIzq.classList.remove("visible");
        subnavFlechaDer.classList.remove("visible");
        subnavContenedor.style.maskImage = "none";
        subnavContenedor.style.webkitMaskImage = "none";
        return;
      }

      const puedeIzquierda = subnavContenedor.scrollLeft > 2;
      const puedeDerecha = subnavContenedor.scrollLeft + subnavContenedor.clientWidth < subnavContenedor.scrollWidth - 2;
      subnavFlechaIzq.classList.toggle("visible", puedeIzquierda);
      subnavFlechaDer.classList.toggle("visible", puedeDerecha);

      const maxScrollLeft = subnavContenedor.scrollWidth - subnavContenedor.clientWidth;
      const gradiente = calcularDegradadoSubnav("to right", subnavContenedor.scrollLeft, maxScrollLeft) || "none";
      subnavContenedor.style.maskImage = gradiente;
      subnavContenedor.style.webkitMaskImage = gradiente;
    }

    subnavFlechaIzq.addEventListener("click", function () {
      subnavContenedor.scrollBy({ left: -150, behavior: "smooth" });
    });
    subnavFlechaDer.addEventListener("click", function () {
      subnavContenedor.scrollBy({ left: 150, behavior: "smooth" });
    });

    subnavContenedor.addEventListener("scroll", actualizarFlechasSubnav, { passive: true });
    window.addEventListener("resize", actualizarFlechasSubnav);
    actualizarFlechasSubnav();
    setTimeout(actualizarFlechasSubnav, 300);
  })();

  // =========================================================
  // EMPRESA — lectura real desde NODUS, sin endpoint de escritura
  // =========================================================

  let empresaCargada = false;

  function cargarEmpresa() {
    if (empresaCargada) return;
    nodusFetch("/config")
      .then(function (data) {
        empresaCargada = true;
        const empresa = data.empresa || {};
        setValor("config-campo-nombre", empresa.razon_social || empresa.nombre || "");
        setValor("config-campo-rif", empresa.rif || "");
        setValor("config-campo-telefono", empresa.telefono || "");
        setValor("config-campo-moneda", empresa.moneda || "");
        setValor("config-campo-direccion", empresa.direccion || "");

        const ticketNombre = document.getElementById("config-ticket-nombre");
        const ticketRif = document.getElementById("config-ticket-rif");
        if (ticketNombre) ticketNombre.textContent = empresa.nombre || empresa.razon_social || "—";
        if (ticketRif) ticketRif.textContent = empresa.rif || "—";

        const logoEstado = document.getElementById("config-empresa-logo-estado");
        if (logoEstado) logoEstado.textContent = empresa.tiene_logo ? "Logo cargado. Toca para cambiarlo" : "Toca para subir tu logo";
        const logoPh = document.querySelector(".config-ticket-logo-ph");
        if (logoPh) { logoPh.textContent = ""; if (empresa.logo_url) { const im = document.createElement("img"); im.src = empresa.logo_url; im.alt = "Logo"; logoPh.appendChild(im); } else { logoPh.textContent = "LOGO"; } }
      })
      .catch(function (err) {
        console.error("❌ [Hadeon Config] No se pudo leer /config:", err);
        const origen = document.getElementById("config-empresa-origen");
        if (origen) origen.textContent = "No se pudo leer NODUS — " + err.message;
        mostrarToast("No se pudo cargar los datos de la empresa: " + err.message, "error");
      });
  }

  function setValor(id, valor) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === "SELECT" && valor) {
      const opt = Array.from(el.options).find(function (o) {
        return o.value.toLowerCase() === String(valor).toLowerCase();
      });
      el.value = opt ? opt.value : valor;
    } else {
      el.value = valor;
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const btnGuardarEmpresa = document.getElementById("config-btn-guardar-empresa");
  if (btnGuardarEmpresa) {
    btnGuardarEmpresa.addEventListener("click", function () {
      nodusFetch("/config/empresa", { method: "POST", body: {
        razon_social: document.getElementById("config-campo-nombre").value, rif: document.getElementById("config-campo-rif").value,
        telefono: document.getElementById("config-campo-telefono").value, direccion: document.getElementById("config-campo-direccion").value } })
        .then(function () { empresaCargada = false; cargarEmpresa(); mostrarToast("Datos de la empresa guardados."); })
        .catch(function (err) { mostrarToast("No se pudo guardar: " + err.message, "error"); });
    });
  }

  // =========================================================
  // PUNTO DE VENTA — usa_propina / punto_unico reales
  // =========================================================

  // ===== Nodus: configuración compartida (propinas, mesas, estaciones) =====
  const CFG = { propinas: [5, 10, 15], mesas: [], estaciones: [] };

  function guardarCfg(parcial) {
    return nodusFetch("/config/negocio", { method: "POST", body: parcial })
      .catch(function (err) { mostrarToast("No se pudo guardar: " + err.message, "error"); });
  }

  function aplicarNegocio(negocio) {
    CFG.propinas = negocio.propinas || CFG.propinas;
    CFG.mesas = negocio.mesas || [];
    CFG.estaciones = negocio.estaciones || [];
    renderPropinas();
    renderMesasConfig();
    renderEstaciones();
  }

  let posCargado = false;

  // ---- Propinas sugeridas (porcentajes) -- sin endpoint propio en
  // NODUS, se guarda en localStorage y Punto de Venta lee esta misma
  // lista para armar los botones rápidos del Checkout. ----
  const PROPINAS_STORAGE_KEY = "hadeon_pos_propinas_pct";
  const PROPINAS_DEFAULT = [5, 10, 15];

  function leerPropinas() { return CFG.propinas.slice(); }

  function escribirPropinas(lista) { CFG.propinas = lista; guardarCfg({ propinas: lista }); }

  function renderPropinas() {
    const lista = document.getElementById("config-lista-propinas");
    if (!lista) return;
    const porcentajes = leerPropinas().slice().sort(function (a, b) { return a - b; });
    lista.innerHTML = "";
    porcentajes.forEach(function (pct) {
      const fila = document.createElement("div");
      fila.className = "config-lista-editable-item";
      const span = document.createElement("span");
      span.style.cssText = "flex:1;font-weight:600;padding:4px 0;";
      span.textContent = pct + "%";
      fila.appendChild(span);
      const grupo = document.createElement("div");
      grupo.className = "config-item-acciones";
      const btnEliminar = document.createElement("button");
      btnEliminar.className = "config-icon-btn peligro";
      btnEliminar.type = "button";
      btnEliminar.title = "Eliminar";
      btnEliminar.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"></path></svg>';
      btnEliminar.addEventListener("click", function () {
        const actuales = leerPropinas().filter(function (p) { return p !== pct; });
        escribirPropinas(actuales);
        renderPropinas();
        mostrarToast("Porcentaje eliminado.");
      });
      grupo.appendChild(btnEliminar);
      fila.appendChild(grupo);
      lista.appendChild(fila);
    });
  }

  const btnAgregarPropina = document.getElementById("config-btn-agregar-propina");
  if (btnAgregarPropina) {
    btnAgregarPropina.addEventListener("click", function () {
      const input = document.getElementById("config-nueva-propina-valor");
      const valor = parseFloat(input.value);
      if (isNaN(valor) || valor <= 0 || valor > 100) {
        mostrarToast("Ingresa un porcentaje válido (1-100).", "error");
        return;
      }
      const actuales = leerPropinas();
      if (actuales.indexOf(valor) !== -1) {
        mostrarToast("Ese porcentaje ya está en la lista.", "error");
        return;
      }
      actuales.push(valor);
      escribirPropinas(actuales);
      input.value = "";
      renderPropinas();
      mostrarToast('Porcentaje "' + valor + '%" agregado.');
    });
  }

  // ---- Mesas -- lista independiente, sin endpoint real de alta/baja
  // en NODUS todavía (las mesas reales son registros de Nodus, y
  // crear una acá no las crea allá). ----
  const MESAS_STORAGE_KEY = "hadeon_pos_mesas_config";
  const MESAS_DEFAULT = [
    { id: "mesa-1", nombre: "Mesa 1" },
    { id: "mesa-2", nombre: "Mesa 2" },
    { id: "mesa-3", nombre: "Mesa 3" },
  ];

  function leerMesasConfig() { return CFG.mesas.slice(); }

  function escribirMesasConfig(lista) { CFG.mesas = lista; guardarCfg({ mesas: lista }); }

  function idDesdeNombreMesa(nombre, existentes) {
    let base = nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "");
    if (!base) base = "mesa";
    let id = base;
    let sufijo = 2;
    while (existentes.some(function (m) { return m.id === id; })) {
      id = base + "-" + sufijo++;
    }
    return id;
  }

  function renderMesasConfig() {
    const lista = document.getElementById("config-lista-mesas");
    if (!lista) return;
    const mesas = leerMesasConfig();
    lista.innerHTML = "";
    mesas.forEach(function (mesa) {
      lista.appendChild(crearFilaEditableMock(
        mesa.nombre,
        function (nuevoNombre) {
          const actuales = leerMesasConfig();
          const item = actuales.find(function (m) { return m.id === mesa.id; });
          if (item) item.nombre = nuevoNombre;
          escribirMesasConfig(actuales);
          mostrarToast("Mesa actualizada.");
        },
        function () {
          const actuales = leerMesasConfig().filter(function (m) { return m.id !== mesa.id; });
          escribirMesasConfig(actuales);
          mostrarToast("Mesa eliminada.");
        }
      ));
    });
  }

  const btnAgregarMesa = document.getElementById("config-btn-agregar-mesa");
  if (btnAgregarMesa) {
    btnAgregarMesa.addEventListener("click", function () {
      const input = document.getElementById("config-nueva-mesa-nombre");
      const nombre = (input.value || "").trim();
      if (!nombre) return;
      const actuales = leerMesasConfig();
      if (actuales.some(function (m) { return m.nombre.toLowerCase() === nombre.toLowerCase(); })) {
        mostrarToast("Ya existe una mesa con ese nombre.", "error");
        return;
      }
      actuales.push({ id: idDesdeNombreMesa(nombre, actuales), nombre: nombre });
      escribirMesasConfig(actuales);
      input.value = "";
      renderMesasConfig();
      mostrarToast('Mesa "' + nombre + '" agregada.');
    });
  }

  function cargarPos() {
    if (posCargado) return;
    nodusFetch("/config")
      .then(function (data) {
        posCargado = true;
        const negocio = data.negocio || {};
        aplicarNegocio(negocio);
        const flagPropina = document.getElementById("config-flag-propina");
        const flagPuntoUnico = document.getElementById("config-flag-punto-unico");
        if (flagPropina) flagPropina.checked = !!negocio.usa_propina;
        if (flagPuntoUnico) flagPuntoUnico.checked = !!negocio.punto_unico;
        setValor("config-pos-moneda-mostrar", negocio.moneda_pos || "ambos");
      })
      .catch(function (err) {
        console.error("[Config] No se pudo leer /config (POS):", err);
        mostrarToast("No se pudieron cargar los parámetros de Punto de Venta: " + err.message, "error");
      });
  }

  const btnGuardarPos = document.getElementById("config-btn-guardar-pos");
  if (btnGuardarPos) {
    btnGuardarPos.addEventListener("click", function () {
      const usaPropina = document.getElementById("config-flag-propina").checked;
      const puntoUnico = document.getElementById("config-flag-punto-unico").checked;

      nodusFetch("/config/negocio", {
        method: "POST",
        body: { usa_propina: usaPropina, punto_unico: puntoUnico, moneda_pos: document.getElementById("config-pos-moneda-mostrar").value },
      })
        .then(function () {
          mostrarToast("Parámetros de Punto de Venta guardados.");
        })
        .catch(function (err) {
          console.error("❌ [Hadeon Config] No se pudo guardar /config/negocio:", err);
          mostrarToast("No se pudo guardar: " + err.message, "error");
        });
    });
  }

  // =========================================================
  // INVENTARIO — columnas de precio, umbral crítico, categorías
  // (todo real, mismos endpoints que usa el propio módulo de
  // Inventario).
  // =========================================================

  let inventarioCargado = false;

  function cargarInventario() {
    if (inventarioCargado) return;
    inventarioCargado = true;
    cargarColumnasPrecio();
    cargarUmbralCritico();
    cargarCategorias();
  }

  function cargarColumnasPrecio() {
    const lista = document.getElementById("config-lista-columnas-precio");
    if (!lista) return;
    hadeonFetch("/hadeon/api/precios/columnas")
      .then(function (columnas) {
        lista.innerHTML = "";
        columnas.forEach(function (columna) {
          lista.appendChild(crearFilaEditable(columna.id, columna.nombre, {
            renombrar: function (id, nombre) {
              return hadeonFetch("/hadeon/api/precios/columnas/" + id + "/renombrar", { method: "POST", body: { nombre: nombre } });
            },
            eliminar: function (id) {
              return hadeonFetch("/hadeon/api/precios/columnas/" + id + "/eliminar", { method: "POST" });
            },
          }));
        });
      })
      .catch(function (err) {
        console.error("❌ [Hadeon Config] No se pudieron cargar columnas de precio:", err);
        mostrarToast("No se pudieron cargar las columnas de precio: " + err.message, "error");
      });
  }

  const btnAgregarColumna = document.getElementById("config-btn-agregar-columna");
  if (btnAgregarColumna) {
    btnAgregarColumna.addEventListener("click", function () {
      const input = document.getElementById("config-nueva-columna-nombre");
      const nombre = (input.value || "").trim();
      if (!nombre) return;
      hadeonFetch("/hadeon/api/precios/columnas", { method: "POST", body: { nombre: nombre } })
        .then(function () {
          input.value = "";
          inventarioCargado = false;
          cargarColumnasPrecio();
          mostrarToast('Columna "' + nombre + '" agregada.');
        })
        .catch(function (err) {
          mostrarToast("No se pudo agregar la columna: " + err.message, "error");
        });
    });
  }

  function cargarUmbralCritico() {
    const input = document.getElementById("config-umbral-critico");
    if (!input) return;
    hadeonFetch("/hadeon/api/config/inventario")
      .then(function (data) {
        if (typeof data.umbralCritico === "number") input.value = data.umbralCritico;
      })
      .catch(function (err) {
        console.error("❌ [Hadeon Config] No se pudo cargar el umbral crítico:", err);
      });
  }

  const btnGuardarInventario = document.getElementById("config-btn-guardar-inventario");
  if (btnGuardarInventario) {
    btnGuardarInventario.addEventListener("click", function () {
      const input = document.getElementById("config-umbral-critico");
      const umbral = parseFloat(input.value);
      if (isNaN(umbral) || umbral < 1 || umbral > 99) {
        mostrarToast("El umbral debe estar entre 1 y 99.", "error");
        return;
      }
      hadeonFetch("/hadeon/api/config/inventario", { method: "POST", body: { umbralCritico: umbral } })
        .then(function () {
          mostrarToast("Umbral de alerta de stock guardado — ya se refleja en las Alertas de Inventario.");
        })
        .catch(function (err) {
          mostrarToast("No se pudo guardar el umbral: " + err.message, "error");
        });
    });
  }

  function cargarCategorias() {
    const tbody = document.querySelector("#config-tabla-categorias tbody");
    if (!tbody) return;
    hadeonFetch("/hadeon/api/inventario/categorias")
      .then(function (categorias) {
        tbody.innerHTML = "";
        categorias.forEach(function (categoria) {
          const fila = document.createElement("tr");

          const tdNombre = document.createElement("td");
          tdNombre.textContent = categoria.nombre;
          fila.appendChild(tdNombre);

          const tdCantidad = document.createElement("td");
          tdCantidad.textContent = categoria.cantidadProductos;
          fila.appendChild(tdCantidad);

          const tdAcciones = document.createElement("td");
          const grupo = document.createElement("div");
          grupo.className = "config-item-acciones";

          const btnRenombrar = document.createElement("button");
          btnRenombrar.className = "config-icon-btn";
          btnRenombrar.type = "button";
          btnRenombrar.title = "Renombrar";
          btnRenombrar.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
          btnRenombrar.addEventListener("click", function () {
            const nuevoNombre = window.prompt("Nuevo nombre para la categoría:", categoria.nombre);
            if (!nuevoNombre || !nuevoNombre.trim() || nuevoNombre.trim() === categoria.nombre) return;
            hadeonFetch("/hadeon/api/inventario/categorias/" + categoria.id + "/renombrar", {
              method: "POST", body: { nombre: nuevoNombre.trim() },
            })
              .then(function () {
                inventarioCargado = false;
                cargarCategorias();
                mostrarToast("Categoría renombrada.");
              })
              .catch(function (err) {
                mostrarToast("No se pudo renombrar: " + err.message, "error");
              });
          });
          grupo.appendChild(btnRenombrar);

          const btnEliminar = document.createElement("button");
          btnEliminar.className = "config-icon-btn peligro";
          btnEliminar.type = "button";
          btnEliminar.title = "Eliminar";
          btnEliminar.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"></path></svg>';
          btnEliminar.addEventListener("click", function () {
            if (!window.confirm('¿Eliminar la categoría "' + categoria.nombre + '"?')) return;
            hadeonFetch("/hadeon/api/inventario/categorias/" + categoria.id + "/eliminar", { method: "POST" })
              .then(function () {
                inventarioCargado = false;
                cargarCategorias();
                mostrarToast("Categoría eliminada.");
              })
              .catch(function (err) {
                mostrarToast(err.message, "error");
              });
          });
          grupo.appendChild(btnEliminar);

          tdAcciones.appendChild(grupo);
          fila.appendChild(tdAcciones);
          tbody.appendChild(fila);
        });
      })
      .catch(function (err) {
        console.error("❌ [Hadeon Config] No se pudieron cargar categorías:", err);
        mostrarToast("No se pudieron cargar las categorías: " + err.message, "error");
      });
  }

  function crearFilaEditable(id, nombre, acciones) {
    const fila = document.createElement("div");
    fila.className = "config-lista-editable-item";

    const input = document.createElement("input");
    input.type = "text";
    input.value = nombre;
    input.addEventListener("change", function () {
      const nuevoNombre = input.value.trim();
      if (!nuevoNombre || nuevoNombre === nombre) { input.value = nombre; return; }
      acciones.renombrar(id, nuevoNombre).then(function () {
        nombre = nuevoNombre;
        mostrarToast("Guardado.");
      }).catch(function (err) {
        input.value = nombre;
        mostrarToast("No se pudo renombrar: " + err.message, "error");
      });
    });
    fila.appendChild(input);

    const grupo = document.createElement("div");
    grupo.className = "config-item-acciones";

    const btnEliminar = document.createElement("button");
    btnEliminar.className = "config-icon-btn peligro";
    btnEliminar.type = "button";
    btnEliminar.title = "Eliminar";
    btnEliminar.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"></path></svg>';
    btnEliminar.addEventListener("click", function () {
      if (!window.confirm('¿Eliminar la columna "' + nombre + '"?')) return;
      acciones.eliminar(id).then(function () {
        fila.remove();
        mostrarToast("Columna eliminada.");
      }).catch(function (err) {
        mostrarToast("No se pudo eliminar: " + err.message, "error");
      });
    });
    grupo.appendChild(btnEliminar);
    fila.appendChild(grupo);

    return fila;
  }

  // =========================================================
  // USUARIOS — mock en memoria, sin backend todavía
  // =========================================================

  // Modelo real de roles de NODUS (nodus_core/security/nodus_security.xml):
  // un único rol por usuario, no uno por módulo. Dos cadenas que llegan a
  // admin, no una sola lineal: cajero ⊂ supervisor ⊂ admin, y por separado
  // contador ⊂ admin (contador no implica cajero/supervisor).
  // Alineado al contrato real documentado en docs/api_endpoints.md
  // (sección "Usuarios", rol admin) del repo de nodus:
  //   GET /usuarios              -> {usuarios:[{id,nombre,login,rol,activo,ultimo_acceso,roles}], cupo:{usados,maximo}}
  //   POST /usuarios             -> body {nombre,correo,rol}
  //   POST /usuarios/<id>/rol    -> body {rol}       (errores: ROL_INVALIDO, ULTIMO_ADMIN, AUTO_DEGRADACION, NO_ENCONTRADO)
  //   POST /usuarios/<id>/estado -> body {activo}    (errores: LIMITE_USUARIOS, ULTIMO_ADMIN, AUTO_DESACTIVACION, NO_ENCONTRADO)
  //   POST /usuarios/<id>/invitacion -> sin body     (errores: NO_ENCONTRADO; solo aplica a usuarios activos)
  // Cada acción es individual -- no existe un "guardar todo junto".
  let USUARIOS_MOCK = [];

  // Cupo del plan (nodus.max_users) -- "usados" sale de contar activos.
  let CUPO_USUARIOS_MOCK = { maximo: 8 };

  const ROLES_NODUS = { admin: "Administrador de la empresa", supervisor: "Supervisor", contador: "Contador", cajero: "Cajero", mesero: "Mesero" };

  function colorAvatar(nombre) {
    const colores = ["#eef2ff;color:#0047ab", "#fef3e2;color:#b8860b", "#ecfdf5;color:#059669", "#fde8e8;color:#dc2626"];
    const indice = nombre.charCodeAt(0) % colores.length;
    return colores[indice];
  }

  function iniciales(nombre) {
    return nombre.split(" ").map(function (p) { return p[0]; }).slice(0, 2).join("").toUpperCase();
  }

  function cantidadAdminsActivos() {
    return USUARIOS_MOCK.filter(function (u) { return u.rol === "admin" && u.activo; }).length;
  }

  function usuariosActivosCount() {
    return USUARIOS_MOCK.filter(function (u) { return u.activo; }).length;
  }

  function actualizarCupoUsuarios() {
    const span = document.getElementById("config-usuarios-cupo");
    if (span) span.textContent = usuariosActivosCount() + " / " + CUPO_USUARIOS_MOCK.maximo + " usuarios";
    const badge = document.getElementById("config-badge-usuarios");
    if (badge) badge.textContent = USUARIOS_MOCK.length;
  }

  function renderUsuarios(filtro, busqueda) {
    const tbody = document.querySelector("#config-tabla-usuarios tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    USUARIOS_MOCK
      .filter(function (u) {
        if (filtro === "activos" && !u.activo) return false;
        if (filtro === "desactivados" && u.activo) return false;
        if (busqueda) {
          const texto = (u.nombre + " " + u.login).toLowerCase();
          if (texto.indexOf(busqueda.toLowerCase()) === -1) return false;
        }
        return true;
      })
      .forEach(function (usuario) {
        const fila = document.createElement("tr");

        const tdUsuario = document.createElement("td");
        tdUsuario.innerHTML =
          '<div class="config-usuario-cell">' +
          '<div class="config-avatar" style="background:' + colorAvatar(usuario.nombre).split(";")[0] + ';color:' + colorAvatar(usuario.nombre).split(";")[1] + '">' + iniciales(usuario.nombre) + "</div>" +
          '<div><div class="config-usuario-nombre">' + usuario.nombre +
          (usuario.esTuUsuario ? ' <span class="config-badge propietario">Tú</span>' : "") +
          (usuario.activo ? ' <span class="config-badge activo">Activo</span>' : ' <span class="config-badge inactivo">Desactivado</span>') +
          "</div>" +
          '<div class="config-usuario-email">' + usuario.login + "</div></div></div>";
        fila.appendChild(tdUsuario);

        // Ayuda visual únicamente (la regla real la aplica el servidor):
        // no dejar que el único admin activo se quite su propio rol o se
        // desactive, para no dejar el negocio sin administrador.
        const esUltimoAdminActivoPropio = usuario.esTuUsuario && usuario.rol === "admin" && usuario.activo && cantidadAdminsActivos() === 1;

        const tdRol = document.createElement("td");
        const select = document.createElement("select");
        Object.keys(ROLES_NODUS).forEach(function (clave) {
          const opt = document.createElement("option");
          opt.value = clave;
          opt.textContent = ROLES_NODUS[clave];
          if (usuario.rol === clave) opt.selected = true;
          select.appendChild(opt);
        });
        select.addEventListener("change", function () {
          // Simula POST /usuarios/<id>/rol.
          if (usuario.esTuUsuario && usuario.rol === "admin" && select.value !== "admin" && cantidadAdminsActivos() === 1) {
            select.value = "admin";
            mostrarToast("No puedes quitarte tu propio rol de Administrador.", "error");
            return;
          }
          nodusFetch("/usuarios/" + usuario.id + "/rol", { method: "POST", body: { rol: select.value } })
            .then(cargarUsuarios)
            .catch(function (err) { mostrarToast(err.message, "error"); cargarUsuarios(); });
        });
        tdRol.appendChild(select);
        if (esUltimoAdminActivoPropio) {
          // Se deja como <select> nativo deshabilitado -- hadeonCrearDropdown
          // no sabe respetar "disabled" en el panel flotante, así que
          // envolverlo acá dejaría el botón igual de clickeable.
          select.disabled = true;
          select.title = "No puedes quitarte tu propio rol de Administrador — el negocio se quedaría sin ningún admin.";
        } else {
          hadeonCrearDropdown(select);
        }
        fila.appendChild(tdRol);

        const tdEstado = document.createElement("td");
        const wrapAcciones = document.createElement("div");
        wrapAcciones.style.cssText = "display:flex;align-items:center;gap:4px;";

        const btnEstado = document.createElement("button");
        btnEstado.type = "button";
        btnEstado.className = "config-btn-outline";
        btnEstado.style.cssText = "padding:6px 12px;font-size:11.5px;flex:1;justify-content:center;";
        btnEstado.innerHTML = usuario.activo
          ? '<svg width="13" height="13" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.5 15C6.4625 15 5.4875 14.8031 4.575 14.4094C3.6625 14.0156 2.86875 13.4812 2.19375 12.8062C1.51875 12.1312 0.984375 11.3375 0.590625 10.425C0.196875 9.5125 0 8.5375 0 7.5C0 6.4625 0.196875 5.4875 0.590625 4.575C0.984375 3.6625 1.51875 2.86875 2.19375 2.19375C2.86875 1.51875 3.6625 0.984375 4.575 0.590625C5.4875 0.196875 6.4625 0 7.5 0C8.5375 0 9.5125 0.196875 10.425 0.590625C11.3375 0.984375 12.1312 1.51875 12.8062 2.19375C13.4812 2.86875 14.0156 3.6625 14.4094 4.575C14.8031 5.4875 15 6.4625 15 7.5C15 8.5375 14.8031 9.5125 14.4094 10.425C14.0156 11.3375 13.4812 12.1312 12.8062 12.8062C12.1312 13.4812 11.3375 14.0156 10.425 14.4094C9.5125 14.8031 8.5375 15 7.5 15V15M7.5 13.5C8.175 13.5 8.825 13.3906 9.45 13.1719C10.075 12.9531 10.65 12.6375 11.175 12.225L2.775 3.825C2.3625 4.35 2.04688 4.925 1.82812 5.55C1.60938 6.175 1.5 6.825 1.5 7.5C1.5 9.175 2.08125 10.5938 3.24375 11.7563C4.40625 12.9188 5.825 13.5 7.5 13.5V13.5M12.225 11.175C12.6375 10.65 12.9531 10.075 13.1719 9.45C13.3906 8.825 13.5 8.175 13.5 7.5C13.5 5.825 12.9188 4.40625 11.7563 3.24375C10.5938 2.08125 9.175 1.5 7.5 1.5C6.825 1.5 6.175 1.60938 5.55 1.82812C4.925 2.04688 4.35 2.3625 3.825 2.775L12.225 11.175V11.175M7.5 7.5V7.5V7.5V7.5V7.5V7.5V7.5V7.5V7.5V7.5" fill="currentColor"></path></svg> Desactivar'
          : '<svg width="13" height="13" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.45 10.95L11.7375 5.6625L10.6875 4.6125L6.45 8.85L4.3125 6.7125L3.2625 7.7625L6.45 10.95ZM7.5 15C6.4625 15 5.4875 14.8031 4.575 14.4094C3.6625 14.0156 2.86875 13.4812 2.19375 12.8062C1.51875 12.1312 0.984375 11.3375 0.590625 10.425C0.196875 9.5125 0 8.5375 0 7.5C0 6.4625 0.196875 5.4875 0.590625 4.575C0.984375 3.6625 1.51875 2.86875 2.19375 2.19375C2.86875 1.51875 3.6625 0.984375 4.575 0.590625C5.4875 0.196875 6.4625 0 7.5 0C8.5375 0 9.5125 0.196875 10.425 0.590625C11.3375 0.984375 12.1312 1.51875 12.8062 2.19375C13.4812 2.86875 14.0156 3.6625 14.4094 4.575C14.8031 5.4875 15 6.4625 15 7.5C15 8.5375 14.8031 9.5125 14.4094 10.425C14.0156 11.3375 13.4812 12.1312 12.8062 12.8062C12.1312 13.4812 11.3375 14.0156 10.425 14.4094C9.5125 14.8031 8.5375 15 7.5 15ZM7.5 13.5C9.175 13.5 10.5938 12.9188 11.7563 11.7563C12.9188 10.5938 13.5 9.175 13.5 7.5C13.5 5.825 12.9188 4.40625 11.7563 3.24375C10.5938 2.08125 9.175 1.5 7.5 1.5C5.825 1.5 4.40625 2.08125 3.24375 3.24375C2.08125 4.40625 1.5 5.825 1.5 7.5C1.5 9.175 2.08125 10.5938 3.24375 11.7563C4.40625 12.9188 5.825 13.5 7.5 13.5Z" fill="currentColor"></path></svg> Activar';
        if (esUltimoAdminActivoPropio) {
          btnEstado.disabled = true;
          btnEstado.style.opacity = "0.5";
          btnEstado.style.cursor = "not-allowed";
          btnEstado.title = "No puedes desactivar tu propia cuenta de Administrador.";
        }
        btnEstado.addEventListener("click", function () {
          // Simula POST /usuarios/<id>/estado.
          if (usuario.esTuUsuario && usuario.activo) {
            mostrarToast("No puedes desactivar tu propia cuenta.", "error");
            return;
          }
          if (usuario.activo && usuario.rol === "admin" && cantidadAdminsActivos() === 1) {
            mostrarToast("No se puede desactivar al único administrador activo.", "error");
            return;
          }
          if (!usuario.activo && usuariosActivosCount() >= CUPO_USUARIOS_MOCK.maximo) {
            mostrarToast("No hay cupo disponible para reactivar este usuario.", "error");
            return;
          }
          nodusFetch("/usuarios/" + usuario.id + "/estado", { method: "POST", body: { activo: !usuario.activo } })
            .then(cargarUsuarios)
            .catch(function (err) { mostrarToast(err.message, "error"); cargarUsuarios(); });
        });
        wrapAcciones.appendChild(btnEstado);

        // Solo aplica a usuarios activos -- el contrato real
        // (POST /usuarios/<id>/invitacion) responde NO_ENCONTRADO para
        // usuarios inactivos, técnicos o de portal.
        if (usuario.activo) {
          const btnReenviar = document.createElement("button");
          btnReenviar.type = "button";
          btnReenviar.className = "config-icon-btn";
          btnReenviar.title = "Reenviar invitación";
          btnReenviar.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
          btnReenviar.addEventListener("click", function () {
            // Simula POST /usuarios/<id>/invitacion -- sin body.
            nodusFetch("/usuarios/" + usuario.id + "/invitacion", { method: "POST" })
              .then(function () { mostrarToast('Invitación reenviada a "' + usuario.login + '".', "info"); })
              .catch(function (err) { mostrarToast(err.message, "error"); });
          });
          wrapAcciones.appendChild(btnReenviar);
        }

        tdEstado.appendChild(wrapAcciones);
        fila.appendChild(tdEstado);

        tbody.appendChild(fila);
      });

    actualizarCupoUsuarios();
  }

  const buscadorUsuarios = document.getElementById("config-usuarios-buscar");
  const filtrosUsuarios = document.getElementById("config-usuarios-filtros");
  let filtroUsuarioActivo = "todos";

  if (filtrosUsuarios) {
    filtrosUsuarios.querySelectorAll(".config-filtro-pill").forEach(function (pill) {
      pill.addEventListener("click", function () {
        filtrosUsuarios.querySelectorAll(".config-filtro-pill").forEach(function (p) { p.classList.remove("activo"); });
        pill.classList.add("activo");
        filtroUsuarioActivo = pill.getAttribute("data-filtro");
        renderUsuarios(filtroUsuarioActivo, buscadorUsuarios ? buscadorUsuarios.value : "");
      });
    });
  }
  if (buscadorUsuarios) {
    buscadorUsuarios.addEventListener("input", function () {
      renderUsuarios(filtroUsuarioActivo, buscadorUsuarios.value);
    });
  }

  // ---------------- Modal "Invitar usuario" ----------------
  const overlayInvitar = document.getElementById("config-overlay-invitar");
  const selectInvitarRol = document.getElementById("config-invitar-rol");
  if (selectInvitarRol) hadeonCrearDropdown(selectInvitarRol);

  function abrirModalInvitar() {
    document.getElementById("config-invitar-nombre").value = "";
    document.getElementById("config-invitar-nombre").style.borderColor = "";
    document.getElementById("config-invitar-email").value = "";
    document.getElementById("config-invitar-email").style.borderColor = "";
    selectInvitarRol.value = "cajero";
    selectInvitarRol.dispatchEvent(new Event("change"));
    overlayInvitar.classList.add("activo");
  }
  function cerrarModalInvitar() {
    overlayInvitar.classList.remove("activo");
  }

  const btnInvitarUsuario = document.getElementById("config-btn-invitar-usuario");
  if (btnInvitarUsuario) {
    btnInvitarUsuario.addEventListener("click", abrirModalInvitar);
  }
  const btnInvitarCerrar = document.getElementById("config-invitar-cerrar");
  if (btnInvitarCerrar) btnInvitarCerrar.addEventListener("click", cerrarModalInvitar);
  const btnInvitarCancelar = document.getElementById("config-invitar-cancelar");
  if (btnInvitarCancelar) btnInvitarCancelar.addEventListener("click", cerrarModalInvitar);
  if (overlayInvitar) {
    overlayInvitar.addEventListener("click", function (e) {
      if (e.target === overlayInvitar) cerrarModalInvitar();
    });
  }

  const btnConfirmarInvitar = document.getElementById("config-btn-confirmar-invitar");
  if (btnConfirmarInvitar) {
    btnConfirmarInvitar.addEventListener("click", function () {
      // Simula POST /usuarios -- body {nombre, correo, rol}.
      const inputNombre = document.getElementById("config-invitar-nombre");
      const inputEmail = document.getElementById("config-invitar-email");
      const nombre = inputNombre.value.trim();
      const correo = inputEmail.value.trim();
      const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);

      inputNombre.style.borderColor = nombre ? "" : "#dc2626";
      inputEmail.style.borderColor = correoValido ? "" : "#dc2626";
      if (!nombre || !correoValido) return;

      nodusFetch("/usuarios", { method: "POST", body: { nombre: nombre, correo: correo, rol: selectInvitarRol.value } })
        .then(function () {
          cerrarModalInvitar();
          mostrarToast('Invitación creada para "' + nombre + '".', "info");
          return cargarUsuarios();
        })
        .catch(function (err) { mostrarToast(err.message, "error"); });
    });
  }

  function cargarUsuarios() {
    return nodusFetch("/usuarios").then(function (d) {
      USUARIOS_MOCK = d.usuarios || [];
      CUPO_USUARIOS_MOCK = { maximo: (d.cupo && d.cupo.maximo) || 8 };
      renderUsuarios(filtroUsuarioActivo, buscadorUsuarios ? buscadorUsuarios.value : "");
    }).catch(function (err) { mostrarToast("No se pudieron cargar los usuarios: " + err.message, "error"); });
  }

  // =========================================================
  // CONTABILIDAD — mock en memoria, sin backend todavía
  // =========================================================

  let DIARIOS = [];

  function crearFilaEditableMock(nombre, onRenombrar, onEliminar) {
    const fila = document.createElement("div");
    fila.className = "config-lista-editable-item";

    const input = document.createElement("input");
    input.type = "text";
    input.value = nombre;
    input.addEventListener("change", function () {
      const nuevoNombre = input.value.trim();
      if (!nuevoNombre) { input.value = nombre; return; }
      onRenombrar(nuevoNombre);
      mostrarToast("Guardado.");
    });
    fila.appendChild(input);

    const grupo = document.createElement("div");
    grupo.className = "config-item-acciones";
    const btnEliminar = document.createElement("button");
    btnEliminar.className = "config-icon-btn peligro";
    btnEliminar.type = "button";
    btnEliminar.title = "Eliminar";
    btnEliminar.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"></path></svg>';
    btnEliminar.addEventListener("click", function () {
      onEliminar();
      fila.remove();
    });
    grupo.appendChild(btnEliminar);
    fila.appendChild(grupo);

    return fila;
  }

  function renderDiarios() {
    const lista = document.getElementById("config-lista-diarios");
    if (!lista) return;
    lista.innerHTML = "";
    DIARIOS.forEach(function (diario) {
      lista.appendChild(crearFilaEditableMock(
        diario.nombre,
        function (nuevo) {
          nodusFetch("/diarios/" + diario.id + "/renombrar", { method: "POST", body: { nombre: nuevo } })
            .catch(function (err) { mostrarToast(err.message, "error"); cargarContabilidad(); });
        },
        function () {
          nodusFetch("/diarios/" + diario.id + "/eliminar", { method: "POST" })
            .then(function (r) { if (r.archivado) mostrarToast("Tiene movimientos: quedó archivado en vez de borrarse.", "info"); })
            .catch(function (err) { mostrarToast(err.message, "error"); cargarContabilidad(); });
        }
      ));
    });
  }
  const btnAgregarDiario = document.getElementById("config-btn-agregar-diario");
  if (btnAgregarDiario) {
    btnAgregarDiario.addEventListener("click", function () {
      const input = document.getElementById("config-nuevo-diario-nombre");
      const nombre = (input.value || "").trim();
      if (!nombre) return;
      nodusFetch("/diarios", { method: "POST", body: { nombre: nombre } })
        .then(function () { input.value = ""; mostrarToast('Diario "' + nombre + '" agregado.'); return cargarContabilidad(); })
        .catch(function (err) { mostrarToast(err.message, "error"); });
    });
  }

  // =========================================================
  // COMANDAS — sin backend propio en Nodus, pero a diferencia de
  // Usuarios/Contabilidad SÍ persiste de verdad: se guarda en
  // localStorage (mismo origen que el módulo de Comandas), así que
  // agregar/renombrar/eliminar una estación acá se refleja al
  // instante en el filtro de Estación de esa página.
  // =========================================================

  const ESTACIONES_STORAGE_KEY = "hadeon_comandas_estaciones";
  const ESTACIONES_DEFAULT = [
    { id: "cocina", nombre: "Cocina" },
    { id: "barra", nombre: "Barra" },
    { id: "parrilla", nombre: "Parrilla" },
  ];

  function leerEstaciones() { return CFG.estaciones.slice(); }

  function escribirEstaciones(lista) { CFG.estaciones = lista; guardarCfg({ estaciones: lista }); }

  function idDesdeNombre(nombre, existentes) {
    let base = nombre
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-+|-+$)/g, "");
    if (!base) base = "estacion";
    let id = base;
    let sufijo = 2;
    while (existentes.some(function (e) { return e.id === id; })) {
      id = base + "-" + sufijo++;
    }
    return id;
  }

  function renderEstaciones() {
    const lista = document.getElementById("config-lista-estaciones");
    if (!lista) return;
    const estaciones = leerEstaciones();
    lista.innerHTML = "";
    estaciones.forEach(function (estacion) {
      lista.appendChild(crearFilaEditableMock(
        estacion.nombre,
        function (nuevoNombre) {
          const actuales = leerEstaciones();
          const item = actuales.find(function (e) { return e.id === estacion.id; });
          if (item) item.nombre = nuevoNombre;
          escribirEstaciones(actuales);
          mostrarToast("Estación actualizada.");
        },
        function () {
          const actuales = leerEstaciones().filter(function (e) { return e.id !== estacion.id; });
          escribirEstaciones(actuales);
          mostrarToast("Estación eliminada.");
        }
      ));
    });
  }
  renderEstaciones();

  const btnAgregarEstacion = document.getElementById("config-btn-agregar-estacion");
  if (btnAgregarEstacion) {
    btnAgregarEstacion.addEventListener("click", function () {
      const input = document.getElementById("config-nueva-estacion-nombre");
      const nombre = (input.value || "").trim();
      if (!nombre) return;
      const actuales = leerEstaciones();
      if (actuales.some(function (e) { return e.nombre.toLowerCase() === nombre.toLowerCase(); })) {
        mostrarToast("Ya existe una estación con ese nombre.", "error");
        return;
      }
      actuales.push({ id: idDesdeNombre(nombre, actuales), nombre: nombre });
      escribirEstaciones(actuales);
      input.value = "";
      renderEstaciones();
      mostrarToast('Estación "' + nombre + '" agregada.');
    });
  }

  const btnDescargarPlantilla = document.getElementById("config-btn-descargar-plantilla");
  if (btnDescargarPlantilla) {
    btnDescargarPlantilla.addEventListener("click", function () {
      const csv = "\ufeffcodigo,nombre,tipo\r\n101000,Caja General,Banco\r\n102000,Cuentas por Cobrar,Por cobrar\r\n201000,Cuentas por Pagar,Por pagar\r\n301000,Capital Social,Patrimonio\r\n401000,Ventas,Ingreso\r\n501000,Costo de Ventas,Costo\r\n601000,Gastos Administrativos,Gasto\r\n";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      a.download = "plantilla-plan-de-cuentas.csv";
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    });
  }
  const btnRestablecerPlan = document.getElementById("config-btn-restablecer-plan");
  if (btnRestablecerPlan) {
    btnRestablecerPlan.addEventListener("click", function () {
      mostrarToast("El plan de cuentas por defecto de Nodus ya está activo.", "info");
    });
  }

  const btnGuardarContabilidad = document.getElementById("config-btn-guardar-contabilidad");
  if (btnGuardarContabilidad) {
    btnGuardarContabilidad.addEventListener("click", function () {
      nodusFetch("/contabilidad", { method: "POST", body: { umbral_dias: document.getElementById("config-conta-umbral-dias").value, mes_fiscal: document.getElementById("config-conta-mes-fiscal").value } })
        .then(function () { mostrarToast("Parámetros de Contabilidad guardados."); })
        .catch(function (err) { mostrarToast("No se pudo guardar: " + err.message, "error"); });
    });
  }


  // =========================================================
  // NODUS: logo, plan de cuentas, contabilidad y facturación
  // =========================================================
  function elemento(tag, clase, texto) {
    const e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  function leerArchivo(accept, alElegir) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", function () { if (input.files && input.files[0]) alElegir(input.files[0]); });
    input.click();
  }

  // ---- Logo de la empresa ----
  const dropLogo = document.getElementById("config-dropzone-logo");
  if (dropLogo) {
    dropLogo.addEventListener("click", function () {
      leerArchivo("image/png,image/jpeg,image/webp", function (archivo) {
        if (archivo.size > 2 * 1024 * 1024) { mostrarToast("El logo pesa más de 2 MB. Usa una imagen más liviana.", "error"); return; }
        const lector = new FileReader();
        lector.onload = function () {
          const base64 = String(lector.result).split(",")[1];
          nodusFetch("/config/empresa", { method: "POST", body: { logo: base64 } })
            .then(function () { empresaCargada = false; cargarEmpresa(); mostrarToast("Logo guardado."); })
            .catch(function (err) { mostrarToast("No se pudo guardar el logo: " + err.message, "error"); });
        };
        lector.readAsDataURL(archivo);
      });
    });
  }

  // ---- Contabilidad: diarios, umbral, mes fiscal, plan de cuentas ----
  function cargarContabilidad() {
    return nodusFetch("/contabilidad").then(function (d) {
      DIARIOS = d.diarios || [];
      renderDiarios();
      const dias = document.getElementById("config-conta-umbral-dias");
      if (dias) dias.value = d.umbral_dias;
      setValor("config-conta-mes-fiscal", String(d.mes_fiscal));
      const chip = document.getElementById("config-plan-cuentas-estado");
      if (chip) chip.textContent = d.num_cuentas + " cuentas en el plan";
    }).catch(function (err) { mostrarToast("No se pudo cargar Contabilidad: " + err.message, "error"); });
  }

  function partirCSV(linea, sep) {
    const celdas = [];
    let actual = "", entreComillas = false;
    for (let i = 0; i < linea.length; i++) {
      const c = linea[i];
      if (c === '"') { if (entreComillas && linea[i + 1] === '"') { actual += '"'; i++; } else { entreComillas = !entreComillas; } }
      else if (c === sep && !entreComillas) { celdas.push(actual.trim()); actual = ""; }
      else { actual += c; }
    }
    celdas.push(actual.trim());
    return celdas;
  }

  const dropPlan = document.getElementById("config-dropzone-plan");
  if (dropPlan) {
    dropPlan.addEventListener("click", function () {
      leerArchivo(".csv,text/csv", function (archivo) {
        archivo.text().then(function (texto) {
          const lineas = texto.replace(/^﻿/, "").split(/\r?\n/).filter(function (l) { return l.trim(); });
          if (lineas.length < 2) { mostrarToast("El archivo no tiene filas para cargar.", "error"); return; }
          const sep = (lineas[0].match(/;/g) || []).length > (lineas[0].match(/,/g) || []).length ? ";" : ",";
          const filas = lineas.slice(1).map(function (l) { const c = partirCSV(l, sep); return { codigo: c[0], nombre: c[1], tipo: c[2] }; });
          nodusFetch("/plan-cuentas", { method: "POST", body: { filas: filas } })
            .then(function (r) {
              mostrarToast(r.creadas + " cuentas creadas y " + r.actualizadas + " actualizadas." + (r.errores.length ? " Hubo " + r.errores.length + " filas con error." : ""), r.errores.length ? "info" : undefined);
              if (r.errores.length) window.alert("Filas con problema:\n\n" + r.errores.join("\n"));
              return cargarContabilidad();
            })
            .catch(function (err) { mostrarToast("No se pudo cargar el plan: " + err.message, "error"); });
        });
      });
    });
  }

  // ---- Facturación y pagos ----
  const TIPO_IMPUESTO = { sale: "Ventas", purchase: "Compras" };
  let facturacionCargada = false;

  function cargarFacturacion() {
    cargarPagos();
    cargarImpuestos();
    cargarFiscal();
  }

  // Muestra a qué cuenta entra cada método (hay varios con el mismo nombre, p. ej. "Efectivo" por sucursal)
  function agregarPago(lista, m, fila) {
    const info = elemento("span", "", (m.tipo === "cash" ? "Caja" : "Banco") + (m.diario ? " · " + m.diario : ""));
    info.style.cssText = "font-size:11.5px;color:#6b7280;white-space:nowrap;margin-right:8px;";
    if (m.hka_codigo !== undefined) {
      const cod = elemento("input", "nodus-input-mini");
      cod.type = "text"; cod.maxLength = 2; cod.placeholder = "01"; cod.value = m.hka_codigo;
      cod.title = "Número del medio de pago en la máquina fiscal (01 a 19)";
      cod.style.cssText = "width:54px !important;margin-right:8px;";
      cod.addEventListener("change", function () {
        nodusFetch("/pagos/" + m.id + "/hka", { method: "POST", body: { codigo: cod.value } })
          .then(function () { mostrarToast("Código de la máquina fiscal guardado."); })
          .catch(function (err) { mostrarToast(err.message, "error"); cargarPagos(); });
      });
      fila.insertBefore(cod, fila.lastChild);
    }
    fila.insertBefore(info, fila.lastChild);
    lista.appendChild(fila);
  }

  function cargarPagos() {
    return nodusFetch("/pagos").then(function (d) {
      const lista = document.getElementById("config-lista-pagos");
      if (lista) {
        lista.innerHTML = "";
        (d.metodos || []).filter(function (m) { return m.activo; }).forEach(function (m) {
          agregarPago(lista, m, crearFilaEditableMock(
            m.nombre,
            function (nuevo) { nodusFetch("/pagos/" + m.id + "/renombrar", { method: "POST", body: { nombre: nuevo } }).catch(function (err) { mostrarToast(err.message, "error"); cargarPagos(); }); },
            function () {
              nodusFetch("/pagos/" + m.id + "/eliminar", { method: "POST" })
                .then(function (r) { if (r.archivado) mostrarToast("Ya tiene ventas registradas: quedó desactivado.", "info"); })
                .catch(function (err) { mostrarToast(err.message, "error"); cargarPagos(); });
            }
          ));
        });
      }
      const sel = document.getElementById("config-nuevo-pago-diario");
      if (sel) {
        sel.innerHTML = "";
        (d.diarios || []).forEach(function (j) {
          const o = elemento("option", "", j.nombre + (j.tipo === "cash" ? " (caja)" : " (banco)"));
          o.value = j.id;
          sel.appendChild(o);
        });
      }
    }).catch(function (err) { mostrarToast("No se pudieron cargar los métodos de pago: " + err.message, "error"); });
  }

  const btnAgregarPago = document.getElementById("config-btn-agregar-pago");
  if (btnAgregarPago) {
    btnAgregarPago.addEventListener("click", function () {
      const input = document.getElementById("config-nuevo-pago-nombre");
      const nombre = (input.value || "").trim();
      if (!nombre) return;
      nodusFetch("/pagos", { method: "POST", body: { nombre: nombre, diarioId: document.getElementById("config-nuevo-pago-diario").value } })
        .then(function () { input.value = ""; mostrarToast('Método "' + nombre + '" agregado.'); return cargarPagos(); })
        .catch(function (err) { mostrarToast(err.message, "error"); });
    });
  }

  function cargarImpuestos() {
    return nodusFetch("/impuestos").then(function (d) {
      const tbody = document.querySelector("#config-tabla-impuestos tbody");
      if (!tbody) return;
      tbody.innerHTML = "";
      (d.impuestos || []).forEach(function (t) {
        const tr = document.createElement("tr");
        tr.appendChild(elemento("td", "", t.nombre));
        tr.appendChild(elemento("td", "", TIPO_IMPUESTO[t.tipo] || t.tipo));
        const tdMonto = document.createElement("td");
        const input = elemento("input", "nodus-input-mini");
        input.type = "number"; input.step = "0.01"; input.min = "0"; input.max = "100"; input.value = t.monto;
        input.addEventListener("change", function () {
          nodusFetch("/impuestos/" + t.id, { method: "POST", body: { monto: input.value } })
            .then(function () { mostrarToast("Porcentaje guardado."); })
            .catch(function (err) { mostrarToast(err.message, "error"); cargarImpuestos(); });
        });
        tdMonto.appendChild(input);
        tdMonto.appendChild(elemento("span", "", " %"));
        tr.appendChild(tdMonto);
        const tdAcc = document.createElement("td");
        const btn = elemento("button", "config-btn-outline", t.activo ? "Desactivar" : "Activar");
        btn.type = "button";
        btn.style.cssText = "padding:6px 12px;font-size:11.5px;";
        btn.addEventListener("click", function () {
          nodusFetch("/impuestos/" + t.id, { method: "POST", body: { activo: !t.activo } })
            .then(cargarImpuestos).catch(function (err) { mostrarToast(err.message, "error"); });
        });
        tdAcc.appendChild(btn);
        tr.appendChild(tdAcc);
        if (!t.activo) tr.style.opacity = ".55";
        tbody.appendChild(tr);
      });
    }).catch(function (err) { mostrarToast("No se pudieron cargar los impuestos: " + err.message, "error"); });
  }

  const btnAgregarImpuesto = document.getElementById("config-btn-agregar-impuesto");
  if (btnAgregarImpuesto) {
    btnAgregarImpuesto.addEventListener("click", function () {
      const nombre = document.getElementById("config-nuevo-impuesto-nombre").value.trim();
      const monto = document.getElementById("config-nuevo-impuesto-monto").value;
      if (!nombre || monto === "") { mostrarToast("Escribe el nombre y el porcentaje.", "error"); return; }
      nodusFetch("/impuestos", { method: "POST", body: { nombre: nombre, monto: monto, tipo: document.getElementById("config-nuevo-impuesto-tipo").value } })
        .then(function () {
          document.getElementById("config-nuevo-impuesto-nombre").value = "";
          document.getElementById("config-nuevo-impuesto-monto").value = "";
          mostrarToast('Impuesto "' + nombre + '" agregado.');
          return cargarImpuestos();
        })
        .catch(function (err) { mostrarToast(err.message, "error"); });
    });
  }

  function etiquetaCampo(texto, control) {
    const w = elemento("label", "nodus-etiqueta");
    w.appendChild(elemento("span", "", texto));
    w.appendChild(control);
    return w;
  }

  function campoNum(valor, paso) {
    const i = elemento("input", "nodus-input-mini");
    i.type = "number"; i.step = paso || "0.01"; i.value = valor;
    return i;
  }

  function selectOpciones(opciones, valor, textoVacio) {
    const s = elemento("select", "nodus-select-cfg");
    if (textoVacio !== undefined) { const v = elemento("option", "", textoVacio); v.value = "0"; s.appendChild(v); }
    opciones.forEach(function (o) { const op = elemento("option", "", o.nombre); op.value = o.id; s.appendChild(op); });
    s.value = String(valor);
    return s;
  }

  function cargarFiscal() {
    return nodusFetch("/fiscal").then(function (d) {
      const num = document.getElementById("config-lista-numeracion");
      if (num) {
        num.innerHTML = "";
        (d.numeracion || []).forEach(function (j) {
          const fila = elemento("div", "nodus-fila-info");
          const izq = document.createElement("div");
          izq.appendChild(document.createTextNode(j.nombre));
          izq.appendChild(elemento("small", "", (j.tipo === "sale" ? "Documentos de venta" : "Documentos de compra") + " · prefijo " + j.codigo));
          fila.appendChild(izq);
          fila.appendChild(elemento("strong", "", "Último: " + j.ultima));
          num.appendChild(fila);
        });
      }
      const caja = document.getElementById("config-hka");
      if (!caja) return;
      caja.innerHTML = "";
      const hka = d.hka || {};
      if (!hka.instalado) {
        caja.appendChild(elemento("div", "config-nota-vinculo", "La impresora fiscal no está activada en tu empresa. Pídele a soporte que la active y aquí podrás registrar la máquina, el IVA y el IGTF."));
        return;
      }
      caja.appendChild(elemento("p", "config-vista-desc", "Registra la máquina fiscal de cada caja y las tasas que tiene programadas (míralas en su Reporte X). La conexión por USB se hace desde el navegador de la caja la primera vez que se cobra."));

      (hka.impresoras || []).forEach(function (p) {
        const tarjeta = elemento("div", "nodus-tarjeta");
        const cab = elemento("div", "nodus-fila-info");
        cab.style.borderBottom = "none";
        const izq = document.createElement("div");
        izq.appendChild(document.createTextNode(p.nombre));
        const modelo = (hka.modelos.find(function (m) { return m.id === p.modelo; }) || {}).nombre || p.modelo;
        izq.appendChild(elemento("small", "", "Modelo " + modelo + (p.activo ? "" : " · desactivada")));
        cab.appendChild(izq);
        tarjeta.appendChild(cab);

        const iva = campoNum(p.iva_pct), red = campoNum(p.iva_reducido_pct), per = campoNum(p.percibido_pct), igtfPct = campoNum(p.igtf_pct);
        const chk = document.createElement("input"); chk.type = "checkbox"; chk.checked = p.igtf;
        const cuenta = selectOpciones(hka.cuentas, p.cuenta_igtf, "Elige la cuenta del IGTF");
        const flag = selectOpciones(hka.flags, p.flag);
        const grid = elemento("div", "nodus-grid");
        const igtfCaja = elemento("label", "nodus-etiqueta");
        igtfCaja.appendChild(elemento("span", "", "IGTF habilitado en la máquina"));
        igtfCaja.appendChild(chk);
        [etiquetaCampo("IVA general %", iva), etiquetaCampo("IVA reducido %", red), etiquetaCampo("Percibido %", per), igtfCaja,
         etiquetaCampo("IGTF %", igtfPct), etiquetaCampo("Cuenta del IGTF", cuenta), etiquetaCampo("Ancho de montos (flag 63)", flag)
        ].forEach(function (x) { grid.appendChild(x); });
        tarjeta.appendChild(grid);

        const pie = elemento("div", "nodus-controles");
        pie.style.cssText = "margin-top:14px;justify-content:flex-end;";
        const estado = elemento("button", "config-btn-outline", p.activo ? "Desactivar" : "Activar"); estado.type = "button";
        estado.addEventListener("click", function () {
          nodusFetch("/fiscal/impresora/" + p.id, { method: "POST", body: { activo: !p.activo } }).then(cargarFiscal).catch(function (err) { mostrarToast(err.message, "error"); });
        });
        const guardar = elemento("button", "config-btn-primario", "Guardar impresora"); guardar.type = "button";
        guardar.addEventListener("click", function () {
          nodusFetch("/fiscal/impresora/" + p.id, { method: "POST", body: {
            iva_pct: iva.value, iva_reducido_pct: red.value, percibido_pct: per.value, igtf: chk.checked, igtf_pct: igtfPct.value,
            cuenta_igtf: cuenta.value, flag: flag.value } })
            .then(function () { mostrarToast("Impresora fiscal guardada."); })
            .catch(function (err) { mostrarToast(err.message, "error"); });
        });
        pie.appendChild(estado); pie.appendChild(guardar);
        tarjeta.appendChild(pie);
        caja.appendChild(tarjeta);
      });

      // Registrar una máquina nueva
      const nueva = elemento("div", "config-fila-agregar");
      const nombre = document.createElement("input"); nombre.type = "text"; nombre.placeholder = "Nombre de la máquina, ej. Caja principal";
      const modelo = selectOpciones(hka.modelos, hka.modelos.length ? hka.modelos[0].id : "");
      const crear = elemento("button", "config-btn-outline", "Registrar máquina"); crear.type = "button";
      crear.addEventListener("click", function () {
        if (!nombre.value.trim()) return;
        nodusFetch("/fiscal/impresora", { method: "POST", body: { nombre: nombre.value, modelo: modelo.value } })
          .then(function () { mostrarToast("Máquina registrada."); return cargarFiscal(); })
          .catch(function (err) { mostrarToast(err.message, "error"); });
      });
      nueva.appendChild(nombre); nueva.appendChild(modelo); nueva.appendChild(crear);
      caja.appendChild(nueva);

      // Qué máquina usa cada caja
      if ((hka.cajas || []).length) {
        caja.appendChild(elemento("p", "config-form-seccion-titulo", "Máquina de cada caja"));
        const opciones = (hka.impresoras || []).filter(function (p) { return p.activo; }).map(function (p) { return { id: p.id, nombre: p.nombre }; });
        hka.cajas.forEach(function (c) {
          const fila = elemento("div", "nodus-fila-info");
          fila.appendChild(elemento("div", "", c.nombre));
          const sel = selectOpciones(opciones, c.impresora, "Sin máquina fiscal");
          sel.addEventListener("change", function () {
            nodusFetch("/fiscal/caja/" + c.id, { method: "POST", body: { impresora: sel.value } })
              .then(function () { mostrarToast("Caja actualizada."); })
              .catch(function (err) { mostrarToast(err.message, "error"); cargarFiscal(); });
          });
          fila.appendChild(sel);
          caja.appendChild(fila);
        });
      }
    }).catch(function (err) { mostrarToast("No se pudo cargar la información fiscal: " + err.message, "error"); });
  }

  const btnCrearLibro = document.getElementById("config-btn-crear-libro");
  if (btnCrearLibro) {
    btnCrearLibro.addEventListener("click", function () {
      const nombre = document.getElementById("config-nuevo-libro-nombre").value.trim();
      const prefijo = document.getElementById("config-nuevo-libro-prefijo").value.trim();
      if (!nombre || !prefijo) { mostrarToast("Escribe el nombre y el prefijo.", "error"); return; }
      nodusFetch("/fiscal/diario", { method: "POST", body: { nombre: nombre, prefijo: prefijo } })
        .then(function () {
          document.getElementById("config-nuevo-libro-nombre").value = "";
          document.getElementById("config-nuevo-libro-prefijo").value = "";
          mostrarToast('Libro "' + nombre + '" creado.');
          return cargarFiscal();
        })
        .catch(function (err) { mostrarToast(err.message, "error"); });
    });
  }

  nodusFetch("/config").then(function (d) { aplicarNegocio(d.negocio || {}); }).catch(function () {});
  cargarContabilidad();

  // =========================================================
  // Arranque
  // =========================================================

  document.addEventListener("DOMContentLoaded", function () {
    nodusFetch("/sesion")
      .then(function (data) { window.hadeonConfig.csrfToken = data.csrf_token; })
      .catch(function (err) { console.error("❌ [Hadeon Config] No se pudo iniciar sesión NODUS:", err); });
  });

  hadeonCrearDropdown(document.getElementById("config-campo-moneda"));
  hadeonCrearDropdown(document.getElementById("config-pos-moneda-mostrar"));
  hadeonCrearDropdown(document.getElementById("config-conta-mes-fiscal"));

  // Arrastrar con mouse para deslizar las tablas (Usuarios, Categorías)
  // en teléfono — mismo patrón y mismo motivo que en
  // contactos_template.xml (habilitarArrastreScroll): el navegador solo
  // deja deslizar un overflow:auto con touch o agarrando la barra, no
  // con mouse apretado+arrastre.
  document.querySelectorAll('.config-tabla-wrap').forEach(function (el) {
    var arrastrando = false, inicioX = 0, scrollInicial = 0;
    el.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      arrastrando = true;
      inicioX = e.pageX;
      scrollInicial = el.scrollLeft;
    });
    window.addEventListener('mousemove', function (e) {
      if (!arrastrando) return;
      el.scrollLeft = scrollInicial - (e.pageX - inicioX);
    });
    window.addEventListener('mouseup', function () { arrastrando = false; });
  });

  cargarEmpresa();
  cargarUsuarios();
})();






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
