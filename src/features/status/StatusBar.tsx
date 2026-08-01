import { Activity, Folder } from "../../shared/lib/icons";
import { desktopGateway } from "../../app/services";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";

export function StatusBar() {
  const selectedPath = useWorkbenchStore((state) => state.selectedTreePath);
  const sessionCount = useWorkbenchStore((state) => state.sessions.length);
  return (
    <footer className="statusbar">
      <div className="statusbar__group">
        <span className="statusbar__path" title={selectedPath}><Folder size={12} />{selectedPath}</span>
      </div>
      <div className="statusbar__group">
        <span><Activity size={12} />{sessionCount} 个终端</span>
        <span className="runtime-badge">{desktopGateway.kind === "tauri" ? "TAURI" : "PREVIEW"}</span>
      </div>
    </footer>
  );
}
