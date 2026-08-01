/** Returns the containing directory without depending on Node's path module. */
export function parentPath(path: string): string {
  const normalized = path.replace(/[\\/]+$/u, "");
  const separatorIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  if (separatorIndex < 0) return normalized;
  if (separatorIndex === 0) return normalized.slice(0, 1);
  return normalized.slice(0, separatorIndex);
}
