import { useMemo } from "react";
import type { CodeLanguage } from "../../domain/files/fileLanguage";
import { highlightCode } from "../utils/syntaxHighlight";

interface HighlightedCodeProps {
  code: string;
  language: CodeLanguage;
}

/** 编辑器高亮层与 Markdown 代码块共用的安全 token 渲染器。 */
export function HighlightedCode({ code, language }: HighlightedCodeProps) {
  const tokens = useMemo(() => highlightCode(code, language), [code, language]);
  return tokens.map((token, index) => (
    <span className={`syntax-token syntax-token--${token.kind}`} key={index}>{token.value}</span>
  ));
}
