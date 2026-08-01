import { useState } from "react";
import type { TreeNode } from "../domain/workbench/models";
import { desktopGateway } from "../app/services";
import { findTreeNodeByPath } from "../shared/utils/tree";
import { parentPath } from "../shared/utils/path";
import { useWorkbenchStore } from "../store/useWorkbenchStore";

function directoryForNode(node: TreeNode) {
  return node.kind === "root" || node.kind === "folder" ? node.path : parentPath(node.path);
}

/** Coordinates file-tree commands while keeping platform I/O out of UI components. */
export function useFileTreeActions() {
  const [error, setError] = useState<string | null>(null);
  const setNodeChildren = useWorkbenchStore((state) => state.setNodeChildren);
  const createTerminalAt = useWorkbenchStore((state) => state.createTerminalAt);
  const renameOpenPaths = useWorkbenchStore((state) => state.renameOpenPaths);

  const refreshDirectory = async (directory: string) => {
    const currentTree = useWorkbenchStore.getState().tree;
    const directoryNode = findTreeNodeByPath(currentTree, directory);
    if (!directoryNode) return;
    const children = await desktopGateway.listDirectory(directory);
    setNodeChildren(
      directoryNode.id,
      children.map((child) => ({ ...child, depth: directoryNode.depth + 1 })),
    );
  };

  const run = async (operation: () => Promise<void>) => {
    setError(null);
    try {
      await operation();
      return true;
    } catch (reason) {
      setError(String(reason));
      return false;
    }
  };

  return {
    error,
    clearError: () => setError(null),
    createFile(node: TreeNode, name: string) {
      return run(async () => {
        const directory = directoryForNode(node);
        await desktopGateway.createFile(directory, name);
        await refreshDirectory(directory);
      });
    },
    rename(node: TreeNode, name: string) {
      return run(async () => {
        const previousPath = node.path;
        const directory = parentPath(previousPath);
        const nextPath = await desktopGateway.renamePath(previousPath, name);
        renameOpenPaths(previousPath, nextPath);
        await refreshDirectory(directory);
      });
    },
    createTerminal(node: TreeNode) {
      setError(null);
      createTerminalAt(directoryForNode(node));
    },
    reveal(node: TreeNode) {
      return run(() => desktopGateway.revealInFinder(node.path));
    },
  };
}
