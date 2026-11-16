# Candado para compartir el Odoo local de Nodus por un enlace (túnel de Cloudflare).
# Módulo de servidor (server_wide_modules en odoo.conf): envuelve TODA petición HTTP, antes de Odoo.
#  - Desde esta PC (localhost / 127.0.0.1 sin cabeceras de Cloudflare): pasa igual que siempre.
#  - Desde fuera: solo con la cookie que deja el enlace secreto  https://<túnel>/?llave=<llave>
#    (lleva al inicio de sesión de nodus_prueba). Sin ella, "No encontrado" (ni login, ni gestor
#    de bases de datos, ni archivos).
# La llave va en odoo.conf: nodus_llave_acceso = ...  (vacía = candado apagado para todos).
import hashlib
import hmac
from urllib.parse import parse_qs

from werkzeug.wrappers import Response

from odoo import http
from odoo.tools import config

COOKIE = "nodus_acceso"
LOCALES = {"localhost", "127.0.0.1", "::1"}
BASE = "nodus_prueba"

_llamar_original = http.Application.__call__


def _firma(llave):
    return hmac.new(llave.encode(), b"nodus-acceso", hashlib.sha256).hexdigest()


def _es_local(environ):
    if any(k in environ for k in ("HTTP_CF_RAY", "HTTP_CF_CONNECTING_IP", "HTTP_X_FORWARDED_FOR")):
        return False
    host = (environ.get("HTTP_HOST") or "").rsplit(":", 1)[0].strip("[]").lower()
    return host in LOCALES and environ.get("REMOTE_ADDR") in LOCALES


def _cookie(environ):
    for parte in (environ.get("HTTP_COOKIE") or "").split(";"):
        nombre, _, valor = parte.strip().partition("=")
        if nombre == COOKIE:
            return valor
    return ""


def __call__(self, environ, start_response):
    llave = config.get("nodus_llave_acceso") or ""
    if not llave or _es_local(environ):
        return _llamar_original(self, environ, start_response)
    firma = _firma(llave)
    # El gestor de bases de datos (crear, copiar, borrar, respaldar) nunca desde fuera, ni con llave
    if (environ.get("PATH_INFO") or "").startswith(("/web/database", "/database")):
        return Response("No encontrado", status=404, mimetype="text/plain")(environ, start_response)
    if hmac.compare_digest(_cookie(environ), firma):
        return _llamar_original(self, environ, start_response)
    dada = (parse_qs(environ.get("QUERY_STRING") or "").get("llave") or [""])[0]
    if dada and hmac.compare_digest(dada.encode(), llave.encode()):
        r = Response(status=302, headers={"Location": "/web/login?db=%s" % BASE})
        r.set_cookie(COOKIE, firma, max_age=30 * 24 * 3600, httponly=True, secure=True, samesite="Lax")
        return r(environ, start_response)
    return Response("No encontrado", status=404, mimetype="text/plain")(environ, start_response)


http.Application.__call__ = __call__
