# Pruebas de conversión en navegador

Con `npm run dev` activo, abrir:

`http://127.0.0.1:5173/tests/browser/document-conversion.html`

La página muestra **Pruebas superadas** o el error concreto. Utiliza las implementaciones reales de Excalidraw y Mermaid to Excalidraw, canvas, DOMParser e IndexedDB.

Comprueba varios diagramas con identificadores de origen repetidos, enlaces de flechas y etiquetas, orden de los bloques sin solapamiento, texto editable, rechazo de una conversión parcialmente inválida, restauración de escenas e imágenes y cancelación.

Las bases de datos llevan nombres aleatorios con prefijo `trazo-conversion-test-` y se eliminan al terminar. La página no abre la base de datos de la aplicación.

Para ejecutar el escenario con REA 6.5.0 y Chrome en macOS:

```sh
node scripts/rea-mcp.mjs call capture_browser_scenario tests/browser/document-conversion.scenario.json .research/document-tests.json
```

El escenario espera a que termine la página. Revisar su salida de accesibilidad: debe contener **Pruebas superadas**. Un escenario MCP completado no sustituye esa comprobación del resultado de las pruebas.

El escenario adicional `document-import-ui.scenario.json` verifica el diálogo de la aplicación, la corrección de un Mermaid inválido, la vista previa, la creación del tablero y su recuperación al recargar. Ambos escenarios usan perfiles nuevos propiedad del proveedor.


## MCP con la aplicación real

Con Trazo sirviendo en `http://127.0.0.1:5173/`, Chrome instalado y REA disponible, deja libre el puerto 5174 y ejecuta:

```sh
node tests/browser/mcp-live.mjs
```

Para comprobar una compilación servida por `npm run preview`, usa `TRAZO_TEST_APP_URL=http://127.0.0.1:4173/ node tests/browser/mcp-live.mjs`.

La prueba arranca su propio servidor MCP con claves y códigos temporales. REA abre un perfil de Chrome aislado y vincula el navegador mediante el diálogo real. El SDK oficial realiza llamadas HTTP para crear, leer, modificar, renombrar, convertir, exportar y eliminar tableros. También crea y revoca claves desde el panel, comprueba la conexión, copia las configuraciones de los tres clientes y el comando de Codex, verifica que cerrar el panel elimina el secreto de su memoria y que la clave revocada deja de autenticar. Comprueba el botón Deshacer del editor, el rechazo de revisiones antiguas, los archivos de imágenes y la recuperación del dibujo y del enlace tras recargar.

El resultado debe ser `passed: true` en `.research/mcp-live-report.json`. El escenario y las evidencias quedan en `.research/mcp-live-scenario.json` y `.research/mcp-live-evidence.json`. El código del escenario es temporal y de un solo uso; la clave API no se escribe en esos archivos. La prueba cierra su servidor y elimina la base de claves al terminar. No utiliza claves personales ni abre el almacenamiento del navegador habitual.

Si ya utilizas el puerto 5174, ejecuta `TRAZO_TEST_MCP_PORT=5184 node tests/browser/mcp-live.mjs`. La prueba abre un enlace de un solo uso y comprueba que el panel se abre con el código preparado, sin copiarlo manualmente.
