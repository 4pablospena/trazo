# Trazo

Un espacio de dibujo basado en Excalidraw para crear diagramas, organizar ideas y trabajar con tus IA desde un lienzo editable.

## Stack

- **Frontend:** React y TypeScript con Vite.
- **Interfaz:** Tailwind CSS, Headless UI y Lucide.
- **Editor:** Excalidraw y Mermaid to Excalidraw.
- **Servidor MCP:** Node.js y HTTP.
- **Almacenamiento:** IndexedDB para los tableros y SQLite para las claves.

## Arrancar

Necesitas **Node.js 24** y npm. Desde la carpeta del proyecto:

```sh
npm ci
npm run dev
```

Abre [http://127.0.0.1:5173](http://127.0.0.1:5173). En los siguientes arranques basta con `npm run dev`.

## Cómo funciona

Crea tableros en blanco o parte de una plantilla. Los dibujos se guardan automáticamente en tu navegador. Puedes importar archivos `.excalidraw` y exportar a Excalidraw, PNG o SVG.

El botón **Convertir** transforma Mermaid y Markdown en contenido del lienzo. El texto queda editable; algunos tipos de diagramas se insertan como imágenes.

Los datos permanecen en el navegador: no hay sincronización entre dispositivos. Exporta tus tableros para trasladarlos o guardar una copia.

## Conectar tus IA

Compatible con **Cursor, Claude Code y Codex** mediante MCP. Con Trazo abierto, ejecuta desde otra terminal:

```sh
npm run conectar
```

Abre el enlace que aparece, pulsa **Vincular navegador** y después **Crear clave**. Elige tu IA en el panel y usa **Copiar configuración**.

También puedes generar una clave API por terminal:

```sh
npm run api:key
```

Mantén Trazo y el servidor MCP abiertos mientras tu IA trabaja con los dibujos.

## Desarrollo

```sh
npm test             # Ejecutar las pruebas
npm run build        # Comprobar TypeScript y compilar
npm run preview      # Abrir la compilación local
```

## Licencias

Consulta los [avisos de terceros](THIRD_PARTY_NOTICES.md). Se conserva la [licencia MIT de Excalidraw](public/licenses/LICENSE).
