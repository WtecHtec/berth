import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TerminalCacheActionResult } from "../../domain/workbench/models";

interface TerminalRenameDialogProps {
  title: string;
  description: string;
  onCancel(): void;
  onSubmit(title: string): TerminalCacheActionResult;
}

export function TerminalRenameDialog({ title, description, onCancel, onSubmit }: TerminalRenameDialogProps) {
  const [name, setName] = useState(title);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);

  const submit = () => {
    const result = onSubmit(name);
    if (result.ok) onCancel();
    else setError(result.error);
  };

  return createPortal(
    <div className="modal-scrim" role="presentation" onMouseDown={onCancel}>
      <form
        className="file-name-dialog"
        aria-label="重命名终端"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => { event.preventDefault(); submit(); }}
      >
        <h2>重命名终端</h2>
        <p>{description}</p>
        <input
          ref={inputRef}
          autoFocus
          value={name}
          maxLength={80}
          onChange={(event) => { setName(event.target.value); setError(null); }}
          spellCheck={false}
        />
        {error ? <div className="terminal-rename-error" role="alert">{error}</div> : null}
        <footer>
          <button className="button button--secondary" type="button" onClick={onCancel}>取消</button>
          <button className="button button--primary" type="submit" disabled={!name.trim()}>保存</button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
