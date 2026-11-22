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
