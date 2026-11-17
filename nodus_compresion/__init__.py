# Compresión gzip de las respuestas de Odoo (módulo de servidor: server_wide_modules en odoo.conf).
# Odoo no comprime nada y el proxy de Easypanel tampoco: los paquetes de JS/CSS viajaban sin comprimir
# (~8,7 MB la primera carga; comprimidos ~2 MB). Se comprime texto, JS, CSS, JSON y SVG si el navegador
# acepta gzip; lo demás (PDF, imágenes, archivos, websocket) pasa tal cual sin tocarse.
# Los paquetes /web/assets/ son inmutables (llevan su versión en la URL): se guardan ya comprimidos.
import gzip
import threading
from collections import OrderedDict
from itertools import chain

from odoo import http

TIPOS = ("text/", "application/javascript", "application/json", "application/xml", "image/svg+xml")
MINIMO = 1024
_original = http.Application.__call__
_cache = OrderedDict()
_cache_lock = threading.Lock()
_CACHE_MAX = 40


def _cabecera(headers, nombre):
    nombre = nombre.lower()
    for k, v in headers:
        if k.lower() == nombre:
            return v
    return None


def __call__(self, environ, start_response):
    if ("gzip" not in (environ.get("HTTP_ACCEPT_ENCODING") or "") or environ.get("HTTP_UPGRADE")
            or environ.get("REQUEST_METHOD") == "HEAD"):
        return _original(self, environ, start_response)

    guardado = {}
    escrito = []

    def sr(status, headers, exc_info=None):
        guardado.update(status=status, headers=list(headers), exc_info=exc_info)
        return escrito.append

    resultado = _original(self, environ, sr)
    status, headers = guardado.get("status"), guardado.get("headers", [])
    tipo = (_cabecera(headers, "Content-Type") or "").lower()
    comprimible = (status and status.startswith("200") and tipo.startswith(TIPOS)
                   and not _cabecera(headers, "Content-Encoding"))
    if not comprimible:
        start_response(status, headers, guardado.get("exc_info"))
        return chain(escrito, resultado) if escrito else resultado

    try:
        cuerpo = b"".join(chain(escrito, resultado))
    finally:
        if hasattr(resultado, "close"):
            resultado.close()
    if len(cuerpo) < MINIMO:
        start_response(status, headers)
        return [cuerpo]

    ruta = environ.get("PATH_INFO") or ""
    clave = ruta if ruta.startswith("/web/assets/") else None
    comprimido = None
    if clave:
        with _cache_lock:
            comprimido = _cache.get(clave)
            if comprimido is not None:
                _cache.move_to_end(clave)
    if comprimido is None:
        comprimido = gzip.compress(cuerpo, 6)
        if clave:
            with _cache_lock:
                _cache[clave] = comprimido
                while len(_cache) > _CACHE_MAX:
                    _cache.popitem(last=False)

    headers = [(k, v) for k, v in headers if k.lower() not in ("content-length", "content-encoding")]
    vary = _cabecera(headers, "Vary")
    headers = [(k, v) for k, v in headers if k.lower() != "vary"]
    headers += [("Content-Encoding", "gzip"), ("Content-Length", str(len(comprimido))),
                ("Vary", (vary + ", Accept-Encoding") if vary else "Accept-Encoding")]
    start_response(status, headers)
    return [comprimido]


http.Application.__call__ = __call__
