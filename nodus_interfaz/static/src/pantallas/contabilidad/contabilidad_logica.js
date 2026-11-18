/** @odoo-module **/
// Lógica de la pantalla Contabilidad (código de Nodus). Se monta al abrir la pantalla y se limpia al salir:
// los escuchas de window/document y los temporizadores quedan registrados para quitarlos.

import { crearEntorno } from "../entorno";

export function montar(raiz) {
    const { document, window, matchMedia, setInterval, setTimeout, arrancar, detener } = crearEntorno(raiz);



document.addEventListener("DOMContentLoaded", function () {
  const botonesFecha = document.querySelectorAll('#conta-filtro-fecha button');
  const popover = document.getElementById('conta-fecha-popover');

  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const DIAS_SEMANA = ['D','L','M','M','J','V','S'];

  const hoy = new Date();
  let periodoActivo = 'mes';

  // Solo se muestra el valor elegido (en vez de "Día"/"Mes"/"Año")
  // DESPUÉS de que el usuario elige algo explícitamente — no antes.
  const yaSeleccionado = { dia: false, mes: false, anio: false };

  const btnDia = document.getElementById('btn-periodo-dia');
  const btnMes = document.getElementById('btn-periodo-mes');
  const btnAnio = document.getElementById('btn-periodo-año');

  function actualizarTextoBoton(tipo) {
    if (tipo === 'dia') {
      btnDia.textContent = yaSeleccionado.dia ? String(estado.dia.selDia) : 'Día';
    } else if (tipo === 'mes') {
      btnMes.textContent = yaSeleccionado.mes ? MESES_CORTOS[estado.mes.selMes] : 'Mes';
    } else {
      btnAnio.textContent = yaSeleccionado.anio ? String(estado.anio.selAnio) : 'Año';
    }
  }

  // Estado de navegación / selección — independiente por tipo
  let estado = {
    dia: { verAnio: hoy.getFullYear(), verMes: hoy.getMonth(), selAnio: hoy.getFullYear(), selMes: hoy.getMonth(), selDia: hoy.getDate() },
    mes: { verAnio: hoy.getFullYear(), selAnio: hoy.getFullYear(), selMes: hoy.getMonth() },
    anio: { verDecada: Math.floor(hoy.getFullYear() / 10) * 10, selAnio: hoy.getFullYear() }
  };

  // =========================================================
  // CALENDARIO DE DÍAS
  // =========================================================
  function renderCalendarioDias() {
    const e = estado.dia;
    const primerDiaSemana = new Date(e.verAnio, e.verMes, 1).getDay();
    const diasEnMes = new Date(e.verAnio, e.verMes + 1, 0).getDate();
    const diasMesAnterior = new Date(e.verAnio, e.verMes, 0).getDate();

    let celdas = '';
    // Días del mes anterior (relleno)
    for (let i = primerDiaSemana - 1; i >= 0; i--) {
      celdas += `<span class="conta-cal-dia otro-mes vacio">${diasMesAnterior - i}</span>`;
    }
    // Días del mes actual
    for (let d = 1; d <= diasEnMes; d++) {
      const esHoy = d === hoy.getDate() && e.verMes === hoy.getMonth() && e.verAnio === hoy.getFullYear();
      const esSeleccionado = d === e.selDia && e.verMes === e.selMes && e.verAnio === e.selAnio;
      celdas += `<button class="conta-cal-dia${esHoy ? ' hoy' : ''}${esSeleccionado ? ' seleccionado' : ''}" data-dia="${d}">${d}</button>`;
    }

    popover.innerHTML = `
      <div class="conta-fecha-nav">
        <button class="conta-fecha-nav-btn" id="cal-dia-prev">‹</button>
        <span class="conta-fecha-nav-label">${MESES[e.verMes]} ${e.verAnio}</span>
        <button class="conta-fecha-nav-btn" id="cal-dia-next">›</button>
      </div>
      <div class="conta-cal-diassemana">${DIAS_SEMANA.map(d => `<span>${d}</span>`).join('')}</div>
      <div class="conta-cal-dias">${celdas}</div>
    `;

    document.getElementById('cal-dia-prev').addEventListener('click', (ev) => {
      ev.stopPropagation();
      e.verMes--; if (e.verMes < 0) { e.verMes = 11; e.verAnio--; }
      renderCalendarioDias();
    });
    document.getElementById('cal-dia-next').addEventListener('click', (ev) => {
      ev.stopPropagation();
      e.verMes++; if (e.verMes > 11) { e.verMes = 0; e.verAnio++; }
      renderCalendarioDias();
    });
    popover.querySelectorAll('.conta-cal-dia:not(.vacio)').forEach(btn => {
      btn.addEventListener('click', function () {
        e.selDia = parseInt(this.getAttribute('data-dia'));
        e.selMes = e.verMes;
        e.selAnio = e.verAnio;
        yaSeleccionado.dia = true;
        actualizarTextoBoton('dia');
        if (window.hadeonContabilidad && window.hadeonContabilidad.aplicarFiltroFecha) {
          window.hadeonContabilidad.aplicarFiltroFecha({ periodo: 'dia', anio: e.selAnio, mes: e.selMes, dia: e.selDia });
        }
        cerrarPopover();
        console.log('Día seleccionado:', `${e.selAnio}-${String(e.selMes+1).padStart(2,'0')}-${String(e.selDia).padStart(2,'0')}`);
      });
    });
  }

  // =========================================================
  // CUADRÍCULA DE MESES
  // =========================================================
  function renderCalendarioMeses() {
    const e = estado.mes;
    let botones = '';
    for (let m = 0; m < 12; m++) {
      const esSeleccionado = m === e.selMes && e.verAnio === e.selAnio;
      botones += `<button class="conta-cal-mes-btn${esSeleccionado ? ' seleccionado' : ''}" data-mes="${m}">${MESES_CORTOS[m]}</button>`;
    }
    popover.innerHTML = `
      <div class="conta-fecha-nav">
        <button class="conta-fecha-nav-btn" id="cal-mes-prev">‹</button>
        <span class="conta-fecha-nav-label">${e.verAnio}</span>
        <button class="conta-fecha-nav-btn" id="cal-mes-next">›</button>
      </div>
      <div class="conta-cal-meses">${botones}</div>
    `;
    document.getElementById('cal-mes-prev').addEventListener('click', (ev) => { ev.stopPropagation(); e.verAnio--; renderCalendarioMeses(); });
    document.getElementById('cal-mes-next').addEventListener('click', (ev) => { ev.stopPropagation(); e.verAnio++; renderCalendarioMeses(); });
    popover.querySelectorAll('.conta-cal-mes-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        e.selMes = parseInt(this.getAttribute('data-mes'));
        e.selAnio = e.verAnio;
        yaSeleccionado.mes = true;
        actualizarTextoBoton('mes');
        if (window.hadeonContabilidad && window.hadeonContabilidad.aplicarFiltroFecha) {
          window.hadeonContabilidad.aplicarFiltroFecha({ periodo: 'mes', anio: e.selAnio, mes: e.selMes });
        }
        cerrarPopover();
        console.log('Mes seleccionado:', `${e.selAnio}-${String(e.selMes+1).padStart(2,'0')}`);
      });
    });
  }

  // =========================================================
  // CUADRÍCULA DE AÑOS
  // =========================================================
  function renderCalendarioAnios() {
    const e = estado.anio;
    let botones = '';
    for (let a = e.verDecada; a < e.verDecada + 9; a++) {
      const esSeleccionado = a === e.selAnio;
      botones += `<button class="conta-cal-anio-btn${esSeleccionado ? ' seleccionado' : ''}" data-anio="${a}">${a}</button>`;
    }
    popover.innerHTML = `
      <div class="conta-fecha-nav">
        <button class="conta-fecha-nav-btn" id="cal-anio-prev">‹</button>
        <span class="conta-fecha-nav-label">${e.verDecada} - ${e.verDecada + 8}</span>
        <button class="conta-fecha-nav-btn" id="cal-anio-next">›</button>
      </div>
      <div class="conta-cal-anios">${botones}</div>
    `;
    document.getElementById('cal-anio-prev').addEventListener('click', (ev) => { ev.stopPropagation(); e.verDecada -= 9; renderCalendarioAnios(); });
    document.getElementById('cal-anio-next').addEventListener('click', (ev) => { ev.stopPropagation(); e.verDecada += 9; renderCalendarioAnios(); });
    popover.querySelectorAll('.conta-cal-anio-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        e.selAnio = parseInt(this.getAttribute('data-anio'));
        yaSeleccionado.anio = true;
        actualizarTextoBoton('anio');
        if (window.hadeonContabilidad && window.hadeonContabilidad.aplicarFiltroFecha) {
          window.hadeonContabilidad.aplicarFiltroFecha({ periodo: 'anio', anio: e.selAnio });
        }
        cerrarPopover();
        console.log('Año seleccionado:', e.selAnio);
      });
    });
  }

  function renderPopover() {
    if (periodoActivo === 'dia') renderCalendarioDias();
    else if (periodoActivo === 'mes') renderCalendarioMeses();
    else renderCalendarioAnios();
  }

  function abrirPopover() {
    renderPopover();
    popover.classList.add('abierto');
  }
  function cerrarPopover() {
    popover.classList.remove('abierto');
  }

  // =========================================================
  // FLECHAS DE SCROLL DE LAS PESTAÑAS (Libro mayor, CxC...)
  // — mismo patrón que las categorías del POS: aparecen solo
  // cuando hay hacia dónde deslizar, invisibles si todo cabe.
  // =========================================================
  const tabsContenedor = document.getElementById('conta-tabs');
  const tabsFlechaIzq = document.getElementById('conta-tabs-scroll-izq');
  const tabsFlechaDer = document.getElementById('conta-tabs-scroll-der');

  if (tabsContenedor && tabsFlechaIzq && tabsFlechaDer) {
    const tabsWrapperEl = tabsContenedor.closest('.conta-tabs-wrapper');

    // Degradado dinámico (sustituye al fijo que traía esta barra antes)
    // — su scrollbar ya está oculta (.conta-tabs::-webkit-scrollbar
    // {display:none}), así que aplicar la máscara directo sobre
    // tabsContenedor es seguro: no hay barra visible que se pueda ver
    // afectada.
    function calcularDegradadoTabs(direccionCSS, posActual, maxPos) {
      if (maxPos <= 2) return null;
      const enInicio = posActual <= 2;
      const enFin = posActual >= maxPos - 2;
      const rampaSalida = `black calc(100% - 28px), rgba(0,0,0,0.55) calc(100% - 14px), rgba(0,0,0,0.15) calc(100% - 4px), transparent 100%`;
      const rampaEntrada = `transparent 0, rgba(0,0,0,0.15) 4px, rgba(0,0,0,0.55) 14px, black 28px`;
      if (enInicio) return `linear-gradient(${direccionCSS}, black 0, ${rampaSalida})`;
      if (enFin) return `linear-gradient(${direccionCSS}, ${rampaEntrada}, black 100%)`;
      return `linear-gradient(${direccionCSS}, ${rampaEntrada}, black calc(50% - 8px), black calc(50% + 8px), ${rampaSalida})`;
    }

    function actualizarFlechasTabs() {
      const hayDesborde = tabsContenedor.scrollWidth > tabsContenedor.clientWidth + 2;
      if (tabsWrapperEl) tabsWrapperEl.classList.toggle('tiene-desborde', hayDesborde);

      if (!hayDesborde) {
        tabsFlechaIzq.classList.remove('visible');
        tabsFlechaDer.classList.remove('visible');
        tabsContenedor.style.maskImage = 'none';
        tabsContenedor.style.webkitMaskImage = 'none';
        return;
      }

      const puedeIzquierda = tabsContenedor.scrollLeft > 2;
      const puedeDerecha = tabsContenedor.scrollLeft + tabsContenedor.clientWidth < tabsContenedor.scrollWidth - 2;
      tabsFlechaIzq.classList.toggle('visible', puedeIzquierda);
      tabsFlechaDer.classList.toggle('visible', puedeDerecha);

      const maxScrollLeft = tabsContenedor.scrollWidth - tabsContenedor.clientWidth;
      const gradiente = calcularDegradadoTabs('to right', tabsContenedor.scrollLeft, maxScrollLeft) || 'none';
      tabsContenedor.style.maskImage = gradiente;
      tabsContenedor.style.webkitMaskImage = gradiente;
    }

    tabsFlechaIzq.addEventListener('click', () => {
      tabsContenedor.scrollBy({ left: -150, behavior: 'smooth' });
    });
    tabsFlechaDer.addEventListener('click', () => {
      tabsContenedor.scrollBy({ left: 150, behavior: 'smooth' });
    });

    tabsContenedor.addEventListener('scroll', actualizarFlechasTabs, { passive: true });
    window.addEventListener('resize', actualizarFlechasTabs);
    actualizarFlechasTabs();
    setTimeout(actualizarFlechasTabs, 300);
  }

  botonesFecha.forEach(btn => {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const tipo = this.getAttribute('data-periodo');
      const tipoNorm = tipo === 'año' ? 'anio' : tipo;

      // Si este botón ya tiene una fecha elegida, un clic lo regresa
      // a "general" (sin filtro) — solo ese botón, sin abrir el calendario.
      if (yaSeleccionado[tipoNorm]) {
        yaSeleccionado[tipoNorm] = false;
        actualizarTextoBoton(tipo);
        cerrarPopover();
        if (window.hadeonContabilidad && window.hadeonContabilidad.aplicarFiltroFecha) {
          window.hadeonContabilidad.aplicarFiltroFecha(null);
        }
        return;
      }

      const yaEraActivoYAbierto = this.classList.contains('activo') && popover.classList.contains('abierto');
      botonesFecha.forEach(b => b.classList.remove('activo'));
      this.classList.add('activo');
      periodoActivo = tipo;

      if (yaEraActivoYAbierto) {
        cerrarPopover();
      } else {
        abrirPopover();
      }
    });
  });

  // Clic afuera cierra el popover (pero no si el clic fue dentro del propio popover, ej. al navegar meses)
  document.addEventListener('click', function (e) {
    if (!popover.contains(e.target) && !document.getElementById('conta-filtro-fecha').contains(e.target)) {
      cerrarPopover();
    }
  });

  const btnExportar = document.getElementById('conta-btn-exportar');
  if (btnExportar) {
    btnExportar.addEventListener('click', function () {
      if (window.nodusExportar) window.nodusExportar();
    });
  }
});






  window.hadeonContabilidad = window.hadeonContabilidad || {};

  window.hadeonContabilidad.renderKPIs = function (kpis) {
    const contenedor = document.getElementById('conta-kpis-contenedor');
    if (!contenedor) return;
    contenedor.innerHTML = '';
    kpis.forEach(kpi => {
      const item = document.createElement('div');
      item.className = 'conta-kpi-item' + (kpi.variante ? ' ' + kpi.variante : '');
      item.innerHTML = `
        <span class="conta-kpi-label">${kpi.label}</span>
        <span class="conta-kpi-valor">${kpi.valor}</span>
      `;
      contenedor.appendChild(item);
    });
  };

  document.addEventListener("DOMContentLoaded", function () {
    window.hadeonContabilidad.renderKPIs([]);
  });






document.addEventListener("DOMContentLoaded", function () {

  // =========================================================
  // DEGRADADO DINÁMICO DE SCROLL — el desvanecimiento solo se
  // ve del lado donde hay MÁS contenido por recorrer. En el
  // extremo de inicio (scroll en 0) no se nota nada de ese lado;
  // en cuanto avanzas, aparece ahí también. En el extremo final
  // desaparece del lado que ya se acabó.
  // =========================================================
  function calcularDegradadoEje(direccionCSS, posActual, maxPos) {
    if (maxPos <= 2) return null; // no hay desborde real en este eje
    const enInicio = posActual <= 2;
    const enFin = posActual >= maxPos - 2;
    // Pasos intermedios (en vez de un salto directo de transparente a
    // opaco) para que la curva se sienta gradual, no un corte duro
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
      el.style.maskImage = validos.join(', ');
      el.style.webkitMaskImage = validos.join(', ');
      el.style.maskComposite = 'intersect';
      el.style.webkitMaskComposite = 'source-in';
    }
  }

  // =========================================================
  // ANTIGÜEDAD DE SALDOS (CxC/CxP) — punto 1 del informe
  // =========================================================
  const MESES_CORTOS_G = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  function calcularAntiguedad(vencDate, corte, abonado, total) {
    const dias = Math.round((corte - vencDate) / 86400000); // positivo = vencido, negativo = faltan días
    if (abonado >= total) return { dias, estado: 'verde', texto: 'Pagado', bucket: 'pagado' };
    if (dias <= 0) return { dias, estado: dias >= -5 ? 'amarillo' : 'verde', texto: 'Por Vencer', bucket: 'por-vencer' };
    let bucket, texto;
    if (dias <= 30) { bucket = '1-30'; texto = '1-30 días'; }
    else if (dias <= 60) { bucket = '31-60'; texto = '31-60 días'; }
    else if (dias <= 90) { bucket = '61-90'; texto = '61-90 días'; }
    else { bucket = '90+'; texto = '+90 días'; }
    const estado = abonado > 0 ? 'naranja' : 'rojo';
    if (abonado > 0) texto = 'Pago Parcial';
    else texto = 'Vencido';
    return { dias, estado, texto, bucket };
  }

  function fechaCorteTexto(d) {
    return `${d.getDate()} ${MESES_CORTOS_G[d.getMonth()]} ${d.getFullYear()}`;
  }

  function construirBarraAntiguedad(prefijo, estadoObj) {
    const opciones = [
      { val: 'todos', label: 'Todos' },
      { val: 'por-vencer', label: 'Por Vencer' },
      { val: '1-30', label: '1-30 días' },
      { val: '31-60', label: '31-60 días' },
      { val: '61-90', label: '61-90 días' },
      { val: '90+', label: '+90 días' }
    ];
    const botones = opciones.map(o =>
      `<button type="button" class="ct-antig-btn${estadoObj.filtro === o.val ? ' activo' : ''}" data-antig="${o.val}" data-prefijo="${prefijo}">${o.label}</button>`
    ).join('');

    return `
      <div class="ct-antig-barra">
        <div class="ct-antig-botones">${botones}</div>
        <div class="ct-form-fecha-wrapper" style="width:auto;">
          <button type="button" class="ct-form-fecha-trigger" id="${prefijo}-corte-trigger" style="width:auto; white-space:nowrap;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            <span>Corte: </span><span id="${prefijo}-corte-texto">${fechaCorteTexto(estadoObj.corte)}</span>
          </button>
          <div class="ct-form-fecha-popover" id="${prefijo}-corte-popover"></div>
        </div>
      </div>`;
  }

  // Genera el trigger+popover del selector de fecha de corte,
  // reutilizable para CxC y CxP sin duplicar la lógica del calendario
  function inicializarCalendarioCorte(contenedor, prefijo, estadoRef, onCambiar) {
    const trigger = contenedor.querySelector('#' + prefijo + '-trigger');
    const popover = contenedor.querySelector('#' + prefijo + '-popover');
    const texto = contenedor.querySelector('#' + prefijo + '-texto');
    if (!trigger || !popover || !texto) return;

    const MESES_F = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const DIAS_F = ['D','L','M','M','J','V','S'];
    let verAnio = estadoRef.corte.getFullYear();
    let verMes = estadoRef.corte.getMonth();

    function render() {
      const primerDiaSemana = new Date(verAnio, verMes, 1).getDay();
      const diasEnMes = new Date(verAnio, verMes + 1, 0).getDate();
      const diasMesAnt = new Date(verAnio, verMes, 0).getDate();
      let celdas = '';
      for (let i = primerDiaSemana - 1; i >= 0; i--) celdas += `<button class="ct-form-cal-dia otro-mes vacio" disabled>${diasMesAnt - i}</button>`;
      for (let d = 1; d <= diasEnMes; d++) {
        const esSel = d === estadoRef.corte.getDate() && verMes === estadoRef.corte.getMonth() && verAnio === estadoRef.corte.getFullYear();
        celdas += `<button class="ct-form-cal-dia${esSel ? ' seleccionado' : ''}" data-dia="${d}">${d}</button>`;
      }
      popover.innerHTML = `
        <div class="ct-form-cal-nav">
          <button type="button" class="ct-form-cal-nav-btn" data-nav="-1">‹</button>
          <span class="ct-form-cal-nav-label">${MESES_F[verMes]} ${verAnio}</span>
          <button type="button" class="ct-form-cal-nav-btn" data-nav="1">›</button>
        </div>
        <div class="ct-form-cal-diassemana">${DIAS_F.map(d => `<span>${d}</span>`).join('')}</div>
        <div class="ct-form-cal-dias">${celdas}</div>`;
      popover.querySelector('[data-nav="-1"]').addEventListener('click', (ev) => { ev.stopPropagation(); verMes--; if (verMes < 0) { verMes = 11; verAnio--; } render(); });
      popover.querySelector('[data-nav="1"]').addEventListener('click', (ev) => { ev.stopPropagation(); verMes++; if (verMes > 11) { verMes = 0; verAnio++; } render(); });
      popover.querySelectorAll('.ct-form-cal-dia:not(.vacio)').forEach(btn => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          estadoRef.corte = new Date(verAnio, verMes, parseInt(btn.getAttribute('data-dia')));
          texto.textContent = fechaCorteTexto(estadoRef.corte);
          cerrar();
          onCambiar();
        });
      });
    }
    function abrir() { render(); popover.classList.add('abierto'); trigger.classList.add('abierto'); }
    function cerrar() { popover.classList.remove('abierto'); trigger.classList.remove('abierto'); }

    trigger.addEventListener('click', (ev) => { ev.stopPropagation(); popover.classList.contains('abierto') ? cerrar() : abrir(); });
    document.addEventListener('click', (ev) => { if (!popover.contains(ev.target) && ev.target !== trigger) cerrar(); });
  }


  // ===== Nodus: datos reales de Odoo =====
  let DATOS = { lineas: [], cxc: [], cxp: [], asientos: [], cuentas: [], cuentasGasto: [], diarios: [], hoy: null };
  let SIMBOLO = '$';
  let MONEDA = 'usd';

  // Los textos van a plantillas HTML: se escapan al llegar del servidor
  function esc(v) {
    if (typeof v === 'string') return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    if (Array.isArray(v)) return v.map(esc);
    if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => { o[k] = esc(v[k]); }); return o; }
    return v;
  }

  function cargarDatos() {
    return fetch('/nodus/api/contabilidad/datos?moneda=' + MONEDA).then(r => r.json()).then(d => {
      SIMBOLO = d.simbolo || '$';
      DATOS = esc(d);
      planDeCuentas = DATOS.cuentas;
      asientosGuardados = DATOS.asientos;
    });
  }

  function redibujarTodo() {
    document.querySelectorAll('.conta-vista').forEach(v => { v.dataset.cargado = 'false'; });
    const act = document.querySelector('.conta-vista.activa');
    if (!act) return;
    const id = act.id.replace('vista-', '');
    if (!constructores[id]) return;
    act.innerHTML = constructores[id]();
    activarInteracciones(id, act);
    act.dataset.cargado = 'true';
    if (window.hadeonContabilidad && window.hadeonContabilidad.renderKPIs) window.hadeonContabilidad.renderKPIs(kpisPorVista[id] || []);
  }

  function actualizarKPIsCuentas(idVista, filas, campo) {
    let total = 0, vencido = 0, porVencer = 0, semana = 0;
    filas.forEach(f => {
      const s = f.total - f[campo];
      if (s <= 0.005) return;
      total += s;
      if (f.dias > 0) vencido += s; else { porVencer += s; if (f.dias >= -7) semana += s; }
    });
    kpisPorVista[idVista] = idVista === 'cuentas-cobrar'
      ? [{ label: "Total por Cobrar", valor: fmt(total) }, { label: "Total Vencido", valor: fmt(vencido), variante: "color-error" }, { label: "Total por Vencer", valor: fmt(porVencer), variante: "color-exito" }]
      : [{ label: "Total por Pagar", valor: fmt(total) }, { label: "Total Vencido", valor: fmt(vencido), variante: "color-error" }, { label: "Compromisos de la Semana", valor: fmt(semana), variante: "color-alerta" }];
    const act = document.querySelector('.conta-vista.activa');
    if (act && act.id === 'vista-' + idVista && window.hadeonContabilidad && window.hadeonContabilidad.renderKPIs) {
      window.hadeonContabilidad.renderKPIs(kpisPorVista[idVista]);
    }
  }

  function fmt(n) {
    const signo = n < 0 ? "-" : "";
    return signo + SIMBOLO + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // =========================================================
  // FILTRO DE FECHA — compartido con el widget conta-filtros
  // =========================================================
  // El widget de filtros llama a window.hadeonContabilidad.aplicarFiltroFecha()
  // cada vez que el usuario elige un día/mes/año. Aquí solo guardamos
  // ese filtro y volvemos a pintar la vista activa (si es una de las
  // que tiene fecha por movimiento) con los datos ya filtrados.
  let filtroFechaActivo = null; // { periodo: 'dia'|'mes'|'anio', anio, mes, dia }

  // Texto del buscador (#conta-buscador) -- ya en minúsculas y sin
  // espacios de sobra. Cada vista decide contra qué campos propios
  // comparar (cuenta, cliente/proveedor, factura, glosa, etc.).
  let textoBusquedaActivo = '';

  function coincideBusqueda() {
    if (!textoBusquedaActivo) return true;
    const campos = Array.prototype.slice.call(arguments);
    return campos.some(function (campo) {
      return String(campo || '').toLowerCase().indexOf(textoBusquedaActivo) !== -1;
    });
  }

  function filtrarPorFecha(filas) {
    if (!filtroFechaActivo) return filas;
    const f = filtroFechaActivo;
    return filas.filter(fila => {
      if (fila.anio !== f.anio) return false;
      if (f.periodo === 'anio') return true;
      if (fila.mes !== f.mes) return false;
      if (f.periodo === 'mes') return true;
      return fila.dia === f.dia;
    });
  }

  window.hadeonContabilidad = window.hadeonContabilidad || {};
  window.hadeonContabilidad.aplicarFiltroFecha = function (filtro) {
    filtroFechaActivo = filtro;
    document.querySelectorAll('.conta-vista').forEach(v => { v.dataset.cargado = 'false'; });
    const vistaActivaEl = document.querySelector('.conta-vista.activa');
    if (!vistaActivaEl) return;
    const idVista = vistaActivaEl.id.replace('vista-', '');
    // Solo Libro mayor y Libro diario tienen fecha por movimiento;
    // el resto de vistas ignora el filtro por ahora.
    if (['libro-mayor', 'libro-diario', 'estado-resultados', 'balance-comprobacion'].indexOf(idVista) !== -1) {
      paginaActual[idVista] = 1;
      vistaActivaEl.dataset.cargado = 'false';
      vistaActivaEl.innerHTML = constructores[idVista]();
      activarInteracciones(idVista, vistaActivaEl);
      vistaActivaEl.dataset.cargado = 'true';
    }
  };
  const ITEMS_POR_PAGINA = 5;
  const paginaActual = {}; // { 'libro-mayor': 1, 'cuentas-cobrar': 1, ... }

  function paginacion(idVista, cant) {
    const pagina = paginaActual[idVista] || 1;
    const totalPaginas = Math.max(Math.ceil(cant / ITEMS_POR_PAGINA), 1);
    const desde = cant === 0 ? 0 : (pagina - 1) * ITEMS_POR_PAGINA + 1;
    const hasta = Math.min(pagina * ITEMS_POR_PAGINA, cant);

    return `
      <div class="ct-paginacion">
        <div>Mostrando <strong>${desde}</strong> a <strong>${hasta}</strong> de <strong>${cant}</strong> registros</div>
        <div class="ct-paginacion-botones">
          <button class="ct-pag-btn" data-vista="${idVista}" data-accion="anterior" ${pagina <= 1 ? 'disabled' : ''}>Anterior</button>
          <span class="ct-pag-num">${pagina}</span>
          <button class="ct-pag-btn" data-vista="${idVista}" data-accion="siguiente" ${pagina >= totalPaginas ? 'disabled' : ''}>Siguiente</button>
        </div>
      </div>`;
  }

  function paginarLista(lista, idVista) {
    if (window.__nodusExportando) return lista;
    const pagina = paginaActual[idVista] || 1;
    const inicio = (pagina - 1) * ITEMS_POR_PAGINA;
    return lista.slice(inicio, inicio + ITEMS_POR_PAGINA);
  }

  // =========================================================
  // LIBRO MAYOR
  // =========================================================
  function construirLibroMayor() {
    const movsCompletos = DATOS.lineas.map(l => ({ ...l }));
    const movs = filtrarPorFecha(movsCompletos).filter(function (m) {
      return coincideBusqueda(m.codigo, m.cuenta, m.desc);
    });
    let saldo = 0, totalD = 0, totalH = 0;
    const movsConSaldo = movs.map(m => {
      saldo += m.debito - m.credito; totalD += m.debito; totalH += m.credito;
      return { ...m, saldoAcumulado: saldo };
    });

    if (movs.length === 0) {
      actualizarKPIsLibroMayor(0, 0, saldo);
      return `<div class="conta-placeholder"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="9" y1="9" x2="15" y2="9"></line><line x1="9" y1="13" x2="15" y2="13"></line></svg><h3>Sin movimientos</h3><p>No hay movimientos registrados para la fecha seleccionada.</p></div>`;
    }

    const filas = paginarLista(movsConSaldo, 'libro-mayor').map(m => {
      return `<tr>
        <td>${m.fecha}</td>
        <td><span class="ct-fila-cuenta"><span class="ct-codigo">${m.codigo}</span><span class="ct-nombre-principal">${m.cuenta}</span></span></td>
        <td>${m.desc}</td>
        <td class="der">${m.debito ? `<span class="ct-debito">${fmt(m.debito)}</span>` : '<span class="ct-guion">-</span>'}</td>
        <td class="der">${m.credito ? `<span class="ct-credito">${fmt(m.credito)}</span>` : '<span class="ct-guion">-</span>'}</td>
        <td class="der ct-saldo-linea">${fmt(m.saldoAcumulado)}</td>
      </tr>`;
    }).join('');

    actualizarKPIsLibroMayor(totalD, totalH, saldo);
    return `
      <div class="ct-tabla-frame"><div class="ct-tabla-scroll"><table class="ct-tabla">
        <thead><tr><th>Fecha</th><th>Cuenta</th><th>Descripción</th><th class="der">Debe</th><th class="der">Haber</th><th class="der">Saldo</th></tr></thead>
        <tbody>${filas}</tbody>
        <tfoot><tr><td colspan="3" class="der">Totales del período</td><td class="der ct-verde">${fmt(totalD)}</td><td class="der ct-rojo">${fmt(totalH)}</td><td class="der ct-azul">${fmt(saldo)}</td></tr></tfoot>
      </table></div></div>
      ${paginacion('libro-mayor', movs.length)}`;
  }

  function actualizarKPIsLibroMayor(totalD, totalH, saldo) {
    kpisPorVista['libro-mayor'] = [
      { label: "Total debe", valor: fmt(totalD) },
      { label: "Total haber", valor: fmt(totalH) },
      { label: "Saldo acumulado", valor: fmt(saldo), variante: "destacado" }
    ];
    if (window.hadeonContabilidad && window.hadeonContabilidad.renderKPIs) {
      window.hadeonContabilidad.renderKPIs(kpisPorVista['libro-mayor']);
    }
  }

  // =========================================================
  // CUENTAS POR COBRAR
  // =========================================================
  const cxcEstado = { corte: new Date(), filtro: 'todos', orden: null };

  function construirCxC() {
    const filasBase = DATOS.cxc.map(x => ({ id: x.id, cliente: x.tercero, rif: x.rif, factura: x.factura, emision: x.emision, vencD: new Date(x.venc[0], x.venc[1], x.venc[2]), total: x.total, abonado: x.abonado }));

    let filas = filasBase.map(f => ({ ...f, ...calcularAntiguedad(f.vencD, cxcEstado.corte, f.abonado, f.total), venc: fechaCorteTexto(f.vencD) }));

    actualizarKPIsCuentas('cuentas-cobrar', filas, 'abonado');
    filas = filas.filter(f => coincideBusqueda(f.cliente, f.rif, f.factura));
    if (cxcEstado.filtro !== 'todos') filas = filas.filter(f => f.bucket === cxcEstado.filtro);
    if (cxcEstado.orden) filas = [...filas].sort((a, b) => cxcEstado.orden === 'asc' ? a.dias - b.dias : b.dias - a.dias);

    const filasHtml = paginarLista(filas, 'cuentas-cobrar').map(f => {
      const saldo = f.total - f.abonado;
      return `<tr>
        <td><span class="ct-nombre-principal">${f.cliente}</span><br><span class="ct-subtexto">${f.rif}</span></td>
        <td>${f.factura}</td>
        <td>${f.emision}</td>
        <td>${f.venc}</td>
        <td class="der">${fmt(f.total)}</td>
        <td class="der ct-verde">${fmt(f.abonado)}</td>
        <td class="der ct-saldo-linea">${fmt(saldo)}</td>
        <td class="centro">${f.dias > 0 && f.bucket !== 'pagado' ? f.dias + ' días' : '-'}</td>
        <td class="centro"><span class="ct-badge ${f.estado}">${f.texto}</span></td>
        <td class="centro">${saldo > 0.005 ? `<button type="button" class="ct-btn-accion-fila" data-pagar="cxc" data-id="${f.id}">Cobrar</button>` : ''}</td>
      </tr>`;
    }).join('');

    return `
      ${construirBarraAntiguedad('cxc', cxcEstado)}
      <div class="ct-tabla-frame"><div class="ct-tabla-scroll"><table class="ct-tabla">
        <thead><tr><th>Cliente</th><th>N° Factura</th><th>F. Emisión</th><th>F. Vencimiento</th><th class="der">Monto Total</th><th class="der">Abonado</th><th class="der">Saldo</th><th class="centro" id="cxc-th-dias" style="cursor:pointer;">Días Mora ${cxcEstado.orden ? (cxcEstado.orden === 'asc' ? '▲' : '▼') : '⇅'}</th><th class="centro">Estado</th><th class="centro">Acción</th></tr></thead>
        <tbody>${filasHtml || '<tr><td colspan="10" class="centro ct-subtexto">No hay facturas de clientes por mostrar.</td></tr>'}</tbody>
      </table></div></div>
      ${paginacion('cuentas-cobrar', filas.length)}`;
  }

  // =========================================================
  // CUENTAS POR PAGAR
  // =========================================================
  const cxpEstado = { corte: new Date(), filtro: 'todos', orden: null };

  function construirCxP() {
    const filasBase = DATOS.cxp.map(x => ({ id: x.id, proveedor: x.tercero, rif: x.rif, factura: x.factura, emision: x.emision, vencD: new Date(x.venc[0], x.venc[1], x.venc[2]), total: x.total, pagado: x.abonado }));

    let filas = filasBase.map(f => ({ ...f, ...calcularAntiguedad(f.vencD, cxpEstado.corte, f.pagado, f.total), venc: fechaCorteTexto(f.vencD) }));

    actualizarKPIsCuentas('cuentas-pagar', filas, 'pagado');
    filas = filas.filter(f => coincideBusqueda(f.proveedor, f.rif, f.factura));
    if (cxpEstado.filtro !== 'todos') filas = filas.filter(f => f.bucket === cxpEstado.filtro);
    if (cxpEstado.orden) filas = [...filas].sort((a, b) => cxpEstado.orden === 'asc' ? a.dias - b.dias : b.dias - a.dias);

    const filasHtml = paginarLista(filas, 'cuentas-pagar').map(f => {
      const saldo = f.total - f.pagado;
      return `<tr>
        <td><span class="ct-nombre-principal">${f.proveedor}</span><br><span class="ct-subtexto">${f.rif}</span></td>
        <td>${f.factura}</td>
        <td>${f.emision}</td>
        <td>${f.venc}</td>
        <td class="der">${fmt(f.total)}</td>
        <td class="der ct-verde">${fmt(f.pagado)}</td>
        <td class="der ct-saldo-linea">${fmt(saldo)}</td>
        <td class="centro">${f.dias > 0 && f.bucket !== 'pagado' ? f.dias + ' días' : '-'}</td>
        <td class="centro"><span class="ct-badge ${f.estado}">${f.texto}</span></td>
        <td class="centro">${saldo > 0.005 ? `<button type="button" class="ct-btn-accion-fila" data-pagar="cxp" data-id="${f.id}">Pagar</button>` : ''}</td>
      </tr>`;
    }).join('');

    return `
      <div class="ct-barra-acciones"><button class="ct-btn-nuevo-asiento" id="ct-btn-gasto" type="button"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Registrar gasto</button></div>
      ${construirBarraAntiguedad('cxp', cxpEstado)}
      <div class="ct-tabla-frame"><div class="ct-tabla-scroll"><table class="ct-tabla">
        <thead><tr><th>Proveedor</th><th>N° Factura</th><th>F. Emisión</th><th>F. Vencimiento</th><th class="der">Monto Total</th><th class="der">Pagado</th><th class="der">Saldo</th><th class="centro" id="cxp-th-dias" style="cursor:pointer;">Días Venc. ${cxpEstado.orden ? (cxpEstado.orden === 'asc' ? '▲' : '▼') : '⇅'}</th><th class="centro">Estado</th><th class="centro">Acción</th></tr></thead>
        <tbody>${filasHtml || '<tr><td colspan="10" class="centro ct-subtexto">No hay facturas de proveedores por mostrar.</td></tr>'}</tbody>
      </table></div></div>
      ${paginacion('cuentas-pagar', filas.length)}`;
  }

  // =========================================================
  // BALANCE GENERAL — árbol jerárquico
  // =========================================================
  function saldoPorCuenta(lineas, grupos) {
    const m = {};
    lineas.filter(l => grupos.indexOf(l.grupo) !== -1).forEach(l => {
      const k = l.codigo + '|' + l.cuenta;
      m[k] = m[k] || { codigo: l.codigo, nombre: l.cuenta, naturaleza: l.naturaleza, d: 0, c: 0 };
      m[k].d += l.debito; m[k].c += l.credito;
    });
    return Object.keys(m).map(k => {
      const x = m[k];
      return { codigo: x.codigo, nombre: x.nombre, monto: x.naturaleza === 'acreedora' ? x.c - x.d : x.d - x.c };
    }).filter(x => Math.abs(x.monto) >= 0.005).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
  }

  const CHEVRON_16 = '<svg class="ct-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
  const CHEVRON_14 = '<svg class="ct-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>';

  function construirBalanceGeneral() {
    if (!DATOS.lineas.length) {
      return `<div class="conta-placeholder"><h3>Sin movimientos</h3><p>Todavía no hay asientos publicados para armar el balance.</p></div>`;
    }
    const suma = (items) => items.reduce((s, x) => s + x.monto, 0);
    const filaN3 = (x) => `<div class="ct-nivel-3"><span><span class="ct-codigo">${x.codigo}</span> ${x.nombre}</span><span>${fmt(x.monto)}</span></div>`;
    const subgrupo = (titulo, items) => items.length ? `
            <div class="ct-nodo ct-nivel-2 abierto">
              <div class="ct-nodo-header"><div class="ct-nodo-izq">${CHEVRON_14}<span class="ct-nombre-principal">${titulo}</span></div><span>${fmt(suma(items))}</span></div>
              <div class="ct-nodo-body">${items.map(filaN3).join('')}</div>
            </div>` : '';
    const nivel1 = (titulo, total, cuerpo) => `
        <div class="ct-nodo ct-nivel-1 abierto">
          <div class="ct-nodo-header"><div class="ct-nodo-izq">${CHEVRON_16}<span class="ct-nombre-principal">${titulo}</span></div><span class="ct-saldo-linea">${fmt(total)}</span></div>
          <div class="ct-nodo-body">${cuerpo}</div>
        </div>`;

    const actCor = saldoPorCuenta(DATOS.lineas, ['activo_corriente']);
    const actNo = saldoPorCuenta(DATOS.lineas, ['activo_no_corriente']);
    const pasCor = saldoPorCuenta(DATOS.lineas, ['pasivo_corriente']);
    const pasNo = saldoPorCuenta(DATOS.lineas, ['pasivo_no_corriente']);
    const patri = saldoPorCuenta(DATOS.lineas, ['patrimonio']);
    // El resultado acumulado de ingresos y gastos todavía no se cerró contra patrimonio:
    // se muestra aquí para que el balance cuadre
    let resultado = 0;
    DATOS.lineas.forEach(l => {
      if (['ingreso', 'cambio_ganancia', 'costo', 'gasto', 'cambio_perdida'].indexOf(l.grupo) !== -1) resultado += l.credito - l.debito;
    });
    if (Math.abs(resultado) >= 0.005) patri.push({ codigo: '', nombre: 'Resultado del ejercicio', monto: resultado });

    const totalActivo = suma(actCor) + suma(actNo);
    const totalPasivo = suma(pasCor) + suma(pasNo);
    const totalPatri = suma(patri);

    return `
      <div class="ct-lista-scroll">
      <div class="ct-arbol">
        ${nivel1('ACTIVO', totalActivo, subgrupo('Activo Corriente', actCor) + subgrupo('Activo No Corriente', actNo))}
        ${nivel1('PASIVO', totalPasivo, subgrupo('Pasivo Corriente', pasCor) + subgrupo('Pasivo No Corriente', pasNo))}
        ${nivel1('PATRIMONIO', totalPatri, patri.map(filaN3).join(''))}
      </div>
      </div>
      <div class="ct-total-general">
        <span class="ct-nombre-principal">Total Pasivo + Patrimonio</span>
        <span class="ct-saldo-linea" style="font-size:16px;">${fmt(totalPasivo + totalPatri)}</span>
      </div>`;
  }

  // =========================================================
  // ESTADO DE GANANCIAS Y PÉRDIDAS — cascada con desglose
  // =========================================================
  function construirEstadoResultados() {
    const lineas = filtrarPorFecha(DATOS.lineas);
    const subIngresos = saldoPorCuenta(lineas, ['ingreso']);
    const subCostoVentas = saldoPorCuenta(lineas, ['costo']);
    const subGastosOp = saldoPorCuenta(lineas, ['gasto']);
    const sumar = (items) => items.reduce((s, x) => s + x.monto, 0);

    const ingresos = sumar(subIngresos);
    const costoVentas = sumar(subCostoVentas);
    const utilBruta = ingresos - costoVentas;
    const gastosOp = sumar(subGastosOp);
    const utilOp = utilBruta - gastosOp;

    // Diferencia en cambio: ganancia y pérdida por separado
    const gananciaCambio = sumar(saldoPorCuenta(lineas, ['cambio_ganancia']));
    const perdidaCambio = sumar(saldoPorCuenta(lineas, ['cambio_perdida']));
    const utilAntesImp = utilOp + gananciaCambio - perdidaCambio;

    // Provisión de ISLR estimada (tasa plana de referencia): el ISLR real es por tramos
    const provisionISLR = utilAntesImp > 0 ? utilAntesImp * 0.25 : 0;
    const utilNeta = utilAntesImp - provisionISLR;
    const pct = (n) => ingresos ? ((n / ingresos) * 100).toFixed(1) + '%' : '0.0%';

    function filaExpandible(id, label, monto, subitems, claseColor) {
      const filasSub = subitems.map(s => `
        <div class="ct-nivel-3"><span><span class="ct-codigo">${s.codigo}</span> ${s.nombre}</span><span>${fmt(s.monto)}</span></div>
      `).join('');
      return `
        <div class="ct-nodo ct-nivel-2" id="ct-er-${id}">
          <div class="ct-nodo-header" style="padding:12px 4px;">
            <div class="ct-nodo-izq">
              ${CHEVRON_16}
              <span class="ct-cascada-label" style="margin:0;">${label}</span>
            </div>
            <span class="ct-cascada-valor ${claseColor || ''}">${fmt(monto)}<span class="ct-cascada-pct">${pct(Math.abs(monto))}</span></span>
          </div>
          <div class="ct-nodo-body">${filasSub}</div>
        </div>`;
    }

    return `
      <div class="ct-cascada">
        ${filaExpandible('ingresos', 'Ingresos Operativos', ingresos, subIngresos)}
        ${filaExpandible('costo', '(−) Costo de Ventas', -costoVentas, subCostoVentas, 'ct-rojo')}
        <div class="ct-cascada-fila subtotal"><span class="ct-cascada-label">(=) Utilidad Bruta</span><span class="ct-cascada-valor">${fmt(utilBruta)}<span class="ct-cascada-pct">${pct(utilBruta)}</span></span></div>
        ${filaExpandible('gastos', '(−) Gastos Operativos', -gastosOp, subGastosOp, 'ct-rojo')}
        <div class="ct-cascada-fila subtotal"><span class="ct-cascada-label">(=) Utilidad Operativa</span><span class="ct-cascada-valor">${fmt(utilOp)}<span class="ct-cascada-pct">${pct(utilOp)}</span></span></div>
        <div class="ct-cascada-fila"><span class="ct-cascada-label">(+) Ganancia en Cambio</span><span class="ct-cascada-valor ct-verde">${fmt(gananciaCambio)}<span class="ct-cascada-pct">${pct(gananciaCambio)}</span></span></div>
        <div class="ct-cascada-fila"><span class="ct-cascada-label">(−) Pérdida en Cambio</span><span class="ct-cascada-valor ct-rojo">${fmt(-perdidaCambio)}<span class="ct-cascada-pct">${pct(perdidaCambio)}</span></span></div>
        <div class="ct-cascada-fila subtotal"><span class="ct-cascada-label">(=) Utilidad Antes de Impuestos</span><span class="ct-cascada-valor">${fmt(utilAntesImp)}<span class="ct-cascada-pct">${pct(utilAntesImp)}</span></span></div>
        <div class="ct-cascada-fila"><span class="ct-cascada-label">(−) Provisión de ISLR <span class="ct-subtexto">(estimado)</span></span><span class="ct-cascada-valor ct-rojo">${fmt(-provisionISLR)}<span class="ct-cascada-pct">${pct(provisionISLR)}</span></span></div>
        <div class="ct-cascada-fila total-final"><span class="ct-cascada-label">(=) UTILIDAD NETA</span><span class="ct-cascada-valor">${fmt(utilNeta)}<span class="ct-cascada-pct">${pct(utilNeta)} de margen</span></span></div>
      </div>`;
  }

  // =========================================================
  // ASIENTOS CONTABLES — lista expandible + botón nuevo
  // =========================================================
  // Plan de cuentas de ejemplo (compartido con el resto de vistas) —
  // se usa para el desplegable de cuenta en el formulario de asiento
  let planDeCuentas = [];

  // Datos en el scope del módulo (no dentro de la función) para
  // que un asiento nuevo persista entre renders, en vez de perderse
  // cada vez que se vuelve a pintar la vista
  let asientosGuardados = [];
  let siguienteNumAsiento = 145;
  let vistaAsientosActual = 'lista'; // 'lista' | 'formulario'

  function construirAsientos() {
    if (vistaAsientosActual === 'formulario') {
      return construirFormularioAsiento();
    }

    const asientosFiltrados = asientosGuardados.filter(function (a) {
      return coincideBusqueda(a.num, a.diario, a.concepto, a.estado);
    });

    const asientosHtml = asientosFiltrados.map((a, idx) => {
      const lineasHtml = a.lineas.map(l => `
        <tr>
          <td><span class="ct-fila-cuenta"><span class="ct-codigo">${l.codigo}</span><span class="ct-nombre-principal">${l.cuenta}</span></span></td>
          <td>${l.glosa}</td>
          <td class="der">${l.debito ? `<span class="ct-debito">${fmt(l.debito)}</span>` : '<span class="ct-guion">-</span>'}</td>
          <td class="der">${l.credito ? `<span class="ct-credito">${fmt(l.credito)}</span>` : '<span class="ct-guion">-</span>'}</td>
        </tr>`).join('');
      const badge = a.estado === 'Asentado' ? 'azul' : 'amarillo';
      return `
        <div class="ct-asiento${idx === 0 ? ' abierto' : ''}">
          <div class="ct-asiento-header">
            <div class="ct-asiento-izq">
              <svg class="ct-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
              <span class="ct-asiento-num">${a.num}</span>
              <span class="ct-subtexto">${a.fecha} · ${a.diario}</span>
              <span class="ct-asiento-concepto">${a.concepto}</span>
            </div>
            <span class="ct-badge ${badge}">${a.estado}</span>
          </div>
          <div class="ct-asiento-body">
            <div class="ct-tabla-scroll" style="max-height:260px;">
              <table class="ct-tabla">
                <thead><tr><th>Cuenta</th><th>Glosa</th><th class="der">Débito</th><th class="der">Crédito</th></tr></thead>
                <tbody>${lineasHtml}</tbody>
              </table>
            </div>
            ${a.estado === 'Borrador' ? `<div style="padding:12px 0 0;"><button type="button" class="ct-btn-primario" data-asentar="${a.id}">Asentar</button></div>` : ''}
          </div>
        </div>`;
    }).join('');

    const sinResultados = asientosFiltrados.length === 0
      ? `<div class="conta-placeholder"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg><h3>Sin resultados</h3><p>Ningún asiento coincide con la búsqueda.</p></div>`
      : '';

    return `
      <button class="ct-btn-nuevo-asiento" id="ct-btn-nuevo-asiento">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        Nuevo Asiento
      </button>
      ${sinResultados}
      <div style="display:flex; flex-direction:column; gap:12px;" class="ct-lista-scroll">${asientosHtml}</div>`;
  }

  // =========================================================
  // FORMULARIO — Nuevo Asiento
  // =========================================================
  function opcionesCuenta(codigoSeleccionado) {
    return planDeCuentas.map(c =>
      `<option value="${c.codigo}"${c.codigo === codigoSeleccionado ? ' selected' : ''}>${c.codigo} - ${c.nombre}</option>`
    ).join('');
  }

  function construirFormularioAsiento() {
    // Arranca con 2 líneas vacías (mínimo de partida doble)
    if (!construirFormularioAsiento.lineas) {
      construirFormularioAsiento.lineas = [
        { codigo: planDeCuentas[0].codigo, glosa: '', debito: '', credito: '' },
        { codigo: planDeCuentas[0].codigo, glosa: '', debito: '', credito: '' }
      ];
    }
    const lineas = construirFormularioAsiento.lineas;

    let totalD = 0, totalH = 0;
    lineas.forEach(l => { totalD += parseFloat(l.debito) || 0; totalH += parseFloat(l.credito) || 0; });
    const cuadrado = lineas.length >= 2 && totalD > 0 && Math.abs(totalD - totalH) < 0.005;

    const lineasHtml = lineas.map((l, i) => {
      const cuentaInfo = planDeCuentas.find(c => c.codigo === l.codigo);
      const textoCuenta = cuentaInfo ? `${cuentaInfo.codigo} - ${cuentaInfo.nombre}` : '';
      return `
      <div class="ct-form-linea" data-linea="${i}">
        <div class="ct-cuenta-buscar-wrapper">
          <input type="text" class="ct-form-input ct-linea-cuenta-buscar" data-linea="${i}" placeholder="Buscar por código o nombre..." value="${textoCuenta}" autocomplete="off">
          <div class="ct-cuenta-sugerencias" id="ct-sugerencias-${i}"></div>
        </div>
        <input type="text" class="ct-form-input ct-linea-glosa" data-campo="glosa" data-linea="${i}" placeholder="Glosa de la línea" value="${l.glosa}">
        <input type="number" step="0.01" class="ct-form-input ct-linea-debito" data-campo="debito" data-linea="${i}" placeholder="0.00" value="${l.debito}">
        <input type="number" step="0.01" class="ct-form-input ct-linea-credito" data-campo="credito" data-linea="${i}" placeholder="0.00" value="${l.credito}">
        <button type="button" class="ct-form-quitar-linea" data-quitar="${i}" ${lineas.length <= 2 ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''} aria-label="Quitar línea">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        </button>
      </div>`;
    }).join('');

    return `
      <div style="display:flex; flex-direction:column; gap:20px;">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <h3 class="ct-seccion-titulo" style="margin:0; padding-right:48px;">
            Nuevo Asiento <span class="ct-subtexto">(el número se asigna al asentarlo)</span>
          </h3>
        </div>

        <div class="ct-form-grid-header">
          <div class="ct-form-grupo">
            <label class="ct-form-label">Fecha</label>
            <div class="ct-form-fecha-wrapper">
              <button type="button" class="ct-form-fecha-trigger vacio" id="ct-form-fecha-trigger">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                <span id="ct-form-fecha-texto">Seleccionar fecha</span>
              </button>
              <div class="ct-form-fecha-popover" id="ct-form-fecha-popover"></div>
            </div>
          </div>
          <div class="ct-form-grupo">
            <label class="ct-form-label">Diario</label>
            <select class="ct-form-select" id="ct-form-diario">${DATOS.diarios.filter(j => ['general', 'bank', 'cash'].indexOf(j.tipo) !== -1).map(j => `<option value="${j.id}">${j.nombre}</option>`).join('')}</select>
          </div>
          <div class="ct-form-grupo">
            <label class="ct-form-label">Concepto General / Glosa</label>
            <input type="text" class="ct-form-input" id="ct-form-concepto" placeholder="Ej. Pago de nómina 2da quincena">
          </div>
          <div class="ct-form-grupo">
            <label class="ct-form-label">Referencia de Documento</label>
            <input type="text" class="ct-form-input" id="ct-form-referencia" placeholder="Ej. FAC-2245, opcional">
          </div>
        </div>

        <div class="ct-form-grupo">
          <label class="ct-form-label">Líneas del asiento (partida doble)</label>
          <div class="ct-form-lineas-header">
            <span>Cuenta</span><span>Glosa</span><span class="der">Débito</span><span class="der">Crédito</span><span></span>
          </div>
          <div id="ct-form-lineas-contenedor" style="display:flex; flex-direction:column; gap:8px;">${lineasHtml}</div>
          <button type="button" class="ct-btn-agregar-linea" id="ct-btn-agregar-linea">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Agregar línea
          </button>
        </div>

        <div class="ct-form-balance ${totalD > 0 || totalH > 0 ? (cuadrado ? 'cuadrado' : 'descuadrado') : ''}" id="ct-form-balance">
          <span>Total Débito: ${fmt(totalD)}  ·  Total Crédito: ${fmt(totalH)}</span>
          <span>${cuadrado ? '✓ Cuadrado' : 'Débitos ≠ Créditos'}</span>
        </div>

        <div class="ct-form-acciones">
          <span class="nodus-error-form" id="ct-form-error" style="flex:1;align-self:center;margin:0;"></span>
          <button type="button" class="ct-btn-secundario" id="ct-btn-cancelar-asiento">Cancelar</button>
          <button type="button" class="ct-btn-secundario" id="ct-btn-guardar-borrador">Guardar como Borrador</button>
          <button type="button" class="ct-btn-primario" id="ct-btn-asentar" ${cuadrado ? '' : 'disabled'}>Asentar</button>
        </div>
      </div>`;
  }

  // =========================================================
  // BALANCE DE COMPROBACIÓN
  // =========================================================
  // Cuentas del balance de comprobación: saldo inicial = lo anterior al período filtrado
  function cuentasComprobacion() {
    const f = filtroFechaActivo;
    const clave = (l) => l.anio * 10000 + l.mes * 100 + l.dia;
    let inicio = null;
    if (f) inicio = f.periodo === 'anio' ? f.anio * 10000 : (f.periodo === 'mes' ? f.anio * 10000 + f.mes * 100 : f.anio * 10000 + f.mes * 100 + f.dia);
    const m = {};
    const tomar = (l) => {
      const k = l.codigo + '|' + l.cuenta;
      m[k] = m[k] || { codigo: l.codigo, nombre: l.cuenta, tipo: l.naturaleza, inicial: 0, debito: 0, credito: 0 };
      return m[k];
    };
    if (inicio !== null) {
      DATOS.lineas.filter(l => clave(l) < inicio).forEach(l => {
        const x = tomar(l);
        x.inicial += x.tipo === 'acreedora' ? l.credito - l.debito : l.debito - l.credito;
      });
    }
    filtrarPorFecha(DATOS.lineas).forEach(l => { const x = tomar(l); x.debito += l.debito; x.credito += l.credito; });
    return Object.keys(m).map(k => m[k])
      .filter(x => Math.abs(x.inicial) >= 0.005 || x.debito || x.credito)
      .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
  }

  function construirBalanceComprobacion() {
    // Los débitos/créditos de cada cuenta son la suma de los mismos
    // movimientos ya balanceados del Libro diario (5 asientos, cada
    // uno con su línea de débito y crédito por el mismo monto) — así
    // el total de Débitos SIEMPRE cuadra con el total de Créditos,
    // como exige la partida doble.
    const cuentas = cuentasComprobacion();

    // La verificación de partida doble es sobre el set completo de
    // cuentas -- filtrar por el buscador no debe disparar un falso
    // "Descuadre Detectado" solo porque se está mostrando una sola cuenta.
    let totalDCompleto = 0, totalHCompleto = 0;
    cuentas.forEach(c => { totalDCompleto += c.debito; totalHCompleto += c.credito; });
    const cuadrado = Math.abs(totalDCompleto - totalHCompleto) < 0.005;
    const badgeHtml = cuadrado
      ? `<div class="ct-form-balance cuadrado" style="margin-top:4px;"><span style="display:inline-flex;align-items:center;gap:5px;"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.45 10.95L11.7375 5.6625L10.6875 4.6125L6.45 8.85L4.3125 6.7125L3.2625 7.7625L6.45 10.95ZM7.5 15C6.4625 15 5.4875 14.8031 4.575 14.4094C3.6625 14.0156 2.86875 13.4812 2.19375 12.8062C1.51875 12.1312 0.984375 11.3375 0.590625 10.425C0.196875 9.5125 0 8.5375 0 7.5C0 6.4625 0.196875 5.4875 0.590625 4.575C0.984375 3.6625 1.51875 2.86875 2.19375 2.19375C2.86875 1.51875 3.6625 0.984375 4.575 0.590625C5.4875 0.196875 6.4625 0 7.5 0C8.5375 0 9.5125 0.196875 10.425 0.590625C11.3375 0.984375 12.1312 1.51875 12.8062 2.19375C13.4812 2.86875 14.0156 3.6625 14.4094 4.575C14.8031 5.4875 15 6.4625 15 7.5C15 8.5375 14.8031 9.5125 14.4094 10.425C14.0156 11.3375 13.4812 12.1312 12.8062 12.8062C12.1312 13.4812 11.3375 14.0156 10.425 14.4094C9.5125 14.8031 8.5375 15 7.5 15ZM7.5 13.5C9.175 13.5 10.5938 12.9188 11.7563 11.7563C12.9188 10.5938 13.5 9.175 13.5 7.5C13.5 5.825 12.9188 4.40625 11.7563 3.24375C10.5938 2.08125 9.175 1.5 7.5 1.5C5.825 1.5 4.40625 2.08125 3.24375 3.24375C2.08125 4.40625 1.5 5.825 1.5 7.5C1.5 9.175 2.08125 10.5938 3.24375 11.7563C4.40625 12.9188 5.825 13.5 7.5 13.5Z" fill="currentColor"></path></svg>Balance Cuadrado (Partida Doble Verificada)</span></div>`
      : `<div class="ct-form-balance descuadrado" style="margin-top:4px;"><span style="display:inline-flex;align-items:center;gap:5px;"><svg width="15" height="13" viewBox="0 0 19 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M0 15.8333L9.16667 0L18.3333 15.8333H0ZM2.875 14.1667H15.4583L9.16667 3.33333L2.875 14.1667ZM9.16667 13.3333C9.40278 13.3333 9.60069 13.2535 9.76042 13.0938C9.92014 12.934 10 12.7361 10 12.5C10 12.2639 9.92014 12.066 9.76042 11.9062C9.60069 11.7465 9.40278 11.6667 9.16667 11.6667C8.93056 11.6667 8.73264 11.7465 8.57292 11.9062C8.41319 12.066 8.33333 12.2639 8.33333 12.5C8.33333 12.7361 8.41319 12.934 8.57292 13.0938C8.73264 13.2535 8.93056 13.3333 9.16667 13.3333ZM8.33333 10.8333H10V6.66667H8.33333V10.8333Z" fill="currentColor"></path></svg>Descuadre Detectado: Diferencia de ${fmt(Math.abs(totalDCompleto - totalHCompleto))}</span></div>`;

    const cuentasFiltradas = cuentas.filter(c => coincideBusqueda(c.codigo, c.nombre));

    let totalD = 0, totalH = 0, totalFinal = 0;
    const filas = cuentasFiltradas.map(c => {
      // Cuentas deudoras (Activo/Costo/Gasto): Saldo Final = Inicial + Débito − Crédito
      // Cuentas acreedoras (Pasivo/Patrimonio/Ingreso): Saldo Final = Inicial + Crédito − Débito
      const final = c.tipo === 'acreedora'
        ? c.inicial + c.credito - c.debito
        : c.inicial + c.debito - c.credito;
      totalD += c.debito; totalH += c.credito; totalFinal += final;
      return `<tr>
        <td><span class="ct-fila-cuenta"><span class="ct-codigo">${c.codigo}</span><span class="ct-nombre-principal">${c.nombre}</span></span></td>
        <td class="der">${fmt(c.inicial)}</td>
        <td class="der">${c.debito ? `<span class="ct-debito">${fmt(c.debito)}</span>` : '<span class="ct-guion">-</span>'}</td>
        <td class="der">${c.credito ? `<span class="ct-credito">${fmt(c.credito)}</span>` : '<span class="ct-guion">-</span>'}</td>
        <td class="der ct-saldo-linea">${fmt(final)}</td>
      </tr>`;
    }).join('');

    return `
      <div class="ct-tabla-frame"><div class="ct-tabla-scroll"><table class="ct-tabla">
        <thead><tr><th>Cuenta</th><th class="der">Saldo Inicial</th><th class="der">Débito</th><th class="der">Crédito</th><th class="der">Saldo Final</th></tr></thead>
        <tbody>${filas || '<tr><td colspan="5" class="centro ct-subtexto">Ninguna cuenta coincide con la búsqueda.</td></tr>'}</tbody>
        <tfoot><tr><td class="der">TOTALES:</td><td></td><td class="der ct-verde">${fmt(totalD)}</td><td class="der ct-rojo">${fmt(totalH)}</td><td class="der ct-azul">${fmt(totalFinal)}</td></tr></tfoot>
      </table></div></div>
      ${badgeHtml}`;
  }

  // =========================================================
  // LIBRO DIARIO — bitácora cronológica por asiento
  // =========================================================
  function construirLibroDiario() {
    const filasCompletas = DATOS.lineas.map(l => ({ ...l, glosa: l.desc }));
    const filas = filtrarPorFecha(filasCompletas).filter(function (f) {
      return coincideBusqueda(f.asiento, f.diario, f.codigo, f.cuenta, f.glosa);
    });
    let totalD = 0, totalH = 0;
    filas.forEach(f => { totalD += f.debito; totalH += f.credito; });

    if (filas.length === 0) {
      return `<div class="conta-placeholder"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="9" y1="9" x2="15" y2="9"></line><line x1="9" y1="13" x2="15" y2="13"></line></svg><h3>Sin movimientos</h3><p>No hay asientos registrados para la fecha seleccionada.</p></div>`;
    }

    const filasHtml = paginarLista(filas, 'libro-diario').map(f => {
      return `<tr>
        <td>${f.fecha}</td>
        <td class="ct-azul">${f.asiento}</td>
        <td>${f.diario}</td>
        <td><span class="ct-fila-cuenta"><span class="ct-codigo">${f.codigo}</span><span class="ct-nombre-principal">${f.cuenta}</span></span></td>
        <td>${f.glosa}</td>
        <td class="der">${f.debito ? `<span class="ct-debito">${fmt(f.debito)}</span>` : '<span class="ct-guion">-</span>'}</td>
        <td class="der">${f.credito ? `<span class="ct-credito">${fmt(f.credito)}</span>` : '<span class="ct-guion">-</span>'}</td>
      </tr>`;
    }).join('');

    return `
      <div class="ct-tabla-frame"><div class="ct-tabla-scroll"><table class="ct-tabla">
        <thead><tr><th>Fecha</th><th>N° Asiento</th><th>Diario</th><th>Cuenta</th><th>Glosa</th><th class="der">Débito</th><th class="der">Crédito</th></tr></thead>
        <tbody>${filasHtml}</tbody>
        <tfoot><tr><td colspan="5" class="der">TOTALES:</td><td class="der ct-verde">${fmt(totalD)}</td><td class="der ct-rojo">${fmt(totalH)}</td></tr></tfoot>
      </table></div></div>
      ${paginacion('libro-diario', filas.length)}`;
  }

  // =========================================================
  // MOTOR DE VISTAS
  // =========================================================
  const kpisPorVista = { 'libro-mayor': [], 'cuentas-cobrar': [], 'cuentas-pagar': [] };

  const constructores = {
    'libro-mayor': construirLibroMayor,
    'cuentas-cobrar': construirCxC,
    'cuentas-pagar': construirCxP,
    'balance-general': construirBalanceGeneral,
    'estado-resultados': construirEstadoResultados,
    'asientos-contables': construirAsientos,
    'balance-comprobacion': construirBalanceComprobacion,
    'libro-diario': construirLibroDiario
  };

  function activarInteracciones(idVista, contenedor) {
    // Árbol de Balance general y Asientos — clic en encabezado abre/cierra
    contenedor.querySelectorAll('.ct-nodo-header').forEach(h => {
      h.addEventListener('click', () => h.closest('.ct-nodo').classList.toggle('abierto'));
    });
    contenedor.querySelectorAll('.ct-asiento-header').forEach(h => {
      h.addEventListener('click', () => h.closest('.ct-asiento').classList.toggle('abierto'));
    });
    contenedor.querySelectorAll('.ct-tabla-frame').forEach(frame => {
      agregarScrollHorizontalPersonalizado(frame);
    });
    contenedor.querySelectorAll('.ct-pag-btn[data-accion]').forEach(btn => {
      btn.addEventListener('click', function () {
        if (this.disabled) return;
        const vista = this.getAttribute('data-vista');
        const accion = this.getAttribute('data-accion');
        paginaActual[vista] = (paginaActual[vista] || 1) + (accion === 'siguiente' ? 1 : -1);

        // Volvemos a pintar esa misma vista respetando el filtro
        // de fecha que esté activo (si lo hay)
        const contenedorVista = document.getElementById('vista-' + vista);
        if (contenedorVista && constructores[vista]) {
          contenedorVista.innerHTML = constructores[vista]();
          activarInteracciones(vista, contenedorVista);
        }
      });
    });

    if (idVista === 'asientos-contables') {
      activarInteraccionesAsientos(contenedor);
    }
    if (idVista === 'cuentas-cobrar') {
      activarInteraccionesAntiguedad(contenedor, 'cxc', cxcEstado, 'cuentas-cobrar');
    }
    if (idVista === 'cuentas-pagar') {
      activarInteraccionesAntiguedad(contenedor, 'cxp', cxpEstado, 'cuentas-pagar');
    }

    if (typeof actualizarThumbPanel === 'function') {
      requestAnimationFrame(actualizarThumbPanel);
    }
  }

  function activarInteraccionesAntiguedad(contenedor, prefijo, estadoObj, idVista) {
    function reRender() {
      paginaActual[idVista] = 1;
      const contVista = document.getElementById('vista-' + idVista);
      if (contVista && constructores[idVista]) {
        contVista.innerHTML = constructores[idVista]();
        activarInteracciones(idVista, contVista);
      }
    }

    contenedor.querySelectorAll('.ct-antig-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        estadoObj.filtro = btn.getAttribute('data-antig');
        reRender();
      });
    });

    const thDias = contenedor.querySelector('#' + prefijo + '-th-dias');
    if (thDias) {
      thDias.addEventListener('click', () => {
        estadoObj.orden = estadoObj.orden === 'asc' ? 'desc' : 'asc';
        reRender();
      });
    }

    inicializarCalendarioCorte(contenedor, prefijo + '-corte', estadoObj, reRender);
  }

  function actualizarBalanceFormulario(contenedor) {
    const lineas = construirFormularioAsiento.lineas || [];
    let totalD = 0, totalH = 0;
    lineas.forEach(l => { totalD += parseFloat(l.debito) || 0; totalH += parseFloat(l.credito) || 0; });
    const cuadrado = lineas.length >= 2 && totalD > 0 && Math.abs(totalD - totalH) < 0.005;
    const caja = contenedor.querySelector('#ct-form-balance');
    if (caja) {
      caja.className = 'ct-form-balance ' + (totalD > 0 || totalH > 0 ? (cuadrado ? 'cuadrado' : 'descuadrado') : '');
      caja.innerHTML = '<span>Total Débito: ' + fmt(totalD) + '  ·  Total Crédito: ' + fmt(totalH) + '</span><span>' + (cuadrado ? '✓ Cuadrado' : 'Débitos ≠ Créditos') + '</span>';
    }
    const btn = contenedor.querySelector('#ct-btn-asentar');
    if (btn) btn.disabled = !cuadrado;
  }

  function reRenderAsientos(contenedor) {
    // Al agregar o quitar líneas se vuelve a pintar el formulario: se conservan los datos de arriba
    const guardado = {};
    ['ct-form-concepto', 'ct-form-referencia', 'ct-form-diario'].forEach(id => {
      const el = contenedor.querySelector('#' + id);
      if (el) guardado[id] = el.value;
    });
    contenedor.innerHTML = construirAsientos();
    Object.keys(guardado).forEach(id => {
      const el = contenedor.querySelector('#' + id);
      if (el) el.value = guardado[id];
    });
    activarInteracciones('asientos-contables', contenedor);
  }

  function activarInteraccionesAsientos(contenedor) {
    // ---- Vista lista: botón "Nuevo Asiento" ----
    const btnNuevo = contenedor.querySelector('#ct-btn-nuevo-asiento');
    if (btnNuevo) {
      btnNuevo.addEventListener('click', () => {
        vistaAsientosActual = 'formulario';
        construirFormularioAsiento.lineas = null; // arranca limpio cada vez
        construirFormularioAsiento.fechaSel = null;
        reRenderAsientos(contenedor);
      });
    }

    // ---- Vista formulario: calendario del campo Fecha ----
    const fechaTrigger = contenedor.querySelector('#ct-form-fecha-trigger');
    const fechaPopover = contenedor.querySelector('#ct-form-fecha-popover');
    const fechaTexto = contenedor.querySelector('#ct-form-fecha-texto');

    if (fechaTrigger && fechaPopover) {
      const MESES_FORM = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
      const MESES_CORTOS_FORM = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      const DIAS_SEMANA_FORM = ['D','L','M','M','J','V','S'];
      const hoyForm = new Date();

      if (!construirFormularioAsiento.fechaSel) {
        construirFormularioAsiento.fechaSel = { verAnio: hoyForm.getFullYear(), verMes: hoyForm.getMonth(), anio: null, mes: null, dia: null };
      }
      const e = construirFormularioAsiento.fechaSel;

      function renderCalFormulario() {
        const primerDiaSemana = new Date(e.verAnio, e.verMes, 1).getDay();
        const diasEnMes = new Date(e.verAnio, e.verMes + 1, 0).getDate();
        const diasMesAnterior = new Date(e.verAnio, e.verMes, 0).getDate();

        let celdas = '';
        for (let i = primerDiaSemana - 1; i >= 0; i--) {
          celdas += `<button class="ct-form-cal-dia otro-mes vacio" disabled>${diasMesAnterior - i}</button>`;
        }
        for (let d = 1; d <= diasEnMes; d++) {
          const esHoy = d === hoyForm.getDate() && e.verMes === hoyForm.getMonth() && e.verAnio === hoyForm.getFullYear();
          const esSeleccionado = d === e.dia && e.verMes === e.mes && e.verAnio === e.anio;
          celdas += `<button class="ct-form-cal-dia${esHoy ? ' hoy' : ''}${esSeleccionado ? ' seleccionado' : ''}" data-dia="${d}">${d}</button>`;
        }

        fechaPopover.innerHTML = `
          <div class="ct-form-cal-nav">
            <button type="button" class="ct-form-cal-nav-btn" id="ct-form-cal-prev">‹</button>
            <span class="ct-form-cal-nav-label">${MESES_FORM[e.verMes]} ${e.verAnio}</span>
            <button type="button" class="ct-form-cal-nav-btn" id="ct-form-cal-next">›</button>
          </div>
          <div class="ct-form-cal-diassemana">${DIAS_SEMANA_FORM.map(d => `<span>${d}</span>`).join('')}</div>
          <div class="ct-form-cal-dias">${celdas}</div>
        `;

        fechaPopover.querySelector('#ct-form-cal-prev').addEventListener('click', (ev) => {
          ev.stopPropagation();
          e.verMes--; if (e.verMes < 0) { e.verMes = 11; e.verAnio--; }
          renderCalFormulario();
        });
        fechaPopover.querySelector('#ct-form-cal-next').addEventListener('click', (ev) => {
          ev.stopPropagation();
          e.verMes++; if (e.verMes > 11) { e.verMes = 0; e.verAnio++; }
          renderCalFormulario();
        });
        fechaPopover.querySelectorAll('.ct-form-cal-dia:not(.vacio)').forEach(btn => {
          btn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            e.dia = parseInt(this.getAttribute('data-dia'));
            e.mes = e.verMes;
            e.anio = e.verAnio;
            fechaTexto.textContent = `${e.dia} ${MESES_CORTOS_FORM[e.mes]} ${e.anio}`;
            fechaTrigger.classList.remove('vacio');
            cerrarCalFormulario();
          });
        });
      }

      function abrirCalFormulario() {
        renderCalFormulario();
        fechaPopover.classList.add('abierto');
        fechaTrigger.classList.add('abierto');
      }
      function cerrarCalFormulario() {
        fechaPopover.classList.remove('abierto');
        fechaTrigger.classList.remove('abierto');
      }

      // Si ya había una fecha elegida antes de re-renderizar, refleja el texto
      if (e.dia) {
        fechaTexto.textContent = `${e.dia} ${MESES_CORTOS_FORM[e.mes]} ${e.anio}`;
        fechaTrigger.classList.remove('vacio');
      }

      fechaTrigger.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (fechaPopover.classList.contains('abierto')) cerrarCalFormulario();
        else abrirCalFormulario();
      });
      document.addEventListener('click', function (ev) {
        if (!fechaPopover.contains(ev.target) && ev.target !== fechaTrigger) cerrarCalFormulario();
      });
    }

      const btnCancelar = contenedor.querySelector('#ct-btn-cancelar-asiento');
    if (btnCancelar) {
      btnCancelar.addEventListener('click', () => {
        vistaAsientosActual = 'lista';
        reRenderAsientos(contenedor);
      });
    }

    // Cambios en los campos de las líneas actualizan el estado en memoria
    contenedor.querySelectorAll('[data-campo][data-linea]').forEach(input => {
      input.addEventListener('input', function () {
        const i = parseInt(this.getAttribute('data-linea'));
        const campo = this.getAttribute('data-campo');
        if (construirFormularioAsiento.lineas && construirFormularioAsiento.lineas[i]) {
          construirFormularioAsiento.lineas[i][campo] = this.value;
          actualizarBalanceFormulario(contenedor);
        }
      });
    });

    // ---- Buscador de cuenta con autocompletado (no re-renderiza
    // mientras se escribe, para no perder el foco a cada letra) ----
    contenedor.querySelectorAll('.ct-linea-cuenta-buscar').forEach(input => {
      const i = parseInt(input.getAttribute('data-linea'));
      const sugerencias = contenedor.querySelector('#ct-sugerencias-' + i);
      if (!sugerencias) return;
      let indiceResaltado = -1;

      function renderSugerencias(lista) {
        indiceResaltado = -1;
        if (lista.length === 0) {
          sugerencias.innerHTML = '<div class="ct-cuenta-opcion-vacio">Sin resultados</div>';
        } else {
          sugerencias.innerHTML = lista.map((c, idx) =>
            `<div class="ct-cuenta-opcion" data-codigo="${c.codigo}" data-idx="${idx}"><span class="ct-codigo">${c.codigo}</span><span>${c.nombre}</span></div>`
          ).join('');
          sugerencias.querySelectorAll('.ct-cuenta-opcion').forEach(op => {
            op.addEventListener('mousedown', (ev) => {
              ev.preventDefault();
              seleccionarCuenta(op.getAttribute('data-codigo'));
            });
          });
        }
        sugerencias.classList.add('abierto');
      }

      function seleccionarCuenta(codigo) {
        const info = planDeCuentas.find(c => c.codigo === codigo);
        if (!info) return;
        input.value = `${info.codigo} - ${info.nombre}`;
        sugerencias.classList.remove('abierto');
        if (construirFormularioAsiento.lineas && construirFormularioAsiento.lineas[i]) {
          construirFormularioAsiento.lineas[i].codigo = codigo;
        }
      }

      input.addEventListener('input', function () {
        const q = this.value.trim().toLowerCase();
        const filtradas = q === ''
          ? planDeCuentas
          : planDeCuentas.filter(c => c.codigo.includes(q) || c.nombre.toLowerCase().includes(q));
        renderSugerencias(filtradas);
      });

      input.addEventListener('focus', function () {
        renderSugerencias(planDeCuentas);
      });

      input.addEventListener('keydown', function (ev) {
        const opciones = sugerencias.querySelectorAll('.ct-cuenta-opcion');
        if (!opciones.length) return;
        if (ev.key === 'ArrowDown') {
          ev.preventDefault();
          indiceResaltado = Math.min(indiceResaltado + 1, opciones.length - 1);
        } else if (ev.key === 'ArrowUp') {
          ev.preventDefault();
          indiceResaltado = Math.max(indiceResaltado - 1, 0);
        } else if (ev.key === 'Enter') {
          ev.preventDefault();
          if (indiceResaltado >= 0) seleccionarCuenta(opciones[indiceResaltado].getAttribute('data-codigo'));
          return;
        } else if (ev.key === 'Escape') {
          sugerencias.classList.remove('abierto');
          return;
        } else {
          return;
        }
        opciones.forEach((op, idx) => op.classList.toggle('resaltada', idx === indiceResaltado));
      });

      document.addEventListener('click', function (ev) {
        if (ev.target !== input && !sugerencias.contains(ev.target)) {
          sugerencias.classList.remove('abierto');
        }
      });
    });

    contenedor.querySelectorAll('[data-quitar]').forEach(btn => {
      btn.addEventListener('click', function () {
        if (this.disabled) return;
        const i = parseInt(this.getAttribute('data-quitar'));
        construirFormularioAsiento.lineas.splice(i, 1);
        reRenderAsientos(contenedor);
      });
    });

    const btnAgregarLinea = contenedor.querySelector('#ct-btn-agregar-linea');
    if (btnAgregarLinea) {
      btnAgregarLinea.addEventListener('click', () => {
        construirFormularioAsiento.lineas.push({ codigo: planDeCuentas[0].codigo, glosa: '', debito: '', credito: '' });
        reRenderAsientos(contenedor);
      });
    }

    function guardarAsiento(estadoFinal) {
      const fechaSel = construirFormularioAsiento.fechaSel;
      const fecha = (fechaSel && fechaSel.dia)
        ? fechaSel.anio + '-' + String(fechaSel.mes + 1).padStart(2, '0') + '-' + String(fechaSel.dia).padStart(2, '0')
        : null;
      const val = (id) => { const el = contenedor.querySelector('#' + id); return el ? el.value.trim() : ''; };
      const errorEl = contenedor.querySelector('#ct-form-error');
      if (errorEl) errorEl.textContent = '';
      const botones = contenedor.querySelectorAll('.ct-form-acciones button');
      botones.forEach(b => { b.disabled = true; });
      postJSON('/nodus/api/contabilidad/asientos', {
        moneda: MONEDA, fecha: fecha, diarioId: val('ct-form-diario'), concepto: val('ct-form-concepto'), referencia: val('ct-form-referencia'),
        asentar: estadoFinal === 'Asentado',
        lineas: construirFormularioAsiento.lineas.map(l => ({ codigo: l.codigo, glosa: l.glosa || '', debito: parseFloat(l.debito) || 0, credito: parseFloat(l.credito) || 0 }))
      }).then(res => {
        if (res.error) {
          botones.forEach(b => { b.disabled = false; });
          actualizarBalanceFormulario(contenedor);
          if (errorEl) errorEl.textContent = res.error;
          return;
        }
        vistaAsientosActual = 'lista';
        construirFormularioAsiento.lineas = null;
        construirFormularioAsiento.fechaSel = null;
        return recargarTodo();
      }).catch(() => {
        botones.forEach(b => { b.disabled = false; });
        if (errorEl) errorEl.textContent = 'No se pudo guardar. Revisa tu conexión.';
      });
    }

    const btnBorrador = contenedor.querySelector('#ct-btn-guardar-borrador');
    if (btnBorrador) btnBorrador.addEventListener('click', () => guardarAsiento('Borrador'));

    const btnAsentar = contenedor.querySelector('#ct-btn-asentar');
    if (btnAsentar) btnAsentar.addEventListener('click', () => { if (!btnAsentar.disabled) guardarAsiento('Asentado'); });
  }

  // =========================================================
  // SCROLL HORIZONTAL PERSONALIZADO
  // =========================================================
  // Reemplaza visualmente la barra nativa del navegador (que
  // solo se veía en tablet/móvil, vía la media query de arriba)
  // por un track+thumb con el estilo del sistema, insertado
  // justo debajo del cuadro. Si la tabla no necesita scroll
  // horizontal (cabe completa), el control ni se muestra.
  // =========================================================
  function agregarScrollHorizontalPersonalizado(frame) {
    const scrollEl = frame.querySelector('.ct-tabla-scroll');
    if (!scrollEl) return;

    const control = document.createElement('div');
    control.className = 'ct-scroll-personalizado';
    control.innerHTML = `
      <button class="ct-scroll-flecha" type="button" data-dir="-1" aria-label="Desplazar a la izquierda">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
      </button>
      <div class="ct-scroll-track">
        <div class="ct-scroll-thumb"></div>
      </div>
      <button class="ct-scroll-flecha" type="button" data-dir="1" aria-label="Desplazar a la derecha">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </button>
    `;
    frame.parentNode.insertBefore(control, frame.nextSibling);

    const track = control.querySelector('.ct-scroll-track');
    const thumb = control.querySelector('.ct-scroll-thumb');

    let sugerenciaMostrada = false;
    let yaAnimoEntrada = false;

    function reproducirRebendeEntrada() {
      const tablaInterna = scrollEl.querySelector('table');
      if (!tablaInterna) return;

      const distanciaNatural = scrollEl.scrollWidth - scrollEl.clientWidth;
      const extraRebote = 36; // cuánto se pasa del borde real para mostrar el espacio en blanco
      const distanciaTotal = distanciaNatural + extraRebote;
      const anchoTrack = track.clientWidth;
      const anchoThumb = thumb.offsetWidth;
      const maxThumbLeft = anchoTrack - anchoThumb;

      // Fase 1: avanza de una sola vez, pasándose del borde real
      // (esto es lo que deja ver el espacio en blanco un instante)
      tablaInterna.style.transition = 'transform 0.65s cubic-bezier(0.22, 1, 0.36, 1)';
      tablaInterna.style.transform = `translateX(-${distanciaTotal}px)`;
      thumb.style.transition = 'left 0.65s cubic-bezier(0.22, 1, 0.36, 1)';
      thumb.style.left = maxThumbLeft + 'px';

      // Fase 2: se asienta de vuelta a su borde real (esto es lo
      // que deja ver que sí avanzó, en una sola dirección)
      setTimeout(() => {
        tablaInterna.style.transition = 'transform 0.45s cubic-bezier(0.34, 1.4, 0.64, 1)';
        tablaInterna.style.transform = `translateX(-${distanciaNatural}px)`;
        thumb.style.left = maxThumbLeft + 'px';

        // Fase 3: regresa al principio — aquí sí termina en 0,
        // como en cualquier estado normal de la tabla
        setTimeout(() => {
          tablaInterna.style.transition = 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
          tablaInterna.style.transform = 'translateX(0)';
          thumb.style.left = '0px';

          setTimeout(() => {
            // Limpieza: quitamos el transform y dejamos la tabla
            // en un estado 100% normal, listo para que el scroll
            // real (scrollLeft) siga funcionando igual que siempre
            tablaInterna.style.transition = '';
            tablaInterna.style.transform = '';
            thumb.style.transition = '';
            scrollEl.scrollLeft = 0;
          }, 500);
        }, 450);
      }, 420);
    }

    function actualizarThumb() {
      const necesitaScroll = scrollEl.scrollWidth > scrollEl.clientWidth + 2;
      control.classList.toggle('necesario', necesitaScroll);

      const maxScrollLeftTabla = scrollEl.scrollWidth - scrollEl.clientWidth;
      const maxScrollTopTabla = scrollEl.scrollHeight - scrollEl.clientHeight;
      aplicarMascara(scrollEl, [
        calcularDegradadoEje('to right', scrollEl.scrollLeft, maxScrollLeftTabla),
        calcularDegradadoEje('to bottom', scrollEl.scrollTop, maxScrollTopTabla)
      ]);

      if (!necesitaScroll) return;

      const anchoTrack = track.clientWidth;
      const proporcionVisible = scrollEl.clientWidth / scrollEl.scrollWidth;
      const anchoThumb = Math.max(anchoTrack * proporcionVisible, 32);
      const maxScrollLeft = scrollEl.scrollWidth - scrollEl.clientWidth;
      const progreso = maxScrollLeft > 0 ? Math.min(Math.max(scrollEl.scrollLeft / maxScrollLeft, 0), 1) : 0;
      const maxThumbLeft = anchoTrack - anchoThumb;

      thumb.style.width = anchoThumb + 'px';
      thumb.style.left = (progreso * maxThumbLeft) + 'px';

      if (!sugerenciaMostrada) {
        sugerenciaMostrada = true;
        thumb.classList.add('sugerencia');
        setTimeout(() => thumb.classList.remove('sugerencia'), 1500);
      }
    }

    scrollEl.addEventListener('scroll', actualizarThumb);
    window.addEventListener('resize', actualizarThumb);

    // ResizeObserver detecta el tamaño real desde el primer
    // instante (evita el problema de calcular antes de que la
    // tabla termine de tomar su ancho definitivo) y se activa
    // solo automáticamente apenas hace falta, sin necesitar
    // ningún scroll/resize manual primero.
    if (window.ResizeObserver) {
      const observador = new ResizeObserver(actualizarThumb);
      observador.observe(scrollEl);
      const tablaInterna = scrollEl.querySelector('table');
      if (tablaInterna) observador.observe(tablaInterna);
    } else {
      // Respaldo para navegadores sin ResizeObserver
      requestAnimationFrame(actualizarThumb);
      setTimeout(actualizarThumb, 300);
    }

    // Animación de entrada (rebote) — se dispara UNA sola vez,
    // y solo en el momento en que el control entra de verdad en
    // el viewport (no apenas carga la página, por si la tabla
    // está más abajo y el usuario aún no ha llegado a verla).
    if (window.IntersectionObserver) {
      const observadorVisibilidad = new IntersectionObserver((entradas) => {
        entradas.forEach(entrada => {
          if (entrada.isIntersecting && !yaAnimoEntrada && scrollEl.scrollWidth > scrollEl.clientWidth + 2) {
            yaAnimoEntrada = true;
            reproducirRebendeEntrada();
            observadorVisibilidad.disconnect();
          }
        });
      }, { threshold: 0.6 });
      observadorVisibilidad.observe(control);
    }

    // Arrastrar el thumb con mouse o dedo
    let arrastrando = false;
    let inicioX = 0;
    let scrollInicial = 0;

    function iniciarArrastre(clientX) {
      thumb.classList.remove('sugerencia');
      arrastrando = true;
      inicioX = clientX;
      scrollInicial = scrollEl.scrollLeft;
      thumb.style.transition = 'none';
    }
    function moverArrastre(clientX) {
      if (!arrastrando) return;
      const anchoTrack = track.clientWidth;
      const anchoThumb = thumb.offsetWidth;
      const maxScrollLeft = scrollEl.scrollWidth - scrollEl.clientWidth;
      const maxThumbLeft = anchoTrack - anchoThumb;
      if (maxThumbLeft <= 0) return;
      const deltaX = clientX - inicioX;
      const deltaScroll = (deltaX / maxThumbLeft) * maxScrollLeft;
      scrollEl.scrollLeft = scrollInicial + deltaScroll;
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

    // Clic directo en el track (fuera del thumb) salta a esa posición
    track.addEventListener('click', (e) => {
      if (e.target === thumb) return;
      const rectTrack = track.getBoundingClientRect();
      const clicX = e.clientX - rectTrack.left;
      const anchoThumb = thumb.offsetWidth;
      const maxThumbLeft = track.clientWidth - anchoThumb;
      const nuevoProgreso = Math.min(Math.max((clicX - anchoThumb / 2) / maxThumbLeft, 0), 1);
      const maxScrollLeft = scrollEl.scrollWidth - scrollEl.clientWidth;
      scrollEl.scrollLeft = nuevoProgreso * maxScrollLeft;
    });

    // Flechas — avanzan un poco el scroll en esa dirección, sin
    // pasarse nunca del límite real (izquierda: 0, derecha: máximo)
    control.querySelectorAll('.ct-scroll-flecha').forEach(btn => {
      btn.addEventListener('click', () => {
        const dir = parseInt(btn.getAttribute('data-dir'));
        const maxScrollLeft = scrollEl.scrollWidth - scrollEl.clientWidth;
        const destino = Math.min(Math.max(scrollEl.scrollLeft + dir * 120, 0), maxScrollLeft);
        scrollEl.scrollTo({ left: destino, behavior: 'smooth' });
      });
    });
  }


  // =========================================================
  // NODUS: cobros, pagos, gastos, moneda y exportación
  // =========================================================
  function postJSON(url, cuerpo) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
      .then(r => r.json().then(j => ({ ok: r.ok, j: j })))
      .then(x => (x.ok && !x.j.error) ? x.j : { error: x.j.error || 'No se pudo completar la operación.' });
  }

  function recargarTodo() {
    return cargarDatos().then(redibujarTodo);
  }

  function nodusModal(titulo, sub, cuerpoHtml, textoOk, alGuardar) {
    const fondo = document.createElement('div');
    fondo.className = 'nodus-modal-fondo';
    fondo.innerHTML = `<div class="nodus-modal" role="dialog" aria-label="${titulo}">
      <h3>${titulo}</h3>
      <p class="nodus-modal-sub">${sub}</p>
      <div>${cuerpoHtml}</div>
      <p class="nodus-error-form"></p>
      <div class="nodus-modal-pie">
        <button type="button" class="nodus-btn-sec" data-nm-cerrar>Cancelar</button>
        <button type="button" class="nodus-btn-pri" data-nm-ok>${textoOk}</button>
      </div></div>`;
    document.body.appendChild(fondo);
    const cerrar = () => fondo.remove();
    fondo.querySelector('[data-nm-cerrar]').addEventListener('click', cerrar);
    fondo.addEventListener('mousedown', e => { if (e.target === fondo) cerrar(); });
    const ok = fondo.querySelector('[data-nm-ok]');
    const err = fondo.querySelector('.nodus-error-form');
    ok.addEventListener('click', () => {
      err.textContent = '';
      ok.disabled = true;
      Promise.resolve(alGuardar(fondo)).then(res => {
        ok.disabled = false;
        if (res && res.error) { err.textContent = res.error; return; }
        cerrar();
        return recargarTodo();
      }).catch(() => { ok.disabled = false; err.textContent = 'No se pudo guardar. Revisa tu conexión.'; });
    });
  }

  function fechaHoyISO() {
    const h = DATOS.hoy || [new Date().getFullYear(), new Date().getMonth(), new Date().getDate()];
    return h[0] + '-' + String(h[1] + 1).padStart(2, '0') + '-' + String(h[2]).padStart(2, '0');
  }

  function opcionesDiarios(tipos) {
    const lista = DATOS.diarios.filter(j => tipos.indexOf(j.tipo) !== -1);
    return lista.length ? lista.map(j => `<option value="${j.id}">${j.nombre}</option>`).join('') : '<option value="">No hay cuentas de banco o caja</option>';
  }

  // Cobrar / Pagar una factura pendiente
  document.addEventListener('click', function (e) {
    const b = e.target.closest('[data-pagar]');
    if (!b) return;
    const cobro = b.getAttribute('data-pagar') === 'cxc';
    const id = parseInt(b.getAttribute('data-id'), 10);
    const f = (cobro ? DATOS.cxc : DATOS.cxp).find(x => x.id === id);
    if (!f) return;
    const saldo = Math.round((f.total - f.abonado) * 100) / 100;
    const cuerpo = `
      <label>${cobro ? 'Monto cobrado' : 'Monto pagado'}</label>
      <input type="number" step="0.01" min="0" id="nm-monto" value="${saldo}">
      <label>Fecha</label>
      <input type="date" id="nm-fecha" value="${fechaHoyISO()}">
      <label>${cobro ? 'Entra a' : 'Sale de'}</label>
      <select id="nm-diario">${opcionesDiarios(['bank', 'cash'])}</select>
      <label>Referencia (opcional)</label>
      <input type="text" id="nm-ref" placeholder="Ej. transferencia 00123">`;
    nodusModal(cobro ? 'Registrar cobro' : 'Registrar pago', `${f.tercero} · ${f.factura} · Saldo ${fmt(saldo)}`, cuerpo,
      cobro ? 'Registrar cobro' : 'Registrar pago', function (m) {
        const monto = parseFloat(m.querySelector('#nm-monto').value) || 0;
        return postJSON('/nodus/api/contabilidad/pagar', {
          moneda: MONEDA, facturaId: id, monto: monto, liquidar: Math.abs(monto - saldo) < 0.005,
          fecha: m.querySelector('#nm-fecha').value, diarioId: m.querySelector('#nm-diario').value,
          referencia: m.querySelector('#nm-ref').value.trim()
        });
      });
  });

  // Registrar un gasto
  document.addEventListener('click', function (e) {
    if (!e.target.closest('#ct-btn-gasto')) return;
    const proveedores = Array.from(new Set(DATOS.cxp.map(x => x.tercero)));
    // Tipo de gasto sugerido: la cuenta general de gastos (no una de pérdidas ni de costos)
    const cuentaPorDefecto = DATOS.cuentasGasto.find(c => /^gastos?$/i.test(c.nombre.trim())) || DATOS.cuentasGasto.find(c => /gasto/i.test(c.nombre) && !/p.rdida|costo/i.test(c.nombre)) || DATOS.cuentasGasto[0];
    const cuerpo = `
      <label>Proveedor</label>
      <input type="text" id="nm-proveedor" list="nm-lista-prov" placeholder="Nombre del proveedor" autocomplete="off">
      <datalist id="nm-lista-prov">${proveedores.map(p => `<option value="${p}"></option>`).join('')}</datalist>
      <label>Concepto</label>
      <input type="text" id="nm-concepto" placeholder="Ej. Pago de alquiler octubre">
      <label>Tipo de gasto</label>
      <select id="nm-cuenta">${DATOS.cuentasGasto.map(c => `<option value="${c.codigo}"${c === cuentaPorDefecto ? ' selected' : ''}>${c.codigo} - ${c.nombre}</option>`).join('')}</select>
      <label>Monto</label>
      <input type="number" step="0.01" min="0" id="nm-monto" placeholder="0.00">
      <label>Fecha</label>
      <input type="date" id="nm-fecha" value="${fechaHoyISO()}">
      <label>Referencia (opcional)</label>
      <input type="text" id="nm-ref" placeholder="Ej. FAC-2245">
      <label class="nodus-check"><input type="checkbox" id="nm-pagado" checked> Ya lo pagué</label>
      <label>Pagado con</label>
      <select id="nm-diario">${opcionesDiarios(['bank', 'cash'])}</select>`;
    nodusModal('Registrar gasto', 'Se guarda como factura de proveedor y, si ya lo pagaste, se registra el pago.', cuerpo, 'Registrar gasto', function (m) {
      const pagado = m.querySelector('#nm-pagado').checked;
      return postJSON('/nodus/api/contabilidad/gasto', {
        moneda: MONEDA, proveedorNombre: m.querySelector('#nm-proveedor').value.trim(), concepto: m.querySelector('#nm-concepto').value.trim(),
        cuentaGasto: m.querySelector('#nm-cuenta').value, monto: parseFloat(m.querySelector('#nm-monto').value) || 0,
        fecha: m.querySelector('#nm-fecha').value, referencia: m.querySelector('#nm-ref').value.trim(),
        pagado: pagado, diarioId: pagado ? m.querySelector('#nm-diario').value : null
      });
    });
  });

  // Asentar un borrador
  document.addEventListener('click', function (e) {
    const b = e.target.closest('[data-asentar]');
    if (!b || b.disabled) return;
    b.disabled = true;
    postJSON('/nodus/api/contabilidad/asientos/' + parseInt(b.getAttribute('data-asentar'), 10) + '/asentar', {}).then(res => {
      if (res.error) { b.disabled = false; window.alert(res.error); return; }
      return recargarTodo();
    });
  });

  // Ver todo en $ o en Bs
  const btnMoneda = document.getElementById('conta-btn-moneda');
  function textoBtnMoneda() {
    if (btnMoneda) btnMoneda.lastChild.textContent = MONEDA === 'usd' ? ' Ver en Bs.' : ' Ver en $';
  }
  if (btnMoneda) {
    textoBtnMoneda();
    btnMoneda.addEventListener('click', function () {
      MONEDA = MONEDA === 'usd' ? 'bs' : 'usd';
      textoBtnMoneda();
      recargarTodo();
    });
  }

  // Exportar la vista activa a CSV (todas las filas, no solo la página visible)
  window.nodusExportar = function () {
    const act = document.querySelector('.conta-vista.activa');
    if (!act) return;
    const id = act.id.replace('vista-', '');
    if (!constructores[id]) return;
    window.__nodusExportando = true;
    let html = '';
    try { html = constructores[id](); } finally { window.__nodusExportando = false; }
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const filas = [];
    const texto = (c) => c.textContent.replace(/\s+/g, ' ').trim();
    if (tmp.querySelector('table')) {
      tmp.querySelectorAll('table tr').forEach(tr => filas.push(Array.from(tr.children).map(texto)));
    } else {
      tmp.querySelectorAll('.ct-nodo-header, .ct-nivel-3, .ct-cascada-fila, .ct-total-general').forEach(el => filas.push(Array.from(el.children).map(texto)));
    }
    if (!filas.length) return;
    const csv = filas.map(f => f.map(c => '"' + c.replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'contabilidad-' + id + '-' + fechaHoyISO() + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };


  function irAVista(idVista) {
    document.querySelectorAll('.conta-vista').forEach(v => {
      v.classList.toggle('activa', v.id === 'vista-' + idVista);
    });
    document.querySelectorAll('.conta-tab-btn').forEach(t => {
      t.classList.toggle('activo', t.getAttribute('data-vista') === idVista);
    });
    document.querySelectorAll('.conta-btn-superior').forEach(b => {
      b.classList.toggle('activo', b.getAttribute('data-vista') === idVista);
    });

    if (window.hadeonContabilidad && window.hadeonContabilidad.renderKPIs) {
      window.hadeonContabilidad.renderKPIs(kpisPorVista[idVista] || []);
    }

    const contenedor = document.getElementById('vista-' + idVista);
    if (!contenedor) return;

    if (constructores[idVista] && contenedor.dataset.cargado !== 'true') {
      contenedor.innerHTML = constructores[idVista]();
      contenedor.dataset.cargado = 'true';
      activarInteracciones(idVista, contenedor);
      return;
    }

    if (contenedor.children.length === 0) {
      contenedor.innerHTML = `
        <div class="conta-placeholder">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="9" y1="9" x2="15" y2="9"></line><line x1="9" y1="13" x2="15" y2="13"></line><line x1="9" y1="17" x2="12" y2="17"></line></svg>
          <h3>${contenedor.getAttribute('data-titulo')}</h3>
          <p>Esta vista está en construcción — se agrega en el siguiente paso.</p>
        </div>
      `;
    }
  }

  // =========================================================
  // EXPANSIÓN EN SITIO (mismo patrón del contenedor de
  // escritorio de Ventas) — el propio .conta-panel se congela
  // en su posición actual, y luego anima hasta ocupar una
  // ventana grande centrada. Solo lo disparan los 3 botones
  // superiores (Asientos contables, Balance de comprobación,
  // Libro diario). Las 5 pestañas principales siguen
  // cambiando de contenido normal dentro del panel, sin
  // expandirlo.
  // =========================================================
  const contaPanel = document.querySelector('.conta-panel');

  // Contenedor interno — el ÚNICO que de verdad scrollea. El
  // .conta-panel (exterior) se queda quieto, así que el carril
  // que vive ahí (hijo directo del exterior) no se mueve con el
  // contenido, se queda fijo mientras solo lo de adentro se desliza.
  const contaPanelInner = document.createElement('div');
  contaPanelInner.id = 'conta-panel-inner';
  while (contaPanel.firstChild) {
    contaPanelInner.appendChild(contaPanel.firstChild);
  }
  contaPanel.appendChild(contaPanelInner);

  const estilosExpansion = document.createElement('style');
  estilosExpansion.textContent = `
    #conta-panel-inner {
      height: 100%;
      overflow-y: auto;
      scrollbar-width: none;
    }
    #conta-panel-inner::-webkit-scrollbar { display: none; width: 0; height: 0; }
    .conta-panel {
      transition: none;
    }
    .conta-panel.expandiendo {
      z-index: 99990 !important;
      background: #ffffff !important;
      box-shadow: 0 24px 60px rgba(0,0,0,0.18) !important;
      padding: 28px !important;
    }
    #conta-panel-fondo {
      position: fixed; inset: 0; z-index: 99980;
      background: rgba(25, 27, 34, 0.4);
      backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
      opacity: 0; pointer-events: none; transition: opacity 0.35s ease;
    }
    #conta-panel-fondo.activo { opacity: 1; pointer-events: all; }
    #conta-panel-cerrar {
      display: none;
      position: absolute; top: 8px; right: 8px;
      background: none !important; border: none !important; cursor: pointer;
      color: #191b22 !important; padding: 8px 4px; border-radius: 9999px; z-index: 5;
      outline: none !important;
      transition: color 0.15s ease, transform 0.15s ease;
    }
    .conta-panel.expandiendo #conta-panel-cerrar { display: flex; }
    #conta-panel-cerrar:hover,
    #conta-panel-cerrar:focus {
      color: #ba1a1a !important;
      transform: scale(1.1);
    }
    #conta-panel-cerrar:focus:not(:hover) {
      color: #191b22 !important;
      transform: none;
    }
  `;
  document.head.appendChild(estilosExpansion);

  const fondoExpansion = document.createElement('div');
  fondoExpansion.id = 'conta-panel-fondo';
  document.body.appendChild(fondoExpansion);

  const btnCerrarPanel = document.createElement('button');
  btnCerrarPanel.id = 'conta-panel-cerrar';
  btnCerrarPanel.type = 'button';
  btnCerrarPanel.setAttribute('aria-label', 'Cerrar');
  btnCerrarPanel.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
  contaPanel.appendChild(btnCerrarPanel);

  // Carril propio de scroll vertical (azul, integrado al panel,
  // en vez de la barra nativa flotando encima del contenido)
  const trackPanelScroll = document.createElement('div');
  trackPanelScroll.className = 'conta-panel-scroll-track';
  const thumbPanelScroll = document.createElement('div');
  thumbPanelScroll.className = 'conta-panel-scroll-thumb';
  trackPanelScroll.appendChild(thumbPanelScroll);
  contaPanel.appendChild(trackPanelScroll);

  function actualizarThumbPanel() {
    const necesitaScroll = contaPanelInner.scrollHeight > contaPanelInner.clientHeight + 2;
    trackPanelScroll.classList.toggle('necesario', necesitaScroll);

    const maxScrollTopPanel = contaPanelInner.scrollHeight - contaPanelInner.clientHeight;
    aplicarMascara(contaPanelInner, [
      calcularDegradadoEje('to bottom', contaPanelInner.scrollTop, maxScrollTopPanel)
    ]);

    if (!necesitaScroll) return;

    const altoTrack = trackPanelScroll.clientHeight;
    const proporcionVisible = contaPanelInner.clientHeight / contaPanelInner.scrollHeight;
    const altoThumb = Math.max(altoTrack * proporcionVisible, 40);
    const maxScrollTop = contaPanelInner.scrollHeight - contaPanelInner.clientHeight;
    const progreso = maxScrollTop > 0 ? contaPanelInner.scrollTop / maxScrollTop : 0;
    const maxThumbTop = altoTrack - altoThumb;

    thumbPanelScroll.style.height = altoThumb + 'px';
    thumbPanelScroll.style.top = (progreso * maxThumbTop) + 'px';
  }

  contaPanelInner.addEventListener('scroll', actualizarThumbPanel, { passive: true });
  window.addEventListener('resize', actualizarThumbPanel);

  let arrastrandoPanel = false;
  let inicioYPanel = 0;
  let scrollInicialPanel = 0;

  thumbPanelScroll.addEventListener('mousedown', (e) => {
    e.preventDefault();
    arrastrandoPanel = true;
    inicioYPanel = e.clientY;
    scrollInicialPanel = contaPanelInner.scrollTop;
  });
  document.addEventListener('mousemove', (e) => {
    if (!arrastrandoPanel) return;
    const altoTrack = trackPanelScroll.clientHeight;
    const altoThumb = thumbPanelScroll.offsetHeight;
    const maxThumbTop = altoTrack - altoThumb;
    if (maxThumbTop <= 0) return;
    const maxScrollTop = contaPanelInner.scrollHeight - contaPanelInner.clientHeight;
    const deltaY = e.clientY - inicioYPanel;
    contaPanelInner.scrollTop = scrollInicialPanel + (deltaY / maxThumbTop) * maxScrollTop;
  });
  document.addEventListener('mouseup', () => { arrastrandoPanel = false; });

  thumbPanelScroll.addEventListener('touchstart', (e) => {
    arrastrandoPanel = true;
    inicioYPanel = e.touches[0].clientY;
    scrollInicialPanel = contaPanelInner.scrollTop;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!arrastrandoPanel) return;
    const altoTrack = trackPanelScroll.clientHeight;
    const altoThumb = thumbPanelScroll.offsetHeight;
    const maxThumbTop = altoTrack - altoThumb;
    if (maxThumbTop <= 0) return;
    const maxScrollTop = contaPanelInner.scrollHeight - contaPanelInner.clientHeight;
    const deltaY = e.touches[0].clientY - inicioYPanel;
    contaPanelInner.scrollTop = scrollInicialPanel + (deltaY / maxThumbTop) * maxScrollTop;
  }, { passive: true });
  document.addEventListener('touchend', () => { arrastrandoPanel = false; });

  trackPanelScroll.addEventListener('click', (e) => {
    if (e.target === thumbPanelScroll) return;
    const rectTrack = trackPanelScroll.getBoundingClientRect();
    const clicY = e.clientY - rectTrack.top;
    const altoThumb = thumbPanelScroll.offsetHeight;
    const maxThumbTop = trackPanelScroll.clientHeight - altoThumb;
    const nuevoProgreso = Math.min(Math.max((clicY - altoThumb / 2) / maxThumbTop, 0), 1);
    const maxScrollTop = contaPanelInner.scrollHeight - contaPanelInner.clientHeight;
    contaPanelInner.scrollTop = nuevoProgreso * maxScrollTop;
  });

  const spacerPanel = document.createElement('div');
  let panelEnAnimacion = false;
  let vistaAntesDeExpandir = 'libro-mayor';

  function expandirPanel(idVista) {
    if (panelEnAnimacion || !constructores[idVista]) return;
    panelEnAnimacion = true;
    vistaAntesDeExpandir = document.querySelector('.conta-tab-btn.activo')?.getAttribute('data-vista') || 'libro-mayor';

    const rect = contaPanel.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const rightOffset = windowWidth - rect.right;

    spacerPanel.style.width = rect.width + 'px';
    spacerPanel.style.height = rect.height + 'px';
    contaPanel.parentNode.insertBefore(spacerPanel, contaPanel);

    contaPanel.style.setProperty('position', 'fixed', 'important');
    contaPanel.style.setProperty('top', rect.top + 'px', 'important');
    contaPanel.style.setProperty('right', rightOffset + 'px', 'important');
    contaPanel.style.setProperty('left', 'auto', 'important');
    contaPanel.style.setProperty('width', rect.width + 'px', 'important');
    contaPanel.style.setProperty('height', rect.height + 'px', 'important');
    contaPanel.style.setProperty('margin', '0', 'important');
    contaPanel.style.setProperty('overflow-y', 'auto', 'important');
    contaPanel.classList.add('expandiendo');

    // Mostrar el contenido pedido (reutiliza los mismos
    // constructores que usan las pestañas normales)
    irAVista(idVista);

    fondoExpansion.classList.add('activo');
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // El alto se ajusta al contenido real, con 90vh como techo
        // máximo — no siempre ocupa toda esa altura si el contenido
        // es más corto (ej. un solo asiento en vez de la lista larga).
        // Hay un mínimo de 70vh en cualquier tamaño de pantalla —
        // para que un contenido corto no deje la tarjeta chiquita
        // flotando con mucho espacio vacío alrededor.
        const alturaMaxima = window.innerHeight * 0.9;
        const alturaMinima = window.innerHeight * 0.7;
        const alturaContenido = Math.min(Math.max(contaPanelInner.scrollHeight, alturaMinima), alturaMaxima);

        // Centrado vertical real: si el contenido es más corto que
        // el techo máximo, se centra en la pantalla en vez de quedar
        // pegado arriba con espacio vacío abajo
        const margenMinimo = window.innerHeight * 0.05;
        const topCentrado = Math.max((window.innerHeight - alturaContenido) / 2, margenMinimo);

        contaPanel.style.setProperty('transition', 'all 0.45s cubic-bezier(0.16, 1, 0.3, 1)', 'important');
        contaPanel.style.setProperty('top', topCentrado + 'px', 'important');
        contaPanel.style.setProperty('right', '10vw', 'important');
        contaPanel.style.setProperty('width', '80vw', 'important');
        contaPanel.style.setProperty('height', alturaContenido + 'px', 'important');
        contaPanel.style.setProperty('max-height', '90vh', 'important');
        contaPanel.style.setProperty('border-radius', '33px', 'important');
        setTimeout(() => { panelEnAnimacion = false; actualizarThumbPanel(); }, 450);
      });
    });
  }

  function cerrarPanelExpandido() {
    if (panelEnAnimacion || !contaPanel.classList.contains('expandiendo')) return;
    panelEnAnimacion = true;

    fondoExpansion.classList.remove('activo');

    // Restauramos el contenido (y sus KPIs) ANTES de medir hacia
    // dónde encoger — así el spacer ya está en su posición final
    // real, y no en una posición intermedia que luego se corre.
    irAVista(vistaAntesDeExpandir);

    requestAnimationFrame(() => {
      const spacerRect = spacerPanel.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      const spacerRightOffset = windowWidth - spacerRect.right;

      contaPanel.style.setProperty('top', spacerRect.top + 'px', 'important');
      contaPanel.style.setProperty('right', spacerRightOffset + 'px', 'important');
      contaPanel.style.setProperty('width', spacerRect.width + 'px', 'important');
      contaPanel.style.setProperty('height', spacerRect.height + 'px', 'important');
      contaPanel.style.setProperty('border-radius', '16px', 'important');
    });

    setTimeout(() => {
      // Desvanecimiento breve justo en el "aterrizaje" — tapa el
      // cambio brusco de position:fixed a flujo normal (la limpieza
      // de estilos ocurre mientras está invisible, y luego reaparece)
      contaPanel.style.setProperty('transition', 'opacity 0.15s ease', 'important');
      contaPanel.style.setProperty('opacity', '0', 'important');

      setTimeout(() => {
        contaPanel.classList.remove('expandiendo');
        if (spacerPanel.parentNode) spacerPanel.remove();
        document.body.style.overflow = '';

        contaPanel.style.removeProperty('position');
        contaPanel.style.removeProperty('top');
        contaPanel.style.removeProperty('right');
        contaPanel.style.removeProperty('left');
        contaPanel.style.removeProperty('width');
        contaPanel.style.removeProperty('height');
        contaPanel.style.removeProperty('max-height');
        contaPanel.style.removeProperty('margin');
        contaPanel.style.removeProperty('overflow-y');
        contaPanel.style.removeProperty('border-radius');

        // Reaparece ya en su posición normal de flujo
        requestAnimationFrame(() => {
          contaPanel.style.setProperty('opacity', '1', 'important');
          setTimeout(() => {
            contaPanel.style.removeProperty('opacity');
            contaPanel.style.removeProperty('transition');
            panelEnAnimacion = false;
          }, 160);
        });
      }, 150);
    }, 450);
  }

  btnCerrarPanel.addEventListener('click', cerrarPanelExpandido);
  fondoExpansion.addEventListener('click', cerrarPanelExpandido);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && contaPanel.classList.contains('expandiendo')) cerrarPanelExpandido();
  });

  document.addEventListener('click', function (e) {
    const boton = e.target.closest('[data-vista]');
    if (!boton) return;
    e.preventDefault();

    if (boton.classList.contains('conta-btn-superior')) {
      expandirPanel(boton.getAttribute('data-vista'));
    } else {
      irAVista(boton.getAttribute('data-vista'));
    }
  });

  // =========================================================
  // BUSCADOR GLOBAL (#conta-buscador) -- filtra la vista activa.
  // No aplica a Balance general ni Estado de Resultados (son un
  // árbol/cascada fija de rubros, no una lista de filas), así que
  // en esas dos simplemente no hace nada.
  // =========================================================
  const buscadorConta = document.getElementById('conta-buscador');
  if (buscadorConta) {
    buscadorConta.addEventListener('input', function () {
      textoBusquedaActivo = buscadorConta.value.trim().toLowerCase();
      Object.keys(paginaActual).forEach(function (k) { paginaActual[k] = 1; });
      document.querySelectorAll('.conta-vista').forEach(function (v) { v.dataset.cargado = 'false'; });

      const vistaActivaEl = document.querySelector('.conta-vista.activa');
      if (!vistaActivaEl) return;
      const idVista = vistaActivaEl.id.replace('vista-', '');
      if (!constructores[idVista]) return;

      vistaActivaEl.innerHTML = constructores[idVista]();
      activarInteracciones(idVista, vistaActivaEl);
      vistaActivaEl.dataset.cargado = 'true';
    });
  }

  cargarDatos().then(() => irAVista('libro-mayor')).catch(err => {
    console.error('Error al cargar la contabilidad:', err);
    irAVista('libro-mayor');
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
