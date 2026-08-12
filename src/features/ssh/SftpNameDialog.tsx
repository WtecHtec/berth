import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  title: string;
  description: string;
  initialName?: string;
  onCancel(): void;
  onSubmit(name: string): Promise<boolean>;
}

export function SftpNameDialog({ title, description, initialName = "", onCancel, onSubmit }: Props) {
  const [name, setName] = useState(initialName);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onCancel(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);

  const submit = async () => {
    const value = name.trim();
    if (!value || value.includes("/") || submitting) return;
    setSubmitting(true);
    const succeeded = await onSubmit(value);
    setSubmitting(false);
    if (succeeded) onCancel();
  };

  return createPortal(
    <div className="modal-scrim" role="presentation" onMouseDown={onCancel}>
      <form className="file-name-dialog" aria-label={title} onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <h2>{title}</h2>
        <p>{description}</p>
        <input autoFocus value={name} onChange={(event) => setName(event.target.value)} spellCheck={false} />
        <footer>
          <button className="button button--secondary" type="button" onClick={onCancel}>取消</button>
          <button className="button button--primary" type="submit" disabled={!name.trim() || name.includes("/") || submitting}>
            {submitting ? "处理中…" : "确认"}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
