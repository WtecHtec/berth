import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";
import type { TreeNode } from "../../domain/workbench/models";

interface MoveToTrashDialogProps {
  node: TreeNode;
  moving: boolean;
  error: string | null;
  onCancel(): void;
  onConfirm(): void;
}

/** 把危险操作的确认与文件业务编排分离，弹窗本身只管理可访问性交互。 */
export function MoveToTrashDialog({ node, moving, error, onCancel, onConfirm }: MoveToTrashDialogProps) {
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !moving) onCancel();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [moving, onCancel]);

  const targetLabel = node.kind === "folder" ? "文件夹" : "文件";
  return createPortal(
    <div className="modal-scrim" role="presentation" onMouseDown={() => { if (!moving) onCancel(); }}>
      <section
        className="unsaved-changes-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="trash-dialog-title"
        aria-describedby="trash-dialog-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="unsaved-changes-dialog__heading">
          <span><Trash2 size={17} /></span>
          <div>
            <small>移到废纸篓</small>
            <h2 id="trash-dialog-title">移动“{node.name}”？</h2>
          </div>
        </div>
        <p id="trash-dialog-description">此{targetLabel}将移到 macOS 废纸篓，之后仍可在访达中恢复。</p>
        {error ? <div className="unsaved-changes-dialog__error" role="alert">{error}</div> : null}
        <footer>
          <button className="button button--secondary" type="button" disabled={moving} onClick={onCancel}>取消</button>
          <button autoFocus className="button button--danger" type="button" disabled={moving} onClick={onConfirm}>
            {moving ? "正在移动…" : "移到废纸篓"}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
