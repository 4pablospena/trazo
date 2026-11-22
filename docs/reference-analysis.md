# Referencia de Excalidraw y decisiones de implementación

Registro histórico de la fase 1, realizada el 21 de noviembre de 2026. Alcance: aplicación pública `https://excalidraw.com/`, sin sesión de usuario y con perfiles temporales nuevos. El estado actual de la implementación está en el [README](../README.md).

## Conexión y procedencia

Se actualizó únicamente el registro REA de Codex a `npx -y rea-agents@6.5.0 mcp`. REA creó la copia `/Users/pablosuarezpena/.codex/config.toml.rea.backup`. La skill instalada ya coincidía y el plan no propuso reemplazarla. No se instalaron motores nativos: esta investigación utiliza navegador y JavaScript.

Las herramientas no se incorporaron dinámicamente a la lista nativa del chat. Se abrió una conexión local real al servidor MCP mediante `scripts/rea-mcp.mjs`, que realizó `initialize`, `tools/list` y `tools/call`. El servidor se identificó como `rea`, versión `6.5.0`; la herramienta utilizada fue `capture_browser_scenario`. Esta comprobación es independiente del diagnóstico del registro.

El cliente marca como fallo tanto los errores MCP como los pasos de escenario fallidos o cancelados. Un resultado MCP sin `isError` puede contener un escenario incompleto.

## Identidad de la referencia

El DOM capturado declara la versión `2026-11-19T19:01:22Z-2c3dcc0`. La revisión se corresponde con el [commit oficial 2c3dcc06ec807e81ab9437eceb1a8f7a3c590743](https://github.com/excalidraw/excalidraw/commit/2c3dcc06ec807e81ab9437eceb1a8f7a3c590743).

El registro npm devuelve `0.18.1` como versión estable y `0.18.0-2c3dcc0` como versión de desarrollo correspondiente a ese sufijo. Los metadatos seleccionados, incluidas las integridades de los tarballs, están en [npm-versions.json](evidence/npm-versions.json). La coincidencia de fecha y revisión declarada no acredita identidad byte a byte entre el sitio y el paquete.

## Observaciones del navegador

Escritorio: ventana de 1440 × 900, español de España, tema claro y movimiento reducido. Navegador observado: Chromium `158.0.8127.36`.

- Lienzo blanco a pantalla completa; barra de herramientas flotante centrada arriba, menú principal a la izquierda y biblioteca a la derecha.
- Controles inferiores de zoom, minimapa, deshacer y rehacer. Paleta violeta y paneles claros con esquinas redondeadas.
- Herramientas de selección, mano, rectángulo, diamante, elipse, flecha, línea, dibujo libre, texto, nota adhesiva y borrado.
- Al seleccionar rectángulo aparecen controles de trazo, fondo, grosor, estilo, bordes, opacidad y orden de capas.
- El menú principal ofrece abrir, guardar, exportar imagen, preferencias, búsqueda, paleta de comandos, idioma y tema. Se observó la existencia de esas opciones; no se ejecutaron sus operaciones de archivos.
- La biblioteca abre una barra lateral con estado vacío y enlace al repositorio público. Su botón `Cerrar` queda por encima del control que la abrió.
- El menú de herramientas adicionales incluye imágenes, estructuras, incrustaciones web, puntero láser, bote de pintura, lazo y Mermaid. También muestra entradas de IA; su presencia no acredita acceso funcional a esos servicios.

La captura estrecha usa 390 × 844 píxeles. La barra de herramientas se reorganiza y muestra una selección reducida de herramientas. Es una prueba de disposición de interfaz con viewport estrecho en Chrome de escritorio; no comprueba gestos táctiles, teclado virtual ni comportamiento de Safari móvil.

El escenario `note-edit` insertó una nota y escribió «Prueba de referencia REA». La revisión de sus capturas confirmó que deshacer retiró el texto conservando el fondo de la nota y rehacer restauró el texto. También se abrió el panel del minimapa; su miniatura no se dio por comprobada a partir de la captura inmediata del panel vacío.

## Evidencias

El índice generado [index.json](evidence/index.json) enlaza cada registro completo comprimido, su Evidence ID, el hash del JSON original y el estado de cada escenario. Los PNG se extraen de esas respuestas sin modificar sus píxeles. Las cadenas `ev_…` identifican registros REA; los archivos comprimidos conservan su contenido completo aunque termine la sesión MCP.

- Inicio de escritorio: `ev_80c9c61fc72fdbcd3737e72df7f04c03232c16aed85ac432e5d68087191c1023`.
- Herramientas, propiedades, menú y biblioteca: `ev_c78f87980ff1b06d9909b67a8bf1145822af2d440b1020883fc1b92aa0d37ce6`.
- Inicio con viewport estrecho: `ev_a3ce69567600a79cc8c1e086a915caa72fb78cfc2655d13d5b530387a85368a6`.
- Edición de nota y sus estados: `ev_ec8ebfd7761fcc88c32f7c265180bee00b6c3ac159cd92f76fdc0c3f06846664`.

Los escenarios completos no registraron eventos `page-errors` durante su ventana de captura. Esto no prueba ausencia de errores fuera de esa ventana. El proveedor informó de la terminación de sus procesos de navegador al finalizar.

Se verificaron 59 artefactos de las respuestas mediante su tamaño y SHA-256: DOM, árbol de accesibilidad y PNG. Se comprobó además que cada archivo comprimido recupera exactamente el JSON original. Los cuatro escenarios principales terminaron completos.

Dos intentos previos se conservaron como incompletos: un selector `canvas` encontró dos lienzos y un intento de cerrar la biblioteca pulsó un botón cubierto por la barra lateral. Los escenarios se corrigieron con el selector del lienzo interactivo y el botón `Cerrar`. Esos fallos de automatización no se presentan como defectos del producto.

## Base para la fase 2

Decisión: integrar el editor oficial con versión exacta `0.18.0-2c3dcc0`. La versión estable `0.18.1` no declara `stickynote` ni `minimapEnabled` en sus tipos; la versión elegida sí los declara. Esta comprobación es estática, además de la observación de la web. La integración en nuestra aplicación queda pendiente.

El [repositorio oficial](https://github.com/excalidraw/excalidraw) y el paquete npm declaran licencia MIT. Se conservarán los avisos y las licencias de los componentes distribuidos. La aplicación tendrá identidad propia.

La versión elegida cambia contratos respecto a la estable y a varios ejemplos de la documentación:

- Obtener la instancia con `onExcalidrawAPI(api | null)` y esperar `onInitialize(api)` para operar sobre una escena cargada.
- Utilizar `exportScene({ type, data, config })` para PNG, SVG o canvas, según los tipos de esta versión. No trasladar ejemplos antiguos de `exportToBlob` o `exportToSvg` sin revisar sus exports.
- `serializeAsJSON(elements, appState, files, "local")` permite archivos autocontenidos. El modo `"database"` omite las imágenes; si se usa, los binarios requieren persistencia propia.
- Comprobar las rutas de importación y tipos contra el paquete exacto instalado, en particular `common`, `element` y `math`.

Fuentes de los contratos: [tipos del editor](https://unpkg.com/@excalidraw/excalidraw@0.18.0-2c3dcc0/dist/types/excalidraw/types.d.ts), [exports públicos](https://unpkg.com/@excalidraw/excalidraw@0.18.0-2c3dcc0/dist/types/excalidraw/index.d.ts), [contrato de exportación](https://unpkg.com/@excalidraw/excalidraw@0.18.0-2c3dcc0/dist/types/excalidraw/scene/export.d.ts), [licencia](https://github.com/excalidraw/excalidraw/blob/master/LICENSE).

## Mejoras propuestas

Estas decisiones pertenecen a nuestra aplicación y no se atribuyen a REA:

- Gestión de varios tableros con nombre, búsqueda, duplicado y fecha de modificación.
- Guardado automático con estado visible; persistencia en IndexedDB de elementos, estado persistible e imágenes. Capturar la escena pendiente antes de cambiar de tablero y aislar el historial de cada uno.
- Biblioteca reutilizable y plantillas iniciales de diagramas, planificación y notas.
- Exportación e importación de archivos `.excalidraw`; exportación visual en PNG y SVG. Copias descargables para recuperar el trabajo si el almacenamiento del navegador se pierde.
- Interfaz en español, fuentes locales y controles propios que respeten el espacio de las herramientas originales.

El alcance inicial es de uso local en el navegador. La colaboración entre personas, las cuentas, la sincronización entre dispositivos y los servicios de IA requieren trabajo adicional y no se consideran implementados por incluir su interfaz.

## Definición de completado de las fases restantes

Fase 2: la aplicación arranca y permite crear, nombrar, abrir, duplicar y eliminar tableros; dibujar con el editor real; elegir plantillas; conservar escenas, biblioteca e imágenes tras recargar; informar de fallos de guardado.

Fase 3: comprobación de dibujo, notas, deshacer/rehacer, cambios de tablero, recarga, imágenes, importación y exportación; revisión en escritorio y viewport estrecho; TypeScript y compilación correctos; README con instrucciones reproducibles. Se comprobará que un fallo o importación inválida no borre el tablero activo.

Al cerrar la fase 1 todavía no se había ejecutado código de la nueva aplicación. Las capturas de la web de referencia no sustituyen sus comprobaciones.
