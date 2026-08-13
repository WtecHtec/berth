import { ClipboardCopy, ClipboardPaste, Download, FilePenLine, FolderOpen, Pencil, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { SftpEntry } from "../../domain/ssh/models";

interface Props {
  entry: SftpEntry;
  x: number;
  y: number;
  onClose(): void;
  onOpen(): void;
  onDownload(): void;
  onCopy(): void;
  onPaste(): void;
  onRename(): void;
  onDelete(): void;
  canPaste: boolean;
  pasteName?: string;
}

export function SftpEntryContextMenu({ entry, x, y, onClose, onOpen, onDownload, onCopy, onPaste, onRename, onDelete, canPaste, pasteName }: Props) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const left = Math.max(8, Math.min(x, window.innerWidth - 190));
  const top = Math.max(8, Math.min(y, window.innerHeight - 244));
  return createPortal(
    <div className="context-menu-layer" role="presentation" onMouseDown={onClose} onContextMenu={(event) => event.preventDefault()}>
      <div className="file-context-menu" role="menu" aria-label={`${entry.name} 操作`} style={{ left, top }} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" role="menuitem" onClick={onOpen}>
          {entry.kind === "directory" ? <FolderOpen size={14} /> : <FilePenLine size={14} />}
          {entry.kind === "directory" ? "打开目录" : "打开文件"}
        </button>
        <button type="button" role="menuitem" disabled={entry.kind === "directory"} onClick={onDownload}>
          <Download size={14} />下载到本地
        </button>
        <span className="context-menu-separator" />
        <button type="button" role="menuitem" onClick={onCopy}><ClipboardCopy size={14} />复制</button>
        <button type="button" role="menuitem" disabled={!canPaste} onClick={onPaste} title={pasteName ? `粘贴 ${pasteName}` : undefined}>
          <ClipboardPaste size={14} />{pasteName ? `粘贴“${pasteName}”` : "粘贴"}
        </button>
        <span className="context-menu-separator" />
        <button type="button" role="menuitem" onClick={onRename}><Pencil size={14} />重命名</button>
        <button type="button" role="menuitem" className="file-context-menu__remove" onClick={onDelete}>
          <Trash2 size={14} />删除
        </button>
      </div>
    </div>,
    document.body,
  );
}
