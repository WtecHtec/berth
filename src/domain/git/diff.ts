export type UnifiedDiffLineKind = "meta" | "hunk" | "context" | "addition" | "deletion";

export interface UnifiedDiffLine {
  kind: UnifiedDiffLineKind;
  content: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface ParsedUnifiedDiff {
  lines: UnifiedDiffLine[];
  lineLimitReached: boolean;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/u;
const MAX_RENDERED_DIFF_LINES = 6_000;

/** 只解析展示所需元数据，Diff 的业务语义仍以 Git 输出为准。 */
export function parseUnifiedDiff(content: string): ParsedUnifiedDiff {
  const sourceLines = content.split(/\r?\n/u);
  const visibleLines = sourceLines.slice(0, MAX_RENDERED_DIFF_LINES);
  const lines: UnifiedDiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const contentLine of visibleLines) {
    const hunk = HUNK_HEADER.exec(contentLine);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      lines.push({ kind: "hunk", content: contentLine, oldLine: null, newLine: null });
      continue;
    }
    if (contentLine.startsWith("+") && !contentLine.startsWith("+++")) {
      lines.push({ kind: "addition", content: contentLine, oldLine: null, newLine });
      newLine += 1;
      continue;
    }
    if (contentLine.startsWith("-") && !contentLine.startsWith("---")) {
      lines.push({ kind: "deletion", content: contentLine, oldLine, newLine: null });
      oldLine += 1;
      continue;
    }
    if (contentLine.startsWith(" ")) {
      lines.push({ kind: "context", content: contentLine, oldLine, newLine });
      oldLine += 1;
      newLine += 1;
      continue;
    }
    lines.push({ kind: "meta", content: contentLine, oldLine: null, newLine: null });
  }

  return { lines, lineLimitReached: sourceLines.length > MAX_RENDERED_DIFF_LINES };
}
