import { ChevronRight, File, FileCode2, FileText, Folder, FolderOpen, History, Play } from "../../shared/lib/icons";
import type { TreeNode } from "../../domain/workbench/models";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";
import { desktopGateway } from "../../app/services";
import { useTreePathMouseDrag } from "../../hooks/useTreePathMouseDrag";
import { useGitStore } from "../../store/useGitStore";
import { findGitChange, gitStatusLetter, gitTreeStatus } from "../../domain/git/status";

interface TreeRowProps {
  node: TreeNode;
  onContextMenu(node: TreeNode, x: number, y: number): void;
}

function NodeIcon({ node }: { node: TreeNode }) {
  if (node.kind === "folder" || node.kind === "root") return node.expanded ? <FolderOpen size={14} /> : <Folder size={14} />;
  if (node.kind === "history") return <History size={14} />;
  if (node.kind === "session") return <Play size={12} fill="currentColor" />;
  if (node.name.endsWith(".md")) return <FileText size={14} />;
  if (/\.(tsx?|rs|json|css)$/u.test(node.name)) return <FileCode2 size={14} />;
  return <File size={14} />;
}

export function TreeRow({ node, onContextMenu }: TreeRowProps) {
  const openTreeNode = useWorkbenchStore((state) => state.openTreeNode);
  const setNodeChildren = useWorkbenchStore((state) => state.setNodeChildren);
  const selectTreePath = useWorkbenchStore((state) => state.selectTreePath);
  const isSelected = useWorkbenchStore((state) => state.selectedTreePath === node.path);
  const expandable = node.kind === "root" || node.kind === "folder" || node.kind === "history";
  const pathDrag = useTreePathMouseDrag(node.path);
  const gitStatus = useGitStore((state) => gitTreeStatus(state.repositories, node.path));
  const ignored = useGitStore((state) => Boolean(state.ignoredPaths[node.path]));
  const openGitDiff = useWorkbenchStore((state) => state.openGitDiff);

  const handleOpen = async () => {
    selectTreePath(node.path);
    if (node.kind === "folder" && node.children === undefined) {
      try {
        const children = await desktopGateway.listDirectory(node.path);
        setNodeChildren(node.id, children.map((child) => ({ ...child, depth: node.depth + 1 })));
      } catch {
        setNodeChildren(node.id, []);
      }
      return;
    }
    openTreeNode(node.id);
  };

  return (
    <>
      <button
        className={`tree-row tree-row--${node.kind} ${isSelected ? "is-selected" : ""} ${pathDrag.isDragging ? "is-dragging" : ""} ${ignored ? "is-git-ignored" : ""}`}
        type="button"
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={expandable ? Boolean(node.expanded) : undefined}
        title={ignored ? `${node.path}\n被 Git 忽略` : node.path}
        style={{ "--tree-depth": node.depth } as React.CSSProperties}
        onClick={(event) => {
          if (pathDrag.suppressClick(event)) return;
          void handleOpen();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          // WebKit 右键按钮后可能保留文本选区；只清理锚点位于当前行的选区，
          // 避免影响编辑器中的正常文本选择。
          const selection = window.getSelection();
          const anchor = selection?.anchorNode;
          const focus = selection?.focusNode;
          if ((anchor && event.currentTarget.contains(anchor)) || (focus && event.currentTarget.contains(focus))) {
            selection?.removeAllRanges();
          }
          selectTreePath(node.path);
          onContextMenu(node, event.clientX, event.clientY);
        }}
        onMouseDown={pathDrag.onMouseDown}
      >
        <span className={`tree-chevron ${expandable && node.expanded ? "is-open" : ""}`}>
          {expandable ? <ChevronRight size={12} /> : null}
        </span>
        <span className="tree-icon"><NodeIcon node={node} /></span>
        <span className="tree-label">{node.name}</span>
        {node.meta ? <span className="tree-meta">{node.meta}</span> : null}
        {ignored ? (
          <span className="git-ignore-mark" aria-label="被 Git 忽略">忽略</span>
        ) : gitStatus ? (
          <span
            className={`git-mark git-mark--${gitStatus}`}
            role={gitStatus !== "changed" && node.kind === "file" ? "button" : undefined}
            tabIndex={gitStatus !== "changed" && node.kind === "file" ? 0 : undefined}
            aria-label={gitStatus !== "changed" ? `查看 ${node.name} 的更改` : "包含 Git 更改"}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              const located = findGitChange(useGitStore.getState().repositories, node.path);
              if (!located) return;
              openGitDiff({
                repositoryRoot: located.repository.root,
                path: located.change.path,
                relativePath: located.change.relativePath,
                mode: located.change.worktreeStatus ? "working" : "staged",
              });
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              const located = findGitChange(useGitStore.getState().repositories, node.path);
              if (!located) return;
              openGitDiff({
                repositoryRoot: located.repository.root,
                path: located.change.path,
                relativePath: located.change.relativePath,
                mode: located.change.worktreeStatus ? "working" : "staged",
              });
            }}
          >
            {gitStatus === "changed" ? "•" : gitStatusLetter(gitStatus)}
          </span>
        ) : null}
      </button>
      {node.expanded ? node.children?.map((child) => <TreeRow key={child.id} node={child} onContextMenu={onContextMenu} />) : null}
    </>
  );
}
