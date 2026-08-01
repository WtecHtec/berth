import { ChevronRight, File, FileCode2, FileText, Folder, FolderOpen, History, Play } from "../../shared/lib/icons";
import type { TreeNode } from "../../domain/workbench/models";
import { useWorkbenchStore } from "../../store/useWorkbenchStore";
import { desktopGateway } from "../../app/services";
import { useTreePathMouseDrag } from "../../hooks/useTreePathMouseDrag";

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
        className={`tree-row tree-row--${node.kind} ${isSelected ? "is-selected" : ""} ${pathDrag.isDragging ? "is-dragging" : ""}`}
        type="button"
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={expandable ? Boolean(node.expanded) : undefined}
        style={{ "--tree-depth": node.depth } as React.CSSProperties}
        onClick={(event) => {
          if (pathDrag.suppressClick(event)) return;
          void handleOpen();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
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
        {node.gitStatus ? <span className={`git-mark git-mark--${node.gitStatus}`}>{node.gitStatus.at(0)?.toUpperCase()}</span> : null}
      </button>
      {node.expanded ? node.children?.map((child) => <TreeRow key={child.id} node={child} onContextMenu={onContextMenu} />) : null}
    </>
  );
}
