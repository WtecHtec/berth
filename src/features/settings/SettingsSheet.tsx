import { useState } from "react";
import type { QuickPhrase } from "../../domain/workbench/models";
import { Pencil, Plus, Trash2, X } from "../../shared/lib/icons";
import { IconButton } from "../../shared/ui/IconButton";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";
import { QuickPhraseForm } from "./QuickPhraseForm";

type PhraseEditorState = { mode: "create" } | { mode: "edit"; phrase: QuickPhrase } | null;

export function SettingsSheet() {
  const open = useWorkbenchStore((state) => state.settingsOpen);
  const setOpen = useWorkbenchStore((state) => state.setSettingsOpen);
  const phrases = useWorkbenchStore((state) => state.phrases);
  const addPhrase = useWorkbenchStore((state) => state.addPhrase);
  const updatePhrase = useWorkbenchStore((state) => state.updatePhrase);
  const deletePhrase = useWorkbenchStore((state) => state.deletePhrase);
  const [editor, setEditor] = useState<PhraseEditorState>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const closeSheet = () => {
    setEditor(null);
    setActionError(null);
    setOpen(false);
  };

  if (!open) return null;
  return (
    <div className="sheet-scrim" role="presentation" onMouseDown={closeSheet}>
      <aside className="settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span>BERTH</span><h2 id="settings-title">设置</h2></div><IconButton label="关闭设置" onClick={closeSheet}><X size={16} /></IconButton></header>
        <div className="settings-scroll">
          <section className="settings-section phrase-settings">
            <div className="settings-section__heading"><div><h3>短语库</h3><p>通过前缀查找并向当前终端注入常用内容。</p></div><button className="mini-button" type="button" onClick={() => { setActionError(null); setEditor({ mode: "create" }); }}><Plus size={13} />新增</button></div>
            {editor ? (
              <QuickPhraseForm
                key={editor.mode === "edit" ? editor.phrase.id : "create"}
                phrase={editor.mode === "edit" ? editor.phrase : undefined}
                onCancel={() => setEditor(null)}
                onSubmit={(draft) => {
                  const result = editor.mode === "edit" ? updatePhrase(editor.phrase.id, draft) : addPhrase(draft);
                  if (result.ok) setEditor(null);
                  return result;
                }}
              />
            ) : null}
            {actionError ? <div className="phrase-action-error" role="alert">{actionError}</div> : null}
            <div className="phrase-table">
              {phrases.length === 0 ? (
                <div className="phrase-table__empty">尚未创建快捷短语</div>
              ) : (
                phrases.map((phrase) => (
                  <div className="phrase-setting-row" key={phrase.id}>
                    <code>{phrase.prefix}</code>
                    <div><strong>{phrase.title}</strong><span>{phrase.content}</span></div>
                    <em>{phrase.category || "未分类"}</em>
                    <IconButton label={`编辑 ${phrase.title}`} onClick={() => { setActionError(null); setEditor({ mode: "edit", phrase }); }}><Pencil size={14} /></IconButton>
                    <IconButton label={`删除 ${phrase.title}`} onClick={() => {
                      const result = deletePhrase(phrase.id);
                      setActionError(result.ok ? null : result.error);
                      if (editor?.mode === "edit" && editor.phrase.id === phrase.id) setEditor(null);
                    }}><Trash2 size={14} /></IconButton>
                  </div>
                ))
              )}
            </div>
          </section>
          <section className="settings-section app-version-setting" aria-labelledby="build-version-title">
            <div>
              <h3 id="build-version-title">版本</h3>
            </div>
            <code aria-label={`构建版本 ${__BERTH_BUILD_VERSION__}`}>{__BERTH_BUILD_VERSION__}</code>
          </section>
        </div>
      </aside>
    </div>
  );
}
