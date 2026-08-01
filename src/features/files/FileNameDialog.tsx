import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { TreeNode } from "../../domain/workbench/models";

interface FileNameDialogProps {
  mode: "create" | "rename";
  node: TreeNode;
  onCancel(): void;
  onSubmit(name: string): Promise<boolean>;
}

export function FileNameDialog({ mode, node, onCancel, onSubmit }: FileNameDialogProps) {
  const [name, setName] = useState(() => mode === "rename" ? node.name : "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);

  const submit = async () => {
    const value = name.trim();
    if (!value || submitting) return;
    setSubmitting(true);
    const succeeded = await onSubmit(value);
    setSubmitting(false);
    if (succeeded) onCancel();
  };

  return createPortal(
    <div className="modal-scrim" role="presentation" onMouseDown={onCancel}>
      <form
        className="file-name-dialog"
        aria-label={mode === "create" ? "新建文件" : "重命名"}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => { event.preventDefault(); void submit(); }}
      >
        <h2>{mode === "create" ? "新建文件" : "重命名"}</h2>
        <p>{mode === "create" ? `将在 ${node.kind === "file" ? "所在文件夹" : node.name} 中创建` : node.path}</p>
        <input autoFocus value={name} onChange={(event) => setName(event.target.value)} spellCheck={false} />
        <footer>
          <button className="button button--secondary" type="button" onClick={onCancel}>取消</button>
          <button className="button button--primary" type="submit" disabled={!name.trim() || submitting}>
            {submitting ? "处理中…" : "确认"}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
