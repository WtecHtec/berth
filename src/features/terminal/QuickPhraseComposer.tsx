import { useMemo, useState } from "react";
import { Sparkles } from "../../shared/lib/icons";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";

export function QuickPhraseComposer({ sessionId }: { sessionId: string }) {
  // 草稿只属于当前终端组件，不在多个工作区或终端之间共享。
  const [input, setInput] = useState("");
  const phrases = useWorkbenchStore((state) => state.phrases);
  const enqueueTerminalInput = useWorkbenchStore((state) => state.enqueueTerminalInput);
  const matches = useMemo(() => {
    if (!input.startsWith("/")) return [];
    const normalizedInput = input.toLowerCase();
    return phrases.filter((phrase) => phrase.prefix.toLowerCase().includes(normalizedInput)).slice(0, 3);
  }, [input, phrases]);

  const injectAndClear = (content: string) => {
    enqueueTerminalInput(sessionId, content);
    setInput("");
  };

  const submit = () => {
    const phrase = matches[0];
    if (phrase) injectAndClear(phrase.content);
    else if (input.trim()) injectAndClear(input.trim());
  };

  return (
    <div className="phrase-composer">
      {matches.length > 0 ? (
        <div className="phrase-menu" role="listbox" aria-label="快捷短语">
          {matches.map((phrase, index) => (
            <button key={phrase.id} type="button" className={index === 0 ? "is-selected" : ""} onClick={() => injectAndClear(phrase.content)}>
              <span className="phrase-icon"><Sparkles size={13} /></span>
              <span><strong>{phrase.prefix}</strong><small>{phrase.title}</small></span>
              <em>{phrase.category}</em>
            </button>
          ))}
        </div>
      ) : null}
      <div className="phrase-input-wrap">
        <Sparkles size={14} />
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="输入 / 调用快捷短语"
          aria-label="快捷短语输入"
        />
        <span className="phrase-hint">回车注入</span>
      </div>
    </div>
  );
}
