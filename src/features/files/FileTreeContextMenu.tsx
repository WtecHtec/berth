import { FilePlus2, FolderMinus, FolderSearch, Pencil, SquareTerminal } from "lucide-react";
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
  onRemoveRoot(): void;
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
  onRemoveRoot,
}: FileTreeContextMenuProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const left = Math.max(8, Math.min(x, window.innerWidth - 190));
  const menuHeight = node.kind === "root" ? 202 : 166;
  const top = Math.max(8, Math.min(y, window.innerHeight - menuHeight));

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
        {node.kind === "root" ? (
          <>
            <span className="context-menu-separator" />
            <button type="button" role="menuitem" className="file-context-menu__remove" onClick={onRemoveRoot}>
              <FolderMinus size={14} />从当前窗口移除
            </button>
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
