import { FilePlus2, FolderSearch, Pencil, SquareTerminal } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect } from "react";
import type { TreeNode } from "../../domain/workbench/models";

interface FileTreeContextMenuProps {
  node: TreeNode;
  x: number;
  y: number;
  onClose(): void;
  onCreateFile(): void;
  onRename(): void;
  onCreateTerminal(): void;
  onReveal(): void;
}

export function FileTreeContextMenu({
  node,
  x,
  y,
  onClose,
  onCreateFile,
  onRename,
  onCreateTerminal,
  onReveal,
}: FileTreeContextMenuProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const left = Math.max(8, Math.min(x, window.innerWidth - 190));
  const top = Math.max(8, Math.min(y, window.innerHeight - 166));

  return createPortal(
    <div className="context-menu-layer" role="presentation" onMouseDown={onClose}>
      <div
        className="file-context-menu"
        role="menu"
        aria-label={`${node.name} 操作`}
        style={{ left, top }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" role="menuitem" onClick={onCreateFile}><FilePlus2 size={14} />新建文件</button>
        <button type="button" role="menuitem" disabled={node.kind === "root"} onClick={onRename}><Pencil size={14} />重命名</button>
        <span className="context-menu-separator" />
        <button type="button" role="menuitem" onClick={onCreateTerminal}><SquareTerminal size={14} />在此处创建终端</button>
        <button type="button" role="menuitem" onClick={onReveal}><FolderSearch size={14} />在访达中打开</button>
      </div>
    </div>,
    document.body,
  );
}
