/** @odoo-module **/
// Entorno de una pantalla propia de Nodus. La lógica de cada pantalla se escribió para vivir en su propia
// página (un iframe del tamaño de la tarjeta). Aquí sigue creyéndolo:
//  - "window" y "document" miden la tarjeta (ancho, alto, matchMedia, resize) y "body" es la pantalla;
//  - lo que la pantalla guarda en window (hadeonPOS, candados, funciones...) se deshace al salir, para que
//    volver a entrar la encuentre como nueva;
//  - escuchas y temporizadores se quitan al salir.

export function crearEntorno(raiz) {
    const limpiar = [];
    const realDoc = globalThis.document;
    const realWin = globalThis.window;
    const pendientes = [];
    const escritas = new Map(); // prop -> valor que tenía antes de que la pantalla la escribiera

    const alCambiarTamano = (fn) => {
        const ro = new ResizeObserver(() => fn());
        ro.observe(raiz);
        limpiar.push(() => ro.disconnect());
    };
    const registrar = (obj, tipo, fn, opc) => {
        if (tipo === "DOMContentLoaded" || tipo === "load") {
            pendientes.push(fn);
            return;
        }
        if (tipo === "resize" && obj === realWin) {
            alCambiarTamano(() => fn(new Event("resize")));
        }
        obj.addEventListener(tipo, fn, opc);
        limpiar.push(() => obj.removeEventListener(tipo, fn, opc));
    };
    const matchMedia = (q) => {
        const reglas = [...q.matchAll(/\((max|min)-width:\s*(\d+(?:\.\d+)?)px\)/g)];
        const evalua = () => reglas.every(([, t, v]) => (t === "max" ? raiz.clientWidth <= +v : raiz.clientWidth >= +v));
        const oyentes = new Set();
        let antes = evalua();
        alCambiarTamano(() => {
            const ahora = evalua();
            if (ahora !== antes) {
                antes = ahora;
                oyentes.forEach((f) => f({ matches: ahora, media: q }));
            }
        });
        return {
            media: q,
            get matches() { return evalua(); },
            addEventListener: (t, f) => t === "change" && oyentes.add(f),
            removeEventListener: (t, f) => oyentes.delete(f),
            addListener: (f) => oyentes.add(f),
            removeListener: (f) => oyentes.delete(f),
        };
    };
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
    const envolver = (real) => new Proxy(real, {
        get(obj, prop) {
            if (prop === "addEventListener") return (t, f, o) => registrar(obj, t, f, o);
            if ((prop === "body" || prop === "documentElement") && obj === realDoc) return raiz;
            if (obj === realWin) {
                if (prop === "innerWidth") return raiz.clientWidth;
                if (prop === "innerHeight") return raiz.clientHeight;
                if (prop === "matchMedia") return matchMedia;
                if (prop === "setInterval") return setInterval;
                if (prop === "setTimeout") return setTimeout;
            }
            const v = Reflect.get(obj, prop);
            return typeof v === "function" && !/^[A-Z]/.test(String(prop)) ? v.bind(obj) : v;
        },
        set(obj, prop, valor) {
            if (obj === realWin && !escritas.has(prop)) escritas.set(prop, Object.getOwnPropertyDescriptor(obj, prop));
            obj[prop] = valor;
            return true;
        },
    });

    return {
        document: envolver(realDoc),
        window: envolver(realWin),
        matchMedia,
        setInterval,
        setTimeout,
        arrancar: () => pendientes.forEach((fn) => fn.call(realDoc, new Event("DOMContentLoaded"))),
        detener: () => {
            limpiar.forEach((f) => f());
            escritas.forEach((antes, prop) => (antes ? Object.defineProperty(realWin, prop, antes) : delete realWin[prop]));
        },
    };
}
