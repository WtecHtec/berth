import { useCallback, useEffect, useState } from "react";
import type { WorkbenchTab } from "../../domain/workbench/models";
import { useFileContent } from "../../hooks/useFileContent";
import { useFileSaveShortcut } from "../../hooks/useFileSaveShortcut";
import { Copy, ExternalLink } from "../../shared/lib/icons";
import { IconButton } from "../../shared/ui/IconButton";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";
import { desktopGateway } from "../../app/services";

export function FileViewer({ tab, active }: { tab: WorkbenchTab; active: boolean }) {
  const setTabDirty = useWorkbenchStore((state) => state.setTabDirty);
  const { content, loading, saving, error, saveError, save } = useFileContent(tab.filePath);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setDraft(content);
    setTabDirty(tab.id, false);
  }, [content, setTabDirty, tab.filePath, tab.id]);

  const saveDraft = useCallback(async () => {
    if (saving || !tab.dirty) return;
    await save(draft);
    setTabDirty(tab.id, false);
  }, [draft, save, saving, setTabDirty, tab.dirty, tab.id]);

  useFileSaveShortcut(active, saveDraft);

  return (
    <div className="file-viewer">
      <div className="panel-toolbar file-toolbar">
        <div className="file-breadcrumbs" title={tab.filePath}>
          <span>{tab.filePath}</span>
        </div>
        <div className="panel-toolbar__actions">
          {saving ? <span className="file-save-state" aria-live="polite">正在保存…</span> : null}
          {!saving && tab.dirty ? <span className="file-save-state">未保存 · Ctrl/⌘ S</span> : null}
          <IconButton label="复制路径" onClick={() => tab.filePath && void navigator.clipboard.writeText(tab.filePath)}><Copy size={14} /></IconButton>
          <IconButton label="在访达中显示" onClick={() => tab.filePath && void desktopGateway.revealInFinder(tab.filePath)}><ExternalLink size={14} /></IconButton>
        </div>
      </div>
      <div className="file-content">
        {loading ? <div className="content-state">正在读取文件…</div> : null}
        {error ? <div className="content-state content-state--error">{error}</div> : null}
        {saveError ? <div className="file-save-error" role="alert">保存失败：{saveError}</div> : null}
        {!loading && !error ? (
          <textarea
            className="code-editor"
            value={draft}
            onChange={(event) => {
              const nextDraft = event.target.value;
              setDraft(nextDraft);
              setTabDirty(tab.id, nextDraft !== content);
            }}
            spellCheck={false}
            aria-label={`编辑 ${tab.title}`}
          />
        ) : null}
      </div>
    </div>
  );
}
