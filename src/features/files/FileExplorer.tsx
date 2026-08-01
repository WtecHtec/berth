import { useState } from "react";
import { FileText, FolderOpen, Search, X } from "../../shared/lib/icons";
import type { TreeNode } from "../../domain/workbench/models";
import { useFileTreeActions } from "../../hooks/useFileTreeActions";
import { useFileSearch } from "../../hooks/useFileSearch";
import { useAppendWorkspaceFolder } from "../../hooks/useAppendWorkspaceFolder";
import { IconButton } from "../../shared/ui/IconButton";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";
import { TreeRow } from "./TreeRow";
import { FileTreeContextMenu } from "./FileTreeContextMenu";
import { FileNameDialog } from "./FileNameDialog";
import { FileSearchResults } from "./FileSearchResults";

interface FileExplorerProps {
  collapsed: boolean;
}

export function FileExplorer({ collapsed }: FileExplorerProps) {
  const tree = useWorkbenchStore((state) => state.tree);
  const rootCount = useWorkbenchStore((state) => state.workspaceRoots.length);
  const openFilePath = useWorkbenchStore((state) => state.openFilePath);
  const actions = useFileTreeActions();
  const appendFolder = useAppendWorkspaceFolder();
  const [searchOpen, setSearchOpen] = useState(false);
  const search = useFileSearch(searchOpen);
  const [contextMenu, setContextMenu] = useState<{ node: TreeNode; x: number; y: number } | null>(null);
  const [nameDialog, setNameDialog] = useState<{ node: TreeNode; mode: "create" | "rename" } | null>(null);

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

  return (
    <aside className={`file-explorer ${collapsed ? "is-collapsed" : ""}`} aria-label="文件浏览器">
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
      {actions.error || appendFolder.error ? (
        <button
          className="file-operation-error"
          type="button"
          onClick={() => { actions.clearError(); appendFolder.clearError(); }}
        >
          {actions.error ?? appendFolder.error}
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
      </div>
      {contextMenu ? (
        <FileTreeContextMenu
          {...contextMenu}
          onClose={() => setContextMenu(null)}
          onCreateFile={() => beginNameOperation("create", contextMenu.node)}
          onRename={() => beginNameOperation("rename", contextMenu.node)}
          onCreateTerminal={() => { actions.createTerminal(contextMenu.node); setContextMenu(null); }}
          onReveal={() => { void actions.reveal(contextMenu.node); setContextMenu(null); }}
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
    </aside>
  );
}
