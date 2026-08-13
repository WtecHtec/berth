import { ClipboardCopy, ClipboardPaste, FileDiff, FilePlus2, FolderMinus, FolderSearch, Pencil, Plus, SquareTerminal, Trash2, Undo2 } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect } from "react";
import type { TreeNode } from "../../domain/workbench/models";
import type { GitFileChange } from "../../domain/git/models";

interface FileTreeContextMenuProps {
  node: TreeNode;
  x: number;
  y: number;
  onClose(): void;
  onCreateFile(): void;
  onCopy(): void;
  onPaste(): void;
  onRename(): void;
  onCreateTerminal(): void;
  onReveal(): void;
  onMoveToTrash(): void;
  onRemoveRoot(): void;
  gitChange?: GitFileChange;
  onViewGitChange(): void;
  onStage(): void;
  onUnstage(): void;
  canCopy: boolean;
  canPaste: boolean;
  canMoveToTrash: boolean;
  pasteName?: string;
}

export function FileTreeContextMenu({
  node,
  x,
  y,
  onClose,
  onCreateFile,
  onCopy,
  onPaste,
  onRename,
  onCreateTerminal,
  onReveal,
  onMoveToTrash,
  onRemoveRoot,
  gitChange,
  onViewGitChange,
  onStage,
  onUnstage,
  canCopy,
  canPaste,
  canMoveToTrash,
  pasteName,
}: FileTreeContextMenuProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const left = Math.max(8, Math.min(x, window.innerWidth - 190));
  const gitActionCount = gitChange ? 1 + Number(Boolean(gitChange.worktreeStatus)) + Number(Boolean(gitChange.indexStatus)) : 0;
  const menuHeight = (node.kind === "root" ? 268 : canMoveToTrash ? 270 : 232)
    + gitActionCount * 31
    + (gitChange ? 7 : 0);
  const top = Math.max(8, Math.min(y, window.innerHeight - menuHeight));

  return createPortal(
    <div
      className="context-menu-layer"
      role="presentation"
      onMouseDown={onClose}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        className="file-context-menu"
        role="menu"
        aria-label={`${node.name} 操作`}
        style={{ left, top }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {gitChange ? (
          <>
            <button type="button" role="menuitem" onClick={onViewGitChange}><FileDiff size={14} />查看更改</button>
            {gitChange.worktreeStatus ? (
              <button
                type="button"
                role="menuitem"
                onClick={onStage}
              >
                <Plus size={14} />暂存更改
              </button>
            ) : null}
            {gitChange.indexStatus ? (
              <button type="button" role="menuitem" onClick={onUnstage}><Undo2 size={14} />取消暂存</button>
            ) : null}
            <span className="context-menu-separator" />
          </>
        ) : null}
        <button type="button" role="menuitem" disabled={!canCopy} onClick={onCopy}><ClipboardCopy size={14} />复制</button>
        <button type="button" role="menuitem" disabled={!canPaste} onClick={onPaste} title={pasteName ? `粘贴 ${pasteName}` : undefined}>
          <ClipboardPaste size={14} />{pasteName ? `粘贴“${pasteName}”` : "粘贴"}
        </button>
        <span className="context-menu-separator" />
        <button type="button" role="menuitem" onClick={onCreateFile}><FilePlus2 size={14} />新建文件</button>
        <button type="button" role="menuitem" disabled={node.kind === "root"} onClick={onRename}><Pencil size={14} />重命名</button>
        <span className="context-menu-separator" />
        <button type="button" role="menuitem" onClick={onCreateTerminal}><SquareTerminal size={14} />在此处创建终端</button>
        <button type="button" role="menuitem" onClick={onReveal}><FolderSearch size={14} />在访达中打开</button>
        {canMoveToTrash ? (
          <>
            <span className="context-menu-separator" />
            <button type="button" role="menuitem" className="file-context-menu__remove" onClick={onMoveToTrash}>
              <Trash2 size={14} />移到废纸篓
            </button>
          </>
        ) : null}
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
