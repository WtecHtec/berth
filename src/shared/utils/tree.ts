import type { TreeNode } from "../../domain/workbench/models";

export function toggleTreeNode(nodes: TreeNode[], id: string): TreeNode[] {
  return nodes.map((node) => {
    if (node.id === id) return { ...node, expanded: !node.expanded };
    if (!node.children) return node;
    return { ...node, children: toggleTreeNode(node.children, id) };
  });
}

export function findTreeNode(nodes: TreeNode[], id: string): TreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = node.children ? findTreeNode(node.children, id) : undefined;
    if (child) return child;
  }
  return undefined;
}

export function findTreeNodeByPath(nodes: TreeNode[], path: string): TreeNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node;
    const child = node.children ? findTreeNodeByPath(node.children, path) : undefined;
    if (child) return child;
  }
  return undefined;
}

export function setTreeNodeChildren(nodes: TreeNode[], id: string, children: TreeNode[]): TreeNode[] {
  return nodes.map((node) => {
    if (node.id === id) return { ...node, expanded: true, children };
    if (!node.children) return node;
    return { ...node, children: setTreeNodeChildren(node.children, id, children) };
  });
}
