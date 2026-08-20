import { useCallback, useEffect, useState } from "react";
import type { WorkbenchTab } from "../../domain/workbench/models";
import {
  filePresentation,
  isEditablePresentation,
  supportsRenderedPreview,
} from "../../domain/files/filePreview";
import { useFileContent } from "../../hooks/useFileContent";
import { useFileSaveShortcut } from "../../hooks/useFileSaveShortcut";
import { Copy, ExternalLink, Eye, EyeOff } from "../../shared/lib/icons";
import { IconButton } from "../../shared/ui/IconButton";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";
import { desktopGateway } from "../../app/services";
import { useTabCloseController } from "../workbench/TabCloseController";
import { HtmlPreview } from "./preview/HtmlPreview";
import { MarkdownPreview } from "./preview/MarkdownPreview";
import { MediaPreview } from "./preview/MediaPreview";
import { CodeEditor } from "./CodeEditor";
import { clearFileDraft, readFileDraft, retainFileDraft } from "./fileDraftRegistry";

export function FileViewer({ tab, active }: { tab: WorkbenchTab; active: boolean }) {
  const setTabDirty = useWorkbenchStore((state) => state.setTabDirty);
  const { registerTabSaver } = useTabCloseController();
  const presentation = filePresentation(tab.filePath);
  const editable = isEditablePresentation(presentation);
  const supportsPreview = supportsRenderedPreview(presentation);
  const { content, loading, saving, error, saveError, save } = useFileContent(tab.filePath, editable);
  const [draft, setDraft] = useState("");
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    const retainedDraft = tab.dirty ? readFileDraft(tab.id, tab.filePath) : undefined;
    if (retainedDraft !== undefined) {
      setDraft(retainedDraft);
      return;
    }
    setDraft(content);
    clearFileDraft(tab.id);
    setTabDirty(tab.id, false);
  }, [content, setTabDirty, tab.filePath, tab.id]);

  useEffect(() => setPreviewing(false), [tab.filePath]);

  /** 复用同一保存入口处理快捷键与关闭确认，避免不同入口产生不一致状态。 */
  const saveDraft = useCallback(async () => {
    if (!tab.dirty) return;
    if (saving) throw new Error("文件正在保存，请稍候。");
    await save(draft);
    clearFileDraft(tab.id);
    setTabDirty(tab.id, false);
  }, [draft, save, saving, setTabDirty, tab.dirty, tab.id]);

  useEffect(() => registerTabSaver(
    tab.id,
    saveDraft,
    () => clearFileDraft(tab.id),
  ), [registerTabSaver, saveDraft, tab.id]);

  useFileSaveShortcut(active && editable && !previewing, saveDraft);

  const filePath = tab.filePath ?? "";
  const showEditor = editable && !previewing;
  // Markdown 由内容区承载长文档滚动；HTML iframe 与媒体预览仍锁定在面板尺寸内。
  const clipPreviewOverflow = presentation !== "markdown" && (!editable || previewing);

  return (
    <div className="file-viewer">
      <div className="panel-toolbar file-toolbar">
        <div className="file-breadcrumbs" title={tab.filePath}>
          <span>{tab.filePath}</span>
        </div>
        <div className="panel-toolbar__actions">
          {editable && saving ? <span className="file-save-state" aria-live="polite">正在保存…</span> : null}
          {editable && !saving && tab.dirty ? <span className="file-save-state">未保存 · Ctrl/⌘ S</span> : null}
          {supportsPreview ? (
            <IconButton
              label={previewing ? "返回编辑" : "预览渲染结果"}
              aria-pressed={previewing}
              className={previewing ? "is-active" : ""}
              onClick={() => setPreviewing((current) => !current)}
            >
              {previewing ? <EyeOff size={14} /> : <Eye size={14} />}
            </IconButton>
          ) : null}
          <IconButton label="复制路径" onClick={() => tab.filePath && void navigator.clipboard.writeText(tab.filePath)}><Copy size={14} /></IconButton>
          <IconButton label="在访达中显示" onClick={() => tab.filePath && void desktopGateway.revealInFinder(tab.filePath)}><ExternalLink size={14} /></IconButton>
        </div>
      </div>
      <div className={`file-content ${clipPreviewOverflow ? "file-content--preview" : ""}`}>
        {editable && loading ? <div className="content-state">正在读取文件…</div> : null}
        {editable && error ? <div className="content-state content-state--error">{error}</div> : null}
        {saveError ? <div className="file-save-error" role="alert">保存失败：{saveError}</div> : null}
        {!editable && (presentation === "image" || presentation === "video" || presentation === "audio") ? (
          <MediaPreview path={filePath} title={tab.title} presentation={presentation} active={active} />
        ) : null}
        {editable && !loading && !error && previewing && presentation === "markdown" ? (
          <MarkdownPreview content={draft} filePath={filePath} />
        ) : null}
        {editable && !loading && !error && previewing && presentation === "html" ? (
          <HtmlPreview path={filePath} content={draft} active={active} title={tab.title} />
        ) : null}
        {!loading && !error && showEditor ? (
          <CodeEditor
            value={draft}
            filePath={filePath}
            label={`编辑 ${tab.title}`}
            onChange={(nextDraft) => {
              setDraft(nextDraft);
              const dirty = nextDraft !== content;
              if (dirty) retainFileDraft(tab.id, tab.filePath, nextDraft);
              else clearFileDraft(tab.id);
              setTabDirty(tab.id, dirty);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
