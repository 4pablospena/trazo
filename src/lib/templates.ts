import { convertToExcalidrawElements, serializeAsJSON } from '@excalidraw/excalidraw';
import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/element/transform';
import type { LocalPoint, Radians } from '@excalidraw/excalidraw/math/types';

export type TemplateId = 'blank' | 'flow' | 'kanban' | 'notes';
export const templates: { id: TemplateId; name: string; description: string; color: string }[] = [
  { id: 'blank', name: 'Lienzo en blanco', description: 'Todo empieza con una idea.', color: 'violet' },
  { id: 'flow', name: 'Diagrama de flujo', description: 'Conecta cada paso de tu proceso.', color: 'blue' },
  { id: 'kanban', name: 'Tablero de tareas', description: 'Visualiza lo que queda por hacer.', color: 'green' },
  { id: 'notes', name: 'Lluvia de ideas', description: 'Un espacio para pensar libremente.', color: 'amber' },
];

const heading = (text: string): ExcalidrawElementSkeleton => ({
  type: 'text', x: 50, y: 30, text, fontSize: 32, fontFamily: 5, strokeColor: '#34315c',
});

function flow(): ExcalidrawElementSkeleton[] {
  return [heading('De la idea a la acción'),
    { type: 'text', x: 50, y: 83, text: 'Haz doble clic para editar. Conecta tus próximos pasos.', fontSize: 17, fontFamily: 5, strokeColor: '#868e96' },
    ...['La idea', 'Darle forma', 'Compartir'].map((text, i): ExcalidrawElementSkeleton => ({
      type: 'rectangle', id: `step-${i}`, x: 50 + i * 270, y: 190, width: 190, height: 115,
      backgroundColor: ['#e5dbff', '#d0ebff', '#d3f9d8'][i], fillStyle: 'solid',
      strokeColor: '#6965a8', roughness: 1, roundness: { type: 3 },
      label: { text, fontSize: 24, fontFamily: 5 },
    })),
    ...[0, 1].map((i): ExcalidrawElementSkeleton => ({
      type: 'arrow', x: 245 + i * 270, y: 248, width: 70, height: 0,
      points: [[0, 0] as LocalPoint, [70, 0] as LocalPoint], strokeColor: '#6965a8', endArrowhead: 'arrow',
      start: { id: `step-${i}` }, end: { id: `step-${i + 1}` },
    })),
  ];
}

function kanban(): ExcalidrawElementSkeleton[] {
  const result: ExcalidrawElementSkeleton[] = [heading('Un paso cada vez')];
  const columns = [
    { name: 'Por hacer', color: '#e5dbff', notes: ['Tu próxima idea', 'Algo que investigar'] },
    { name: 'En marcha', color: '#d0ebff', notes: ['Lo que estás creando'] },
    { name: 'Hecho', color: '#d3f9d8', notes: ['Celebra tus avances'] },
  ];
  columns.forEach((column, i) => {
    const x = 50 + i * 280;
    result.push({ type: 'rectangle', x, y: 110, width: 250, height: 520, fillStyle: 'solid', backgroundColor: '#f8f9fa', strokeColor: '#dee2e6', roughness: 0, roundness: { type: 3 } },
      { type: 'rectangle', x: x + 15, y: 125, width: 220, height: 55, fillStyle: 'solid', backgroundColor: column.color, strokeColor: 'transparent', roughness: 0, roundness: { type: 3 }, label: { text: column.name, fontSize: 24, fontFamily: 5, strokeColor: '#34315c' } });
    column.notes.forEach((text, j) => result.push({ type: 'stickynote', x: x + 30, y: 210 + j * 185, width: 190, height: 150, backgroundColor: '#ffec99', label: { text, fontSize: 21, fontFamily: 5 } }));
  });
  return result;
}

function notes(): ExcalidrawElementSkeleton[] {
  return [heading('¿Y si probamos…?'),
    { type: 'text', x: 50, y: 85, text: 'No hace falta tenerlo todo claro para empezar.', fontSize: 19, fontFamily: 5, strokeColor: '#868e96' },
    ...['Una idea que explorar', 'Una pregunta abierta', 'Algo que mejorar', 'El siguiente paso'].map((text, i): ExcalidrawElementSkeleton => ({
      type: 'stickynote', x: 60 + (i % 2) * 285, y: 160 + Math.floor(i / 2) * 235,
      width: 230, height: 190, angle: ((i % 2 ? 1 : -1) * 0.025) as Radians,
      backgroundColor: ['#ffdf6b', '#a5d8ff', '#fcc2d7', '#b2f2bb'][i],
      label: { text, fontSize: 25, fontFamily: 5 },
    })),
  ];
}

export function createTemplateScene(id: TemplateId): string {
  const skeleton = id === 'flow' ? flow() : id === 'kanban' ? kanban() : id === 'notes' ? notes() : [];
  const elements = convertToExcalidrawElements(skeleton);
  return serializeAsJSON(elements, { viewBackgroundColor: '#ffffff' }, {}, 'local');
}
