import { useMemo } from "react";
import type { CodeLanguage } from "../../domain/files/fileLanguage";
import { highlightCode } from "../utils/syntaxHighlight";

interface HighlightedCodeProps {
  code: string;
  language: CodeLanguage;
}

/** Shared renderer for editor overlays and read-only Markdown code blocks. */
export function HighlightedCode({ code, language }: HighlightedCodeProps) {
  const tokens = useMemo(() => highlightCode(code, language), [code, language]);
  return tokens.map((token, index) => (
    <span className={`syntax-token syntax-token--${token.kind}`} key={index}>{token.value}</span>
  ));
}
