/** POSIX-safe path quoting used for drag-to-terminal insertion. */
export function quoteShellPath(path: string): string {
  if (/^[\w./:@%+=,-]+$/u.test(path)) return path;
  return `'${path.replaceAll("'", `'\\''`)}'`;
}
