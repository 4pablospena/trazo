import { memo, useCallback, useRef } from 'react';
import { Excalidraw, MainMenu, WelcomeScreen } from '@excalidraw/excalidraw';
import { Download, FileCode2, FolderOpen, LayoutTemplate, PanelsTopLeft, Plus } from 'lucide-react';
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI, ExcalidrawInitialDataState, LibraryItems } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { Logo } from './Logo';

interface Props {
  name: string;
  data: ExcalidrawInitialDataState;
  theme: 'light' | 'dark';
  onApi: (api: ExcalidrawImperativeAPI | null) => void;
  onReady: (api: ExcalidrawImperativeAPI) => void;
  onChange: (elements: readonly ExcalidrawElement[], state: AppState, files: BinaryFiles) => void;
  onLibraryChange: (library: LibraryItems) => Promise<void>;
  onThemeChange: (theme: 'light' | 'dark' | 'system') => void;
  onImport: () => void;
  onDownload: () => void;
  onNew: () => void;
  onBoards: () => void;
  onConvert: () => void;
}

export const Editor = memo(function Editor(props: Props) {
  const ready = useRef(false);
  const onInitialize = useCallback((api: ExcalidrawImperativeAPI) => {
    ready.current = true;
    props.onReady(api);
  }, [props.onReady]);
  const onChange = useCallback((elements: readonly ExcalidrawElement[], state: AppState, files: BinaryFiles) => {
    if (ready.current && !state.isLoading) props.onChange(elements, state, files);
  }, [props.onChange]);

  return <Excalidraw
    initialData={props.data}
    onExcalidrawAPI={props.onApi}
    onInitialize={onInitialize}
    onChange={onChange}
    onLibraryChange={props.onLibraryChange}
    langCode="es-ES"
    theme={props.theme}
    onThemeChange={props.onThemeChange}
    name={props.name}
    aiEnabled={false}
    autoFocus
  >
    <MainMenu>
      <MainMenu.Item icon={<PanelsTopLeft size={17} />} onSelect={props.onBoards}>Mis tableros</MainMenu.Item>
      <MainMenu.Item icon={<Plus size={17} />} onSelect={props.onNew}>Nuevo tablero</MainMenu.Item>
      <MainMenu.Item icon={<FolderOpen size={17} />} onSelect={props.onImport}>Importar tablero…</MainMenu.Item>
      <MainMenu.Item icon={<FileCode2 size={17} />} onSelect={props.onConvert}>Convertir Mermaid o Markdown…</MainMenu.Item>
      <MainMenu.Item icon={<Download size={17} />} onSelect={props.onDownload}>Descargar .excalidraw</MainMenu.Item>
      <MainMenu.DefaultItems.SaveAsImage />
      <MainMenu.Separator />
      <MainMenu.DefaultItems.CommandPalette />
      <MainMenu.DefaultItems.SearchMenu />
      <MainMenu.DefaultItems.Help />
      <MainMenu.DefaultItems.ClearCanvas />
      <MainMenu.Separator />
      <MainMenu.DefaultItems.Preferences />
      <MainMenu.DefaultItems.ToggleTheme allowSystemTheme={false} />
      <MainMenu.DefaultItems.ChangeCanvasBackground />
    </MainMenu>
    <WelcomeScreen>
      <WelcomeScreen.Hints.MenuHint>Tableros, exportación y preferencias</WelcomeScreen.Hints.MenuHint>
      <WelcomeScreen.Hints.HelpHint />
      <WelcomeScreen.Center>
        <WelcomeScreen.Center.Logo><span className="welcome-brand"><Logo /></span></WelcomeScreen.Center.Logo>
        <WelcomeScreen.Center.Heading>Un espacio para tus próximas ideas.</WelcomeScreen.Center.Heading>
        <p className="welcome-description">Dibuja libremente o empieza con una plantilla.<br />Tus tableros se guardan en este navegador.</p>
        <WelcomeScreen.Center.Menu>
          <WelcomeScreen.Center.MenuItem onSelect={props.onNew} icon={<LayoutTemplate size={19} />}>Elegir una plantilla</WelcomeScreen.Center.MenuItem>
          <WelcomeScreen.Center.MenuItem onSelect={props.onImport} icon={<FolderOpen size={19} />}>Importar un tablero</WelcomeScreen.Center.MenuItem>
          <WelcomeScreen.Center.MenuItem onSelect={props.onConvert} icon={<FileCode2 size={19} />}>Convertir Mermaid o Markdown</WelcomeScreen.Center.MenuItem>
          <WelcomeScreen.Center.MenuItem onSelect={props.onBoards} icon={<PanelsTopLeft size={19} />}>Mis tableros</WelcomeScreen.Center.MenuItem>
          <WelcomeScreen.Center.MenuItemHelp />
        </WelcomeScreen.Center.Menu>
      </WelcomeScreen.Center>
    </WelcomeScreen>
  </Excalidraw>;
});
