interface FileDraftSnapshot {
  filePath?: string;
  content: string;
}

const drafts = new Map<string, FileDraftSnapshot>();

/** 草稿只在编辑器跨布局短暂重挂载时留存，不进入全局响应式状态。 */
export function readFileDraft(tabId: string, filePath?: string) {
  const draft = drafts.get(tabId);
  return draft && draft.filePath === filePath ? draft.content : undefined;
}

export function retainFileDraft(tabId: string, filePath: string | undefined, content: string) {
  drafts.set(tabId, { filePath, content });
}

export function clearFileDraft(tabId: string) {
  drafts.delete(tabId);
}
