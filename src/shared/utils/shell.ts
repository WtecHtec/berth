/** 为拖入终端的路径生成符合 POSIX shell 的安全引用文本。 */
export function quoteShellPath(path: string): string {
  if (/^[\w./:@%+=,-]+$/u.test(path)) return path;
  return `'${path.replaceAll("'", `'\\''`)}'`;
}
