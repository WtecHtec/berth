import { useEffect } from "react";
import { createPortal } from "react-dom";
import { PanelTopClose, X } from "lucide-react";

interface TabContextMenuProps {
  title: string;
  x: number;
  y: number;
  canCloseOthers: boolean;
  onClose(): void;
  onCloseCurrent(): void;
  onCloseOthers(): void;
}

export function TabContextMenu({
  title,
  x,
  y,
  canCloseOthers,
  onClose,
  onCloseCurrent,
  onCloseOthers,
}: TabContextMenuProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const left = Math.max(8, Math.min(x, window.innerWidth - 182));
  const top = Math.max(8, Math.min(y, window.innerHeight - 76));

  return createPortal(
    <div className="context-menu-layer" role="presentation" onMouseDown={onClose} onContextMenu={(event) => event.preventDefault()}>
      <div
        className="file-context-menu tab-context-menu"
        role="menu"
        aria-label={`${title} 标签操作`}
        style={{ left, top }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" role="menuitem" onClick={onCloseCurrent}><X size={13} />关闭当前标签</button>
        <button type="button" role="menuitem" disabled={!canCloseOthers} onClick={onCloseOthers}><PanelTopClose size={13} />关闭其他标签</button>
      </div>
    </div>,
    document.body,
  );
}
