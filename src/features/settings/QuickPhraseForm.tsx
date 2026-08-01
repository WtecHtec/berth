import { useState, type FormEvent } from "react";
import type { QuickPhrase, QuickPhraseActionResult, QuickPhraseDraft } from "../../domain/workbench/models";

const EMPTY_DRAFT: QuickPhraseDraft = { prefix: "", title: "", content: "", category: "" };

interface QuickPhraseFormProps {
  phrase?: QuickPhrase;
  onSubmit(draft: QuickPhraseDraft): QuickPhraseActionResult;
  onCancel(): void;
}

export function QuickPhraseForm({ phrase, onSubmit, onCancel }: QuickPhraseFormProps) {
  const [draft, setDraft] = useState<QuickPhraseDraft>(() => phrase ?? EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);

  const update = (patch: Partial<QuickPhraseDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = onSubmit(draft);
    if (!result.ok) setError(result.error);
  };

  return (
    <form className="phrase-editor" onSubmit={submit}>
      <div className="phrase-editor__heading">
        <strong>{phrase ? "编辑快捷短语" : "新建快捷短语"}</strong>
        <span>输入前缀后，可在终端底部快速调用</span>
      </div>
      <div className="phrase-editor__grid">
        <label>
          <span>调用前缀</span>
          <input autoFocus value={draft.prefix} onChange={(event) => update({ prefix: event.target.value })} placeholder="/review" />
        </label>
        <label>
          <span>名称</span>
          <input value={draft.title} onChange={(event) => update({ title: event.target.value })} placeholder="代码审查" />
        </label>
        <label className="phrase-editor__wide">
          <span>展开内容</span>
          <textarea value={draft.content} onChange={(event) => update({ content: event.target.value })} placeholder="输入要注入终端的内容" rows={4} />
        </label>
        <label className="phrase-editor__wide">
          <span>分类</span>
          <input value={draft.category} onChange={(event) => update({ category: event.target.value })} placeholder="可选" />
        </label>
      </div>
      {error ? <div className="phrase-editor__error" role="alert">{error}</div> : null}
      <footer>
        <button className="button button--secondary" type="button" onClick={onCancel}>取消</button>
        <button className="button button--primary" type="submit">{phrase ? "保存修改" : "创建短语"}</button>
      </footer>
    </form>
  );
}
