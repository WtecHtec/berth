import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ClipboardPaste,
  File,
  FilePlus2,
  Folder,
  FolderPlus,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  Upload,
} from "lucide-react";
import { desktopGateway } from "../../app/services";
import type { SftpDirectory, SftpEntry, SshRecentConnection, SshSite } from "../../domain/ssh/models";
import { useNativePathDropTarget } from "../../hooks/useNativePathDropTarget";
import {
  loadSshRecentConnections,
  rememberSshConnection,
  removeSshRecentConnection,
  toggleSshRecentPin,
} from "../../infrastructure/persistence/sshConnectionRepository";
import { IconButton } from "../../shared/ui/IconButton";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";
import { SftpEntryContextMenu } from "./SftpEntryContextMenu";
import { SftpNameDialog } from "./SftpNameDialog";
import { useFileClipboardStore } from "../../store/useFileClipboardStore";
import { copySftpFileItem, resolveFileClipboardItem } from "../../hooks/useFileClipboard";

interface SshExplorerProps {
  collapsed: boolean;
}

type NameDialogState =
  | { mode: "file" | "directory" }
  | { mode: "rename"; entry: SftpEntry };

function parentRemotePath(path: string) {
  if (!path || path === "/" || path === ".") return ".";
  const normalized = path.replace(/\/+$/u, "");
  const parent = normalized.slice(0, normalized.lastIndexOf("/"));
  return parent || "/";
}

function joinRemotePath(parent: string, name: string) {
  return parent === "/" ? `/${name}` : `${parent.replace(/\/+$/u, "")}/${name}`;
}

function siteSubtitle(site: SshSite) {
  const host = site.hostname ?? site.id;
  const address = site.user ? `${site.user}@${host}` : host;
  return site.port ? `${address}:${site.port}` : address;
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** SSH 站点与 SFTP 目录共用一个侧栏；目录上下文严格来源于当前分屏的活动连接。 */
export function SshExplorer({ collapsed }: SshExplorerProps) {
  const panes = useWorkbenchStore((state) => state.panes);
  const sessions = useWorkbenchStore((state) => state.sessions);
  const activePaneId = useWorkbenchStore((state) => state.activePaneId);
  const createSshTerminal = useWorkbenchStore((state) => state.createSshTerminal);
  const setTerminalRemotePath = useWorkbenchStore((state) => state.setTerminalRemotePath);
  const openSftpFile = useWorkbenchStore((state) => state.openSftpFile);
  const renameOpenSftpPath = useWorkbenchStore((state) => state.renameOpenSftpPath);
  const clipboardItem = useFileClipboardStore((state) => state.item);
  const [sites, setSites] = useState<SshSite[]>([]);
  const [recents, setRecents] = useState<SshRecentConnection[]>(loadSshRecentConnections);
  const [directory, setDirectory] = useState<SftpDirectory | null>(null);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [transferLabel, setTransferLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualTarget, setManualTarget] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [contextMenu, setContextMenu] = useState<{ entry: SftpEntry; x: number; y: number } | null>(null);
  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SftpEntry | null>(null);
  const [completionLabel, setCompletionLabel] = useState<string | null>(null);
  const directoryRequestRef = useRef(0);
  const sftpBrowserRef = useRef<HTMLElement>(null);

  const activeSession = useMemo(() => {
    const pane = panes.find((item) => item.id === activePaneId);
    const activeTab = pane?.tabs.find((item) => item.id === pane.activeTabId);
    const direct = sessions.find((session) => session.id === activeTab?.sessionId && session.ssh);
    if (direct) return direct;
    if (activeTab?.sftpFile) {
      return sessions.find((session) => session.ssh
        && session.ssh.siteId === activeTab.sftpFile!.siteId
        && session.ssh.controlPath === activeTab.sftpFile!.controlPath);
    }
    return pane?.tabs.flatMap((tab) => sessions.filter((session) => session.id === tab.sessionId && session.ssh))[0];
  }, [activePaneId, panes, sessions]);

  const connect = useCallback((site: SshSite) => {
    createSshTerminal(site);
    setRecents(rememberSshConnection(site.id));
  }, [createSshTerminal]);

  const refreshSites = useCallback(async () => {
    setSitesLoading(true);
    setError(null);
    try {
      setSites(await desktopGateway.listSshSites());
      setRecents(loadSshRecentConnections());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSitesLoading(false);
    }
  }, []);

  useEffect(() => { void refreshSites(); }, [refreshSites]);

  const loadDirectory = useCallback(async (
    sessionId: string,
    siteId: string,
    path: string,
    controlPath?: string,
  ) => {
    const requestId = directoryRequestRef.current + 1;
    directoryRequestRef.current = requestId;
    setDirectoryLoading(true);
    setError(null);
    try {
      const nextDirectory = await desktopGateway.listSftpDirectory(siteId, path, controlPath);
      if (requestId !== directoryRequestRef.current) return;
      setDirectory(nextDirectory);
      setSelectedPath("");
      if (nextDirectory.path !== path) setTerminalRemotePath(sessionId, nextDirectory.path);
    } catch (cause) {
      if (requestId !== directoryRequestRef.current) return;
      setDirectory(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (requestId === directoryRequestRef.current) setDirectoryLoading(false);
    }
  }, [setTerminalRemotePath]);

  useEffect(() => {
    if (!activeSession?.ssh) {
      directoryRequestRef.current += 1;
      setDirectory(null);
      setDirectoryLoading(false);
      return;
    }
    void loadDirectory(activeSession.id, activeSession.ssh.siteId, activeSession.ssh.remotePath, activeSession.ssh.controlPath);
  }, [activeSession?.id, activeSession?.ssh?.controlPath, activeSession?.ssh?.remotePath, activeSession?.ssh?.siteId, loadDirectory]);

  const uploadPaths = useCallback(async (paths: string[]) => {
    if (!activeSession?.ssh || !directory || paths.length === 0 || transferLabel) return;
    setTransferLabel(`正在上传 ${paths.length} 个项目…`);
    setError(null);
    try {
      const next = await desktopGateway.uploadSftpPaths(
        activeSession.ssh.siteId,
        directory.path,
        paths,
        activeSession.ssh.controlPath,
      );
      setDirectory(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setTransferLabel(null);
    }
  }, [activeSession, directory, transferLabel]);

  const containsSftpPosition = useCallback((position: { x: number; y: number }) => {
    const bounds = sftpBrowserRef.current?.getBoundingClientRect();
    return Boolean(bounds
      && position.x >= bounds.left && position.x <= bounds.right
      && position.y >= bounds.top && position.y <= bounds.bottom);
  }, []);
  const pathOver = useNativePathDropTarget(
    Boolean(activeSession?.ssh && directory && !transferLabel),
    (paths) => { void uploadPaths(paths); },
    containsSftpPosition,
  );

  const refreshCurrent = useCallback(async () => {
    if (!activeSession?.ssh) return;
    await loadDirectory(activeSession.id, activeSession.ssh.siteId, activeSession.ssh.remotePath, activeSession.ssh.controlPath);
  }, [activeSession, loadDirectory]);

  const openEntry = useCallback((entry: SftpEntry) => {
    if (!activeSession?.ssh) return;
    setContextMenu(null);
    if (entry.kind === "directory") setTerminalRemotePath(activeSession.id, entry.path);
    else openSftpFile(activeSession.id, entry);
  }, [activeSession, openSftpFile, setTerminalRemotePath]);

  const copyEntry = useCallback(async (entry: SftpEntry) => {
    if (!activeSession?.ssh || transferLabel) return;
    setContextMenu(null);
    setCompletionLabel(null);
    setError(null);
    setTransferLabel(`正在准备复制 ${entry.name}…`);
    try {
      // 远端项目先进入受控本地缓存，因此既能在 Berth 内粘贴，也能直接粘贴到 Finder。
      await copySftpFileItem({
        source: "sftp",
        name: entry.name,
        path: entry.path,
        kind: entry.kind,
        siteId: activeSession.ssh.siteId,
        controlPath: activeSession.ssh.controlPath,
      });
      setCompletionLabel(`已复制 ${entry.name}，可粘贴到 Finder`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setTransferLabel(null);
    }
  }, [activeSession, transferLabel]);

  const pasteClipboard = useCallback(async (destinationEntry?: SftpEntry) => {
    if (!activeSession?.ssh || !directory || transferLabel) return;
    const destination = destinationEntry?.kind === "directory" ? destinationEntry.path : directory.path;
    setContextMenu(null);
    setCompletionLabel(null);
    setTransferLabel("正在读取系统剪贴板…");
    setError(null);
    try {
      const item = await resolveFileClipboardItem();
      if (!item) {
        setError("系统剪贴板中没有可粘贴的文件或文件夹");
        return;
      }
      setTransferLabel(`正在粘贴 ${item.name}…`);
      const next = item.source === "local"
        ? await desktopGateway.pasteLocalPathToSftp(
            activeSession.ssh.siteId,
            destination,
            item.path,
            activeSession.ssh.controlPath,
          )
        : await desktopGateway.copySftpEntry(
            item.siteId,
            item.path,
            item.kind,
            item.controlPath,
            activeSession.ssh.siteId,
            destination,
            activeSession.ssh.controlPath,
          );
      if (destination === directory.path) setDirectory(next);
      setCompletionLabel(`已粘贴到 ${destination}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setTransferLabel(null);
    }
  }, [activeSession, directory, transferLabel]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const activeElement = document.activeElement;
      if (!activeElement || !sftpBrowserRef.current?.contains(activeElement)) return;
      const selected = directory?.entries.find((entry) => entry.path === selectedPath);
      if (event.key.toLowerCase() === "c" && selected) {
        event.preventDefault();
        void copyEntry(selected);
      } else if (event.key.toLowerCase() === "v") {
        event.preventDefault();
        void pasteClipboard(selected);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [copyEntry, directory?.entries, pasteClipboard, selectedPath]);

  const downloadEntry = useCallback(async (entry: SftpEntry) => {
    if (!activeSession?.ssh || entry.kind === "directory") return;
    setContextMenu(null);
    const localPath = await desktopGateway.pickSavePath(entry.name);
    if (!localPath) return;
    setTransferLabel(`正在下载 ${entry.name}…`);
    setError(null);
    try {
      await desktopGateway.downloadSftpFile(activeSession.ssh.siteId, entry.path, localPath, activeSession.ssh.controlPath);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setTransferLabel(null);
    }
  }, [activeSession]);

  const submitName = useCallback(async (name: string) => {
    if (!activeSession?.ssh || !directory || !nameDialog) return false;
    setError(null);
    try {
      if (nameDialog.mode === "rename") {
        const openedTab = panes.flatMap((pane) => pane.tabs).find((tab) => (
          tab.sftpFile?.siteId === activeSession.ssh!.siteId
          && tab.sftpFile.controlPath === activeSession.ssh!.controlPath
          && tab.sftpFile.path === nameDialog.entry.path
        ));
        if (openedTab?.dirty) {
          setError("该远端文件有未保存修改，请先保存或关闭标签后再重命名");
          return false;
        }
        const nextPath = joinRemotePath(parentRemotePath(nameDialog.entry.path), name);
        await desktopGateway.renameSftpEntry(
          activeSession.ssh.siteId,
          nameDialog.entry.path,
          nextPath,
          activeSession.ssh.controlPath,
        );
        renameOpenSftpPath(activeSession.ssh.siteId, activeSession.ssh.controlPath, nameDialog.entry.path, nextPath);
      } else {
        await desktopGateway.createSftpEntry(
          activeSession.ssh.siteId,
          joinRemotePath(directory.path, name),
          nameDialog.mode,
          activeSession.ssh.controlPath,
        );
      }
      await refreshCurrent();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    }
  }, [activeSession, directory, nameDialog, panes, refreshCurrent, renameOpenSftpPath]);

  const confirmDelete = useCallback(async () => {
    if (!activeSession?.ssh || !deleteTarget) return;
    const isOpen = panes.some((pane) => pane.tabs.some((tab) => (
      tab.sftpFile?.siteId === activeSession.ssh!.siteId
      && tab.sftpFile.controlPath === activeSession.ssh!.controlPath
      && tab.sftpFile.path === deleteTarget.path
    )));
    if (isOpen) {
      setError("请先关闭已打开的远端文件标签，再执行删除");
      setDeleteTarget(null);
      return;
    }
    setTransferLabel(`正在删除 ${deleteTarget.name}…`);
    setError(null);
    try {
      await desktopGateway.deleteSftpEntry(activeSession.ssh.siteId, deleteTarget.path, deleteTarget.kind, activeSession.ssh.controlPath);
      setDeleteTarget(null);
      await refreshCurrent();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setTransferLabel(null);
    }
  }, [activeSession, deleteTarget, panes, refreshCurrent]);

  return (
    <aside className={`file-explorer ssh-explorer ${collapsed ? "is-collapsed" : ""}`} aria-label="SSH 与 SFTP">
      <div className="sidebar-heading">
        <div><span className="sidebar-eyebrow">远程</span><h2>SSH / SFTP</h2></div>
        <div className="heading-actions">
          <IconButton label="刷新 SSH 站点" onClick={() => void refreshSites()} disabled={sitesLoading}>
            <RefreshCw className={sitesLoading ? "is-spinning" : ""} size={14} />
          </IconButton>
        </div>
      </div>

      <div className="ssh-explorer__content">
        <section className="ssh-sites" aria-label="SSH 站点">
          <div className="ssh-section-heading"><span>站点</span><small>{sites.length}</small></div>
          <form className="ssh-connect-form" onSubmit={(event) => {
            event.preventDefault();
            const target = manualTarget.trim();
            if (!target || target.startsWith("-") || /\s/u.test(target)) {
              setError("请输入 host、SSH 别名或 user@host，不要包含空格");
              return;
            }
            setError(null);
            connect({ id: target });
            setManualTarget("");
          }}>
            <Server size={13} />
            <input value={manualTarget} onChange={(event) => setManualTarget(event.target.value)} placeholder="host 或 user@host" aria-label="SSH 连接地址" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
            <button type="submit" disabled={!manualTarget.trim()}>连接</button>
          </form>
          {recents.length > 0 ? (
            <div className="ssh-recents" aria-label="最近连接">
              <div className="ssh-section-heading"><span>最近连接</span><small>{recents.length}</small></div>
              {recents.map((recent) => (
                <div className="ssh-recent" key={recent.id}>
                  <button type="button" className="ssh-recent__connect" onClick={() => connect({ id: recent.target })} title={`连接 ${recent.target}`}>
                    <Server size={12} /><span><strong>{recent.label}</strong><small>{recent.target}</small></span>
                  </button>
                  <IconButton label={recent.pinned ? "取消置顶" : "置顶"} onClick={() => setRecents(toggleSshRecentPin(recent.id))}>
                    {recent.pinned ? <PinOff size={11} /> : <Pin size={11} />}
                  </IconButton>
                  <IconButton label="移除记录" onClick={() => setRecents(removeSshRecentConnection(recent.id))}><Trash2 size={11} /></IconButton>
                </div>
              ))}
            </div>
          ) : null}
          {sites.map((site) => (
            <button type="button" className="ssh-site" key={site.id} onClick={() => connect(site)} title={`在当前分屏新建 ${site.id} 连接`}>
              <span className="ssh-site__icon"><Server size={13} /></span>
              <span className="ssh-site__identity"><strong>{site.id}</strong><small>{siteSubtitle(site)}</small></span>
              <Plus size={13} />
            </button>
          ))}
          {!sitesLoading && sites.length === 0 ? <p className="ssh-empty">系统 SSH 已可用。当前没有 ~/.ssh/config，可直接输入服务器地址连接。</p> : null}
        </section>

        <section ref={sftpBrowserRef} className={`sftp-browser ${pathOver ? "is-path-over" : ""}`} aria-label="当前分屏 SFTP 文件">
          <div className="ssh-section-heading">
            <span>SFTP</span><small>{activeSession?.ssh?.siteId ?? "未连接"}</small>
          </div>
          {activeSession?.ssh ? (
            <>
              <div className="sftp-pathbar">
                <IconButton label="返回上级目录" disabled={activeSession.ssh.remotePath === "/" || directoryLoading} onClick={() => setTerminalRemotePath(activeSession.id, parentRemotePath(activeSession.ssh!.remotePath))}>
                  <ChevronLeft size={13} />
                </IconButton>
                <span title={directory?.path ?? activeSession.ssh.remotePath}>{directory?.path ?? activeSession.ssh.remotePath}</span>
                <IconButton label="刷新 SFTP 目录" disabled={directoryLoading} onClick={() => void refreshCurrent()}>
                  <RefreshCw className={directoryLoading ? "is-spinning" : ""} size={13} />
                </IconButton>
              </div>
              <div className="sftp-actions" aria-label="远端文件操作">
                <IconButton label="上传文件" disabled={!directory || Boolean(transferLabel)} onClick={() => void desktopGateway.pickFiles().then(uploadPaths)}><Upload size={13} /></IconButton>
                <IconButton label="新建远端文件" disabled={!directory || Boolean(transferLabel)} onClick={() => setNameDialog({ mode: "file" })}><FilePlus2 size={13} /></IconButton>
                <IconButton label="新建远端文件夹" disabled={!directory || Boolean(transferLabel)} onClick={() => setNameDialog({ mode: "directory" })}><FolderPlus size={13} /></IconButton>
                <IconButton
                  label={clipboardItem ? `粘贴 ${clipboardItem.name}` : "从系统剪贴板粘贴"}
                  disabled={!directory || Boolean(transferLabel)}
                  onClick={() => void pasteClipboard(directory?.entries.find((entry) => entry.path === selectedPath))}
                ><ClipboardPaste size={13} /></IconButton>
                <span title={completionLabel ?? (clipboardItem ? `已复制 ${clipboardItem.name}` : "也可从访达拖入")}>
                  {completionLabel ?? (clipboardItem ? `已复制 ${clipboardItem.name}` : "也可从访达拖入")}
                </span>
              </div>
              {transferLabel ? <div className="sftp-transfer" role="status"><span>{transferLabel}</span><i /></div> : null}
              <div className="sftp-entries">
                {directory?.entries.map((entry) => (
                  <button
                    type="button"
                    key={entry.path}
                    className={`sftp-entry ${selectedPath === entry.path ? "is-selected" : ""} ${clipboardItem?.source === "sftp" && clipboardItem.path === entry.path && clipboardItem.siteId === activeSession.ssh!.siteId && clipboardItem.controlPath === activeSession.ssh!.controlPath ? "is-copied" : ""}`}
                    onMouseDown={(event) => event.currentTarget.focus({ preventScroll: true })}
                    onClick={() => setSelectedPath(entry.path)}
                    onDoubleClick={() => openEntry(entry)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.currentTarget.focus({ preventScroll: true });
                      setSelectedPath(entry.path);
                      setContextMenu({ entry, x: event.clientX, y: event.clientY });
                    }}
                  >
                    {entry.kind === "directory" ? <Folder size={13} /> : <File size={13} />}
                    <span><strong>{entry.name}</strong><small>{entry.modified}</small></span>
                    {entry.kind === "file" ? <small>{formatSize(entry.size)}</small> : null}
                  </button>
                ))}
                {directoryLoading ? <p className="ssh-empty">正在读取远端目录…</p> : null}
                {!directoryLoading && directory && directory.entries.length === 0 ? <p className="ssh-empty">此目录为空</p> : null}
              </div>
            </>
          ) : <p className="ssh-empty ssh-empty--context">请选择包含 SSH 终端的分屏，或点击站点新建连接。</p>}
        </section>
      </div>
      {error ? <button type="button" className="file-operation-error" onClick={() => setError(null)}>{error}</button> : null}

      {contextMenu ? (
        <SftpEntryContextMenu
          entry={contextMenu.entry}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onOpen={() => openEntry(contextMenu.entry)}
          onDownload={() => void downloadEntry(contextMenu.entry)}
          onCopy={() => void copyEntry(contextMenu.entry)}
          canPaste={!transferLabel}
          pasteName={clipboardItem?.name}
          onPaste={() => void pasteClipboard(contextMenu.entry)}
          onRename={() => { setContextMenu(null); setNameDialog({ mode: "rename", entry: contextMenu.entry }); }}
          onDelete={() => { setContextMenu(null); setDeleteTarget(contextMenu.entry); }}
        />
      ) : null}
      {nameDialog ? (
        <SftpNameDialog
          title={nameDialog.mode === "rename" ? "重命名远端项目" : nameDialog.mode === "file" ? "新建远端文件" : "新建远端文件夹"}
          description={nameDialog.mode === "rename" ? nameDialog.entry.path : `将在 ${directory?.path ?? "."} 中创建`}
          initialName={nameDialog.mode === "rename" ? nameDialog.entry.name : ""}
          onCancel={() => setNameDialog(null)}
          onSubmit={submitName}
        />
      ) : null}
      {deleteTarget ? (
        <div className="modal-scrim" role="presentation" onMouseDown={() => setDeleteTarget(null)}>
          <section className="unsaved-changes-dialog" role="alertdialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="unsaved-changes-dialog__heading"><span><Trash2 size={17} /></span><div><small>远端删除</small><h2>删除“{deleteTarget.name}”？</h2></div></div>
            <p>{deleteTarget.kind === "directory" ? "仅可删除空目录。" : "此操作会直接删除服务器上的文件，无法移入本机废纸篓。"}</p>
            <footer>
              <button className="button button--secondary" type="button" disabled={Boolean(transferLabel)} onClick={() => setDeleteTarget(null)}>取消</button>
              <button className="button button--danger" type="button" disabled={Boolean(transferLabel)} onClick={() => void confirmDelete()}>{transferLabel ? "正在删除…" : "删除"}</button>
            </footer>
          </section>
        </div>
      ) : null}
    </aside>
  );
}
