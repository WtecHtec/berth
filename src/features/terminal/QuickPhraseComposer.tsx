import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "../../shared/lib/icons";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";

export function QuickPhraseComposer({ sessionId }: { sessionId: string }) {
  // 草稿只属于当前终端组件，不在多个工作区或终端之间共享。
  const [input, setInput] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const phrases = useWorkbenchStore((state) => state.phrases);
  const enqueueTerminalInput = useWorkbenchStore((state) => state.enqueueTerminalInput);
  const matches = useMemo(() => {
    if (!input.startsWith("/")) return [];
    const normalizedInput = input.toLowerCase();
    return phrases.filter((phrase) => phrase.prefix.toLowerCase().includes(normalizedInput)).slice(0, 3);
  }, [input, phrases]);
  const activeIndex = matches.length > 0 ? Math.min(selectedIndex, matches.length - 1) : 0;
  const activePhrase = matches[activeIndex];

  useEffect(() => {
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, activePhrase?.id]);

  const injectAndClear = (content: string) => {
    enqueueTerminalInput(sessionId, content);
    setInput("");
    setSelectedIndex(0);
  };

  const submit = () => {
    const phrase = activePhrase;
    if (phrase) injectAndClear(phrase.content);
    else if (input.trim()) injectAndClear(input.trim());
  };

  return (
    <div className="phrase-composer">
      {matches.length > 0 ? (
        <div className="phrase-menu" role="listbox" aria-label="快捷短语" id={`phrase-list-${sessionId}`}>
          {matches.map((phrase, index) => (
            <button
              ref={(element) => { optionRefs.current[index] = element; }}
              key={phrase.id}
              id={`phrase-option-${sessionId}-${phrase.id}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? "is-selected" : ""}
              onPointerEnter={() => setSelectedIndex(index)}
              onClick={() => injectAndClear(phrase.content)}
            >
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
          onChange={(event) => {
            setInput(event.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && matches.length > 0) {
              event.preventDefault();
              setSelectedIndex((current) => (Math.min(current, matches.length - 1) + 1) % matches.length);
              return;
            }
            if (event.key === "ArrowUp" && matches.length > 0) {
              event.preventDefault();
              setSelectedIndex((current) => (Math.min(current, matches.length - 1) - 1 + matches.length) % matches.length);
              return;
            }
            if (event.key === "Escape" && matches.length > 0) {
              event.preventDefault();
              setInput("");
              setSelectedIndex(0);
              return;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="输入 / 调用快捷短语"
          aria-label="快捷短语输入"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={matches.length > 0}
          aria-controls={matches.length > 0 ? `phrase-list-${sessionId}` : undefined}
          aria-activedescendant={activePhrase ? `phrase-option-${sessionId}-${activePhrase.id}` : undefined}
        />
        <span className="phrase-hint">↑↓ 选择 · 回车注入</span>
      </div>
    </div>
  );
}
