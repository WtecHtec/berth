import { useCallback, useEffect, useRef, useState } from "react";
import { Clipboard, FileText, FolderOpen, Search, X } from "../../shared/lib/icons";
import type { TreeNode } from "../../domain/workbench/models";
import { useFileTreeActions } from "../../hooks/useFileTreeActions";
import { useFileSearch } from "../../hooks/useFileSearch";
import { useAppendWorkspaceFolder } from "../../hooks/useAppendWorkspaceFolder";
import { IconButton } from "../../shared/ui/IconButton";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";
import { rememberWorkspace } from "../../infrastructure/persistence/workspaceHistory";
import { TreeRow } from "./TreeRow";
import { FileTreeContextMenu } from "./FileTreeContextMenu";
import { FileNameDialog } from "./FileNameDialog";
import { FileSearchResults } from "./FileSearchResults";
import { useGitStore } from "../../store/useGitStore";
import { findGitChange } from "../../domain/git/status";
import { useGitActions } from "../../hooks/useGitWorkspace";
import { useFileClipboardStore } from "../../store/useFileClipboardStore";
import { findTreeNodeByPath } from "../../shared/utils/tree";
import { copyLocalFileItem, resolveFileClipboardItem } from "../../hooks/useFileClipboard";
import { MoveToTrashDialog } from "./MoveToTrashDialog";

interface FileExplorerProps {
  collapsed: boolean;
}

export function FileExplorer({ collapsed }: FileExplorerProps) {
  const tree = useWorkbenchStore((state) => state.tree);
  const rootCount = useWorkbenchStore((state) => state.workspaceRoots.length);
  const openFilePath = useWorkbenchStore((state) => state.openFilePath);
  const removeWorkspaceRoot = useWorkbenchStore((state) => state.removeWorkspaceRoot);
  const setRecentWorkspaces = useWorkbenchStore((state) => state.setRecentWorkspaces);
  const actions = useFileTreeActions();
  const appendFolder = useAppendWorkspaceFolder();
  const repositories = useGitStore((state) => state.repositories);
  const gitActions = useGitActions();
  const [searchOpen, setSearchOpen] = useState(false);
  const search = useFileSearch(searchOpen);
  const [contextMenu, setContextMenu] = useState<{ node: TreeNode; x: number; y: number } | null>(null);
  const [nameDialog, setNameDialog] = useState<{ node: TreeNode; mode: "create" | "rename" } | null>(null);
  const clipboardItem = useFileClipboardStore((state) => state.item);
  const explorerRef = useRef<HTMLElement>(null);
  const [copying, setCopying] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [clipboardError, setClipboardError] = useState<string | null>(null);
  const [trashTarget, setTrashTarget] = useState<TreeNode | null>(null);
  const [trashing, setTrashing] = useState(false);

  const copyNode = useCallback(async (node: TreeNode) => {
    if (node.kind === "history" || node.kind === "session" || copying) return;
    setContextMenu(null);
    setClipboardError(null);
    setCopying(true);
    try {
      await copyLocalFileItem({
        source: "local",
        name: node.name,
        path: node.path,
        kind: node.kind === "folder" || node.kind === "root" ? "directory" : "file",
      });
    } catch (cause) {
      setClipboardError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCopying(false);
    }
  }, [copying]);

  const pasteIntoNode = useCallback(async (node: TreeNode) => {
    if (pasting) return;
    setContextMenu(null);
    setClipboardError(null);
    setPasting(true);
    try {
      // 用户明确粘贴时才读取系统剪贴板，既支持 Finder，也避免后台读取触发隐私提示。
      const item = await resolveFileClipboardItem();
      if (!item) {
        setClipboardError("系统剪贴板中没有可粘贴的文件或文件夹");
        return;
      }
      await actions.paste(item, node);
    } catch (cause) {
      setClipboardError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPasting(false);
    }
  }, [actions, pasting]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const activeElement = document.activeElement;
      if (!activeElement || !explorerRef.current?.contains(activeElement)) return;
      if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) return;
      const selected = findTreeNodeByPath(
        useWorkbenchStore.getState().tree,
        useWorkbenchStore.getState().selectedTreePath,
      );
      if (!selected) return;
      if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        void copyNode(selected);
      } else if (event.key.toLowerCase() === "v") {
        event.preventDefault();
        void pasteIntoNode(selected);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [copyNode, pasteIntoNode]);

  const beginNameOperation = (mode: "create" | "rename", node: TreeNode) => {
    setContextMenu(null);
    setNameDialog({ mode, node });
  };

  const closeSearch = () => {
    search.clear();
    setSearchOpen(false);
  };

  const openSearchResult = (result: TreeNode) => {
    openFilePath(result.path, result.name);
  };

  const removeRoot = (node: TreeNode) => {
    removeWorkspaceRoot(node.path);
    const remainingRoots = useWorkbenchStore.getState().workspaceRoots;
    if (remainingRoots.length > 0) setRecentWorkspaces(rememberWorkspace(remainingRoots));
    setContextMenu(null);
  };

  const beginMoveToTrash = (node: TreeNode) => {
    actions.clearError();
    setContextMenu(null);
    setTrashTarget(node);
  };

  const confirmMoveToTrash = async () => {
    if (!trashTarget || trashing) return;
    setTrashing(true);
    const moved = await actions.moveToTrash(trashTarget);
    setTrashing(false);
    if (moved) setTrashTarget(null);
  };

  return (
    <aside ref={explorerRef} className={`file-explorer ${collapsed ? "is-collapsed" : ""}`} aria-label="文件浏览器">
      {searchOpen ? (
        <div className="sidebar-heading sidebar-heading--search">
          <div className="file-search-input">
            <Search size={13} />
            <input
              autoFocus
              value={search.query}
              onChange={(event) => search.setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") closeSearch();
                if (event.key === "Enter" && search.results[0]) openSearchResult(search.results[0]);
              }}
              placeholder="搜索文件"
              aria-label="搜索工作区文件"
            />
            <IconButton label="关闭搜索" onClick={closeSearch}><X size={13} /></IconButton>
          </div>
        </div>
      ) : (
        <div className="sidebar-heading">
          <div>
            <span className="sidebar-eyebrow">工作区</span>
            <h2>文件</h2>
          </div>
          <div className="heading-actions">
            <IconButton label="查找文件" onClick={() => setSearchOpen(true)}><Search size={14} /></IconButton>
          </div>
        </div>
      )}
      <div className="tree" role={searchOpen ? undefined : "tree"}>
        {searchOpen ? (
          <FileSearchResults {...search} onOpen={openSearchResult} />
        ) : tree.map((node) => (
          <TreeRow
            key={node.id}
            node={node}
            onContextMenu={(target, x, y) => setContextMenu({ node: target, x, y })}
          />
        ))}
      </div>
      {actions.error || appendFolder.error || clipboardError ? (
        <button
          className="file-operation-error"
          type="button"
          onClick={() => { actions.clearError(); appendFolder.clearError(); setClipboardError(null); }}
        >
          {actions.error ?? appendFolder.error ?? clipboardError}
        </button>
      ) : null}
      <button
        className="file-explorer__add-folder"
        type="button"
        onClick={() => void appendFolder.chooseAndAppend()}
        disabled={appendFolder.loading}
      >
        <FolderOpen size={14} />
        <span>{appendFolder.loading ? "正在添加…" : "添加文件夹"}</span>
      </button>
      <div className="file-explorer__footer">
        <FileText size={13} />
        <span>{rootCount} 个根目录</span>
        {copying || clipboardItem ? <span className="file-clipboard-status" title={clipboardItem ? `已复制 ${clipboardItem.name}` : undefined}><Clipboard size={11} />{copying ? "正在复制…" : pasting ? "正在粘贴…" : clipboardItem?.name}</span> : null}
      </div>
      {contextMenu ? (
        <FileTreeContextMenu
          {...contextMenu}
          gitChange={findGitChange(repositories, contextMenu.node.path)?.change}
          onClose={() => setContextMenu(null)}
          onViewGitChange={() => {
            const located = findGitChange(repositories, contextMenu.node.path);
            if (located) gitActions.openDiff(
              located.repository,
              located.change,
              located.change.worktreeStatus ? "working" : "staged",
            );
            setContextMenu(null);
          }}
          onStage={() => {
            const located = findGitChange(repositories, contextMenu.node.path);
            if (located) void gitActions.stage(located.repository.root, located.change.path);
            setContextMenu(null);
          }}
          onUnstage={() => {
            const located = findGitChange(repositories, contextMenu.node.path);
            if (located) void gitActions.unstage(located.repository.root, located.change.path);
            setContextMenu(null);
          }}
          onCreateFile={() => beginNameOperation("create", contextMenu.node)}
          canCopy={contextMenu.node.kind !== "history" && contextMenu.node.kind !== "session"}
          canPaste={!pasting}
          pasteName={clipboardItem?.name}
          onCopy={() => void copyNode(contextMenu.node)}
          onPaste={() => void pasteIntoNode(contextMenu.node)}
          onRename={() => beginNameOperation("rename", contextMenu.node)}
          onCreateTerminal={() => { actions.createTerminal(contextMenu.node); setContextMenu(null); }}
          onReveal={() => { void actions.reveal(contextMenu.node); setContextMenu(null); }}
          canMoveToTrash={contextMenu.node.kind === "file" || contextMenu.node.kind === "folder"}
          onMoveToTrash={() => beginMoveToTrash(contextMenu.node)}
          onRemoveRoot={() => removeRoot(contextMenu.node)}
        />
      ) : null}
      {nameDialog ? (
        <FileNameDialog
          key={`${nameDialog.mode}:${nameDialog.node.id}`}
          {...nameDialog}
          onCancel={() => setNameDialog(null)}
          onSubmit={(name) => nameDialog.mode === "create"
            ? actions.createFile(nameDialog.node, name)
            : actions.rename(nameDialog.node, name)}
        />
      ) : null}
      {trashTarget ? (
        <MoveToTrashDialog
          node={trashTarget}
          moving={trashing}
          error={actions.error}
          onCancel={() => { actions.clearError(); setTrashTarget(null); }}
          onConfirm={() => void confirmMoveToTrash()}
        />
      ) : null}
    </aside>
  );
}
