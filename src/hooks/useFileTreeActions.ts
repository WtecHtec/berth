import { useState } from "react";
import type { TreeNode } from "../domain/workbench/models";
import { desktopGateway } from "../app/services";
import { findTreeNodeByPath } from "../shared/utils/tree";
import { isSameOrDescendantPath, parentPath } from "../shared/utils/path";
import { useWorkbenchStore } from "../store/useWorkbenchStore";
import { refreshGitWorkspace } from "./useGitWorkspace";
import type { FileClipboardItem } from "../domain/files/fileClipboard";
import { useFileClipboardStore } from "../store/useFileClipboardStore";

function directoryForNode(node: TreeNode) {
  return node.kind === "root" || node.kind === "folder" ? node.path : parentPath(node.path);
}

/** 编排文件树命令，并将平台 I/O 隔离在 UI 组件之外。 */
export function useFileTreeActions() {
  const [error, setError] = useState<string | null>(null);
  const setNodeChildren = useWorkbenchStore((state) => state.setNodeChildren);
  const createTerminalAt = useWorkbenchStore((state) => state.createTerminalAt);
  const renameOpenPaths = useWorkbenchStore((state) => state.renameOpenPaths);
  const closeOpenPaths = useWorkbenchStore((state) => state.closeOpenPaths);

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
        await refreshGitWorkspace(useWorkbenchStore.getState().workspaceRoots);
      });
    },
    rename(node: TreeNode, name: string) {
      return run(async () => {
        const previousPath = node.path;
        const directory = parentPath(previousPath);
        const nextPath = await desktopGateway.renamePath(previousPath, name);
        renameOpenPaths(previousPath, nextPath);
        await refreshDirectory(directory);
        await refreshGitWorkspace(useWorkbenchStore.getState().workspaceRoots);
      });
    },
    paste(item: FileClipboardItem, node: TreeNode) {
      return run(async () => {
        const directory = directoryForNode(node);
        if (item.source === "local") {
          await desktopGateway.copyPath(item.path, directory);
        } else {
          await desktopGateway.downloadSftpEntry(
            item.siteId,
            item.path,
            item.kind,
            directory,
            item.controlPath,
          );
        }
        await refreshDirectory(directory);
        await refreshGitWorkspace(useWorkbenchStore.getState().workspaceRoots);
      });
    },
    async moveToTrash(node: TreeNode) {
      setError(null);
      try {
        if (node.kind === "root" || node.kind === "history" || node.kind === "session") {
          throw new Error("该项目不能移到废纸篓");
        }
        const { panes } = useWorkbenchStore.getState();
        const dirtyTab = panes
          .flatMap((pane) => pane.tabs)
          .find((tab) => tab.dirty && tab.filePath && isSameOrDescendantPath(tab.filePath, node.path));
        if (dirtyTab) {
          throw new Error(`“${dirtyTab.title}”有未保存修改，请先保存或关闭标签`);
        }

        const directory = parentPath(node.path);
        await desktopGateway.moveToTrash(node.path);
        closeOpenPaths(node.path);
        useWorkbenchStore.getState().selectTreePath(directory);

        const clipboard = useFileClipboardStore.getState();
        if (clipboard.item?.source === "local"
          && isSameOrDescendantPath(clipboard.item.path, node.path)) clipboard.clear();

        try {
          // 文件树与 Git 状态彼此独立，删除成功后并行刷新可缩短等待时间。
          await Promise.all([
            refreshDirectory(directory),
            refreshGitWorkspace(useWorkbenchStore.getState().workspaceRoots),
          ]);
        } catch (reason) {
          // 移动本身已经成功，刷新失败不能让确认弹窗停留并诱导用户重复操作。
          setError(`项目已移到废纸篓，但界面刷新失败：${String(reason)}`);
        }
        return true;
      } catch (reason) {
        setError(String(reason));
        return false;
      }
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
