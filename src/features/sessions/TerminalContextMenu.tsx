import { Pin, PinOff, Pencil } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

interface TerminalContextMenuProps {
  title: string;
  x: number;
  y: number;
  pinned: boolean;
  canPin: boolean;
  onClose(): void;
  onRename(): void;
  onTogglePin(): void;
}

export function TerminalContextMenu({
  title,
  x,
  y,
  pinned,
  canPin,
  onClose,
  onRename,
  onTogglePin,
}: TerminalContextMenuProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const left = Math.max(8, Math.min(x, window.innerWidth - 190));
  const top = Math.max(8, Math.min(y, window.innerHeight - (canPin ? 78 : 45)));

  return createPortal(
    <div className="context-menu-layer" role="presentation" onMouseDown={onClose} onContextMenu={(event) => event.preventDefault()}>
      <div
        className="file-context-menu terminal-context-menu"
        role="menu"
        aria-label={`${title} 终端操作`}
        style={{ left, top }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" role="menuitem" onClick={onRename}><Pencil size={13} />重命名</button>
        {canPin ? (
          <button type="button" role="menuitem" onClick={onTogglePin}>
            {pinned ? <PinOff size={13} /> : <Pin size={13} />}
            {pinned ? "取消置顶" : "置顶终端"}
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
