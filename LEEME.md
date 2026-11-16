# Nodus sobre Odoo 19

Módulos de Nodus para Odoo 19 Community:

- **`nodus_interfaz`**: la interfaz de Nodus dentro de Odoo, con el diseño de hadeon_ui.
  - Barra lateral en PC, bóveda en teléfono y menú principal.
  - Pantallas propias: Punto de Venta, Comandas, Configuración, Contabilidad, Contactos e Inventario.
  - Flujos de venta y compra en un paso, con el cliente buscado por cédula o RIF y cobros en Bs y $ a tasa BCV.
  - Documentos PDF con formato Nodus.
- **`nodus_acceso`**: candado opcional para compartir un Odoo local por un túnel con un enlace secreto. Solo se activa si se carga como módulo de servidor; en desarrollo no hace falta.

Va encima de **Odoo-basico**, que trae `hadeon_standard` (localización venezolana, BCV, doble moneda, niveles de precio y HKA), y del **Taller** (`auto_repair_workshop`).

## Entorno de desarrollo con Docker

1. Clona los tres repos en la misma carpeta:

   ```
   mi-carpeta/
   ├── nodus-odoo      ← este repo
   ├── Odoo-basico     ← git@github.com:Rese4248/Odoo-basico.git
   └── Nodus_Taller    ← git@github.com:Rese4248/Nodus_Taller.git
   ```

2. Levanta el entorno desde la carpeta de este repo:

   ```
   docker compose up -d --build
   ```

   Odoo queda en http://localhost:8079. Usa la imagen de producción de Odoo-basico y monta este repo y el Taller, así que lo que edites aquí lo ve Odoo.

3. Restaura la base de pruebas:
   - Entra a http://localhost:8079/web/database/manager y usa **Restore Database**.
   - Archivo: `datos/nodus_prueba.zip`. Nombre de la base: `nodus_prueba`. Elige **This database is a copy**.
   - La clave maestra es `cambia-esta-clave`, que está en `docker/odoo.conf`; cámbiala en tu copia.

   La base es en bolívares, con tasa BCV, datos de taller, ventas, compras y contactos con cédula.

   Usuarios:
   - `admin` con clave `admin`: soporte, ve todo.
   - `cliente@nodus.test` con clave `cliente`: vista del cliente.

## Día a día

- **Vistas, plantillas y CSS:** el entorno corre con `--dev=xml`. Recarga el navegador; si es CSS o JS, recarga con Ctrl+Shift+R.
- **Python, manifiesto o datos:** actualiza el módulo y reinicia Odoo.

  ```
  docker compose exec odoo odoo -d nodus_prueba -u nodus_interfaz --stop-after-init --db_host db --db_user odoo --db_password odoo
  docker compose restart odoo
  ```

- **Registro de Odoo:**

  ```
  docker compose logs -f odoo
  ```

## Reglas de la interfaz

- Todo tiene que verse como parte de Nodus, nunca con el aspecto de Odoo. Eso incluye los documentos PDF, los textos y las pantallas vacías.
- Debe funcionar en PC, tablet y teléfono, en vertical y en horizontal.
- Debe funcionar sin scroll horizontal cuando el contenido cabe.
- El margen inferior debe medir lo mismo que los laterales.
- Las barras de desplazamiento no tocan las esquinas redondeadas. No uses `scrollbar-width: thin`.
- Todo lo que se desplaza lleva el degradado de Nodus (`nodus_degradado.js`).
- Los flujos son de un paso. Monedas: solo bolívares y dólares a tasa BCV.
- Los textos van en español con tuteo.
- Prueba en `nodus_prueba`; nunca en bases de clientes.

## Ramas

Trabaja en una rama propia (`git checkout -b mi-cambio`) y abre un pull request hacia `main`.
