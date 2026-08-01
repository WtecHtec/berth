import { useCallback, useRef, useState, type UIEvent } from "react";
import { codeLanguageFromPath } from "../../domain/files/fileLanguage";
import { HighlightedCode } from "../../shared/ui/HighlightedCode";

interface CodeEditorProps {
  value: string;
  filePath: string;
  label: string;
  onChange(value: string): void;
}

/** Keeps native text editing on top of a synchronized, non-interactive highlight layer. */
export function CodeEditor({ value, filePath, label, onChange }: CodeEditorProps) {
  const highlightRef = useRef<HTMLPreElement>(null);
  const [composing, setComposing] = useState(false);
  const language = codeLanguageFromPath(filePath);

  const synchronizeScroll = useCallback((event: UIEvent<HTMLTextAreaElement>) => {
    const highlight = highlightRef.current;
    if (!highlight) return;
    highlight.scrollTop = event.currentTarget.scrollTop;
    highlight.scrollLeft = event.currentTarget.scrollLeft;
  }, []);

  return (
    <div className={`code-editor-shell ${composing ? "is-composing" : ""}`} data-language={language}>
      <pre className="code-editor-highlight" ref={highlightRef} aria-hidden="true">
        <code><HighlightedCode code={`${value}\n`} language={language} /></code>
      </pre>
      <textarea
        className="code-editor"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onScroll={synchronizeScroll}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
        wrap="off"
        spellCheck={false}
        aria-label={label}
      />
    </div>
  );
}
