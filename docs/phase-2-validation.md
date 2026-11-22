# Fase 2: implementación y comprobaciones

Fecha: 21 de noviembre de 2026. Aplicación: Trazo `0.1.0`. La aplicación está implementada y su servidor de desarrollo usa `http://127.0.0.1:5173/`.

## Comprobaciones ejecutadas

- `npm test`: 7 pruebas correctas en 2 archivos.
- `npm run build`: TypeScript estricto y compilación de producción correctos.
- Servidor de desarrollo: respuesta HTTP 200 y editor de Excalidraw visible.
- Navegador a través del MCP de REA 6.5.0: tres escenarios funcionales y una revisión visual adicional completos, con perfiles nuevos y limpieza de los procesos propiedad del proveedor.

Las pruebas de almacenamiento verifican escenas con datos de imagen entre conexiones, rechazo atómico de escrituras y renombrados desde una pestaña desactualizada, eliminación sin resurrección por escrituras tardías y persistencia de nombres y biblioteca. Las pruebas de la cola verifican el orden de las escrituras, que se conserve el último cambio pendiente y que los fallos se puedan reintentar.

## Navegador de escritorio

Escenario `trazo-workspace`, 1440 × 900:

1. Cambiar el nombre del primer tablero.
2. Insertar una nota y escribir «Mi idea se conserva».
3. Crear otro tablero con la plantilla de diagrama de flujo.
4. Volver al tablero original.
5. Recargar la página y comprobar el nombre y el dibujo recuperados.

La captura final se revisó visualmente y muestra la nota con su texto después de la recarga.

Evidence ID: `ev_9a20959b2c9d9417d9ed7100582f3deae521dc1fb2930e45738a930aa073a35a`.

## Vista estrecha

Escenario `trazo-mobile`, viewport 390 × 844. Se revisaron la barra superior, los botones y la barra de dibujo inferior. La captura corresponde a Chrome con un viewport estrecho; no sustituye pruebas táctiles ni de Safari móvil.

Evidence ID: `ev_af3a5fd31e696582fdf091caee32caad1e87dbf62cf55a29d83d8ded3409f545`.

## Compilación de producción

Escenario `trazo-production`, servido temporalmente en `http://127.0.0.1:4173/`:

1. Crear un tablero con la plantilla de tareas.
2. Duplicarlo desde la lista de tableros.
3. Renombrar la copia con el diálogo de nombre.
4. Eliminar la copia y recuperar el tablero original como activo.
5. Solicitar las exportaciones editable, PNG y SVG.

REA registró los eventos de descarga con los nombres `Tablero de tareas.excalidraw`, `Tablero de tareas.png` y `Tablero de tareas.svg`. El proveedor cancela esas descargas durante el escenario; esta observación confirma que se generan las solicitudes de descarga, pero no acredita una reimportación correcta de sus bytes.

Evidence ID: `ev_5b52523a0cc9dc4858c589c603b86e12fd98ebec23621568c9555e873e390485`.

La revisión visual detectó que los títulos de las columnas heredaban el color transparente del contenedor. Se corrigió el color de las etiquetas y se compiló de nuevo. La captura `trazo-template-final.png` confirma que «Por hacer», «En marcha» y «Hecho» se muestran. Evidencia: `ev_f799af360dc1555738fc2880306b6c8d770929c0497e9fb42ca3c05fba9ca8ee`.

## Evidencias y límites

El [índice de validación](evidence/trazo-validation.json) contiene los hashes del JSON original y las rutas de las respuestas completas comprimidas. Los [escenarios](scenarios/) conservan las acciones utilizadas. Se extrajeron los PNG sin modificar sus píxeles y se comprobaron sus SHA-256.

Los escenarios completados no registraron excepciones `page-error` durante sus ventanas. Chrome registró avisos de política sobre el evento `unload` desde el paquete del editor. Esos avisos se conservaron en las evidencias y no impidieron completar las acciones. El fallo inicial de carga de una fuente desde la caché de dependencias se corrigió limitando el acceso de Vite a la carpeta de dependencias resuelta.

## Pendiente de la fase 3

- Importación y exportación de ida y vuelta, con imágenes reales, biblioteca y archivos inválidos.
- Revisión ampliada de atajos, foco, diálogos y uso táctil.
- Escenarios de errores de almacenamiento en la aplicación, además de las pruebas unitarias de la cola.
- Comprobación de miniaturas del minimapa y funciones opcionales del editor.

Estas comprobaciones pendientes no se presentan como superadas por los escenarios básicos de esta fase.
