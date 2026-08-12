import { useCallback, useEffect, useState } from "react";
import { Copy, Download } from "lucide-react";
import { desktopGateway } from "../../app/services";
import type { SftpTextFile } from "../../domain/ssh/models";
import type { WorkbenchTab } from "../../domain/workbench/models";
import { filePresentation, isEditablePresentation } from "../../domain/files/filePreview";
import { useFileSaveShortcut } from "../../hooks/useFileSaveShortcut";
import { IconButton } from "../../shared/ui/IconButton";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";
import { CodeEditor } from "../files/CodeEditor";
import { clearFileDraft, readFileDraft, retainFileDraft } from "../files/fileDraftRegistry";
import { MediaPreview } from "../files/preview/MediaPreview";
import { useTabCloseController } from "../workbench/TabCloseController";

/** 远端文件编辑器只依赖 DesktopGateway；SFTP 协议与临时文件不会泄漏到 UI 层。 */
export function SftpFileViewer({ tab, active }: { tab: WorkbenchTab; active: boolean }) {
  const target = tab.sftpFile;
  const setTabDirty = useWorkbenchStore((state) => state.setTabDirty);
  const updateMetadata = useWorkbenchStore((state) => state.updateSftpFileMetadata);
  const { registerTabSaver } = useTabCloseController();
  const [original, setOriginal] = useState<SftpTextFile | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const presentation = filePresentation(target?.path);
  const editable = isEditablePresentation(presentation);
  const media = presentation === "image" || presentation === "video" || presentation === "audio";

  useEffect(() => {
    if (!target || !editable) {
      if (!media) setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void desktopGateway.readSftpTextFile(target.siteId, target.path, target.controlPath)
      .then((file) => {
        if (cancelled) return;
        const retained = tab.dirty ? readFileDraft(tab.id, target.path) : undefined;
        setOriginal(file);
        setDraft(retained ?? file.content);
        if (retained === undefined) {
          clearFileDraft(tab.id);
          setTabDirty(tab.id, false);
        }
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [editable, media, setTabDirty, tab.id, target?.controlPath, target?.path, target?.siteId]);

  useEffect(() => {
    if (!target || !media) {
      setPreviewPath(null);
      return;
    }
    let cancelled = false;
    let cachedPath: string | null = null;
    setLoading(true);
    setError(null);
    void desktopGateway.cacheSftpFile(target.siteId, target.path, target.controlPath)
      .then((path) => {
        cachedPath = path;
        if (cancelled) void desktopGateway.releaseSftpCache(path);
        else setPreviewPath(path);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (cachedPath) void desktopGateway.releaseSftpCache(cachedPath);
    };
  }, [media, target?.controlPath, target?.path, target?.siteId]);

  /** Ctrl/⌘S 与关闭标签前保存共用这里；后端会用打开时元数据做乐观冲突校验。 */
  const saveDraft = useCallback(async () => {
    if (!target || !original || !tab.dirty) return;
    if (saving) throw new Error("远端文件正在保存，请稍候");
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await desktopGateway.writeSftpTextFile(
        target.siteId,
        target.path,
        draft,
        { size: original.size, modified: original.modified },
        target.controlPath,
      );
      setOriginal(saved);
      updateMetadata(tab.id, saved.size, saved.modified);
      clearFileDraft(tab.id);
      setTabDirty(tab.id, false);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setSaveError(message);
      throw cause;
    } finally {
      setSaving(false);
    }
  }, [draft, original, saving, setTabDirty, tab.dirty, tab.id, target, updateMetadata]);

  useEffect(() => registerTabSaver(tab.id, saveDraft), [registerTabSaver, saveDraft, tab.id]);
  useFileSaveShortcut(active && editable, saveDraft);

  const download = useCallback(async () => {
    if (!target) return;
    const name = target.path.split("/").filter(Boolean).at(-1) ?? tab.title;
    const localPath = await desktopGateway.pickSavePath(name);
    if (!localPath) return;
    setSaveError(null);
    setSaving(true);
    try {
      await desktopGateway.downloadSftpFile(target.siteId, target.path, localPath, target.controlPath);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }, [tab.title, target]);

  if (!target) return <div className="content-state content-state--error">远端文件上下文已丢失</div>;

  return (
    <div className="file-viewer sftp-file-viewer">
      <div className="panel-toolbar file-toolbar">
        <div className="file-breadcrumbs" title={`${target.siteId}:${target.path}`}>
          <span>{target.siteId}:{target.path}</span>
        </div>
        <div className="panel-toolbar__actions">
          {saving ? <span className="file-save-state" aria-live="polite">正在传输…</span> : null}
          {!saving && tab.dirty ? <span className="file-save-state">未保存 · Ctrl/⌘ S</span> : null}
          <IconButton label="复制远端路径" onClick={() => void navigator.clipboard.writeText(target.path)}>
            <Copy size={14} />
          </IconButton>
          <IconButton label="下载到本地" onClick={() => void download()} disabled={saving}>
            <Download size={14} />
          </IconButton>
        </div>
      </div>
      <div className="file-content">
        {loading ? <div className="content-state">正在读取远端文件…</div> : null}
        {error ? <div className="content-state content-state--error">{error}</div> : null}
        {saveError ? <div className="file-save-error" role="alert">操作失败：{saveError}</div> : null}
        {media && !loading && !error && previewPath ? (
          <MediaPreview path={previewPath} title={tab.title} presentation={presentation} active={active} />
        ) : null}
        {!editable && !media && !loading ? (
          <div className="content-state">
            <p>该远端文件需要下载后查看。</p>
            <button type="button" onClick={() => void download()}>下载文件</button>
          </div>
        ) : null}
        {editable && !loading && !error && original ? (
          <CodeEditor
            value={draft}
            filePath={target.path}
            label={`编辑远端文件 ${tab.title}`}
            onChange={(nextDraft) => {
              setDraft(nextDraft);
              const dirty = nextDraft !== original.content;
              if (dirty) retainFileDraft(tab.id, target.path, nextDraft);
              else clearFileDraft(tab.id);
              setTabDirty(tab.id, dirty);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
