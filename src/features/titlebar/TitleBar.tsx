import { LayoutPanelLeft, Search, Settings2 } from "../../shared/lib/icons";
import { IconButton } from "../../shared/ui/IconButton";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";
import { GridLayoutPicker } from "../workbench/GridLayoutPicker";

export function TitleBar() {
  const setCommandPaletteOpen = useWorkbenchStore((state) => state.setCommandPaletteOpen);
  const setSettingsOpen = useWorkbenchStore((state) => state.setSettingsOpen);
  const workspaceName = useWorkbenchStore((state) => state.workspaceName);
  const rootCount = useWorkbenchStore((state) => state.workspaceRoots.length);
  const hasWorkspace = rootCount > 0;

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar__native-space" data-tauri-drag-region />
      <div className="titlebar__workspace">
        <div className="app-mark"><LayoutPanelLeft size={14} strokeWidth={2.2} /></div>
        <span className="workspace-name">{workspaceName || "Berth"}</span>
        {hasWorkspace ? <span className="workspace-path">{rootCount} 个根目录</span> : null}
      </div>
      <div className="titlebar__actions">
        {hasWorkspace ? (
          <>
            <button className="command-trigger" type="button" onClick={() => setCommandPaletteOpen(true)}>
              <Search size={13} />
              <span>搜索或运行命令</span>
            </button>
            <GridLayoutPicker />
          </>
        ) : null}
        <IconButton label="打开设置" variant="glass" onClick={() => setSettingsOpen(true)}>
          <Settings2 size={15} />
        </IconButton>
      </div>
    </header>
  );
}
