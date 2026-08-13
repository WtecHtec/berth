/** 在不依赖 Node path 模块的前提下返回父目录。 */
export function parentPath(path: string): string {
  const normalized = path.replace(/[\\/]+$/u, "");
  const separatorIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  if (separatorIndex < 0) return normalized;
  if (separatorIndex === 0) return normalized.slice(0, 1);
  return normalized.slice(0, separatorIndex);
}

/** 判断候选路径是否就是目标，或位于目标目录内部；分隔符边界可避免前缀误判。 */
export function isSameOrDescendantPath(candidate: string, target: string): boolean {
  if (candidate === target) return true;
  return candidate.startsWith(`${target}/`) || candidate.startsWith(`${target}\\`);
}
