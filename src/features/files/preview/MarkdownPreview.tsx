import type { ReactNode } from "react";
import { useLocalFileUrl } from "../../../hooks/useLocalFileUrl";
import { parentPath } from "../../../shared/utils/path";
import { parseMarkdown } from "../../../shared/utils/markdown";
import { codeLanguageFromAlias } from "../../../domain/files/fileLanguage";
import { HighlightedCode } from "../../../shared/ui/HighlightedCode";

const INLINE_TOKEN = /(!?\[[^\]]*\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/gu;
const WEB_URL = /^(?:https?:|mailto:|#)/iu;
const ABSOLUTE_PATH = /^(?:\/|[A-Za-z]:[\\/])/u;

function MarkdownImage({ source, alt, filePath }: { source: string; alt: string; filePath: string }) {
  const remote = /^(?:https?:|data:)/iu.test(source);
  const localPath = ABSOLUTE_PATH.test(source) ? source : `${parentPath(filePath)}/${source}`;
  const { url, error } = useLocalFileUrl(remote ? undefined : localPath, !remote);
  if (error) return <span className="markdown-image-error">图片无法加载</span>;
  return <img src={remote ? source : url ?? undefined} alt={alt} />;
}

function inlineContent(text: string, filePath: string): ReactNode[] {
  const parts = text.split(INLINE_TOKEN);
  return parts.filter(Boolean).map((part, index) => {
    const image = part.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)$/u);
    if (image) return <MarkdownImage key={index} alt={image[1]} source={image[2]} filePath={filePath} />;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/u);
    if (link) {
      const href = WEB_URL.test(link[2]) ? link[2] : undefined;
      return href ? <a key={index} href={href} target="_blank" rel="noreferrer">{link[1]}</a> : link[1];
    }
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

export function MarkdownPreview({ content, filePath }: { content: string; filePath: string }) {
  const blocks = parseMarkdown(content);
  if (!blocks.length) return <div className="content-state">这个 Markdown 文件是空的</div>;

  return (
    <article className="markdown-preview">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const Tag = `h${block.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
          return <Tag key={index}>{inlineContent(block.text, filePath)}</Tag>;
        }
        if (block.type === "paragraph") return <p key={index}>{inlineContent(block.text, filePath)}</p>;
        if (block.type === "quote") return <blockquote key={index}>{inlineContent(block.text, filePath)}</blockquote>;
        if (block.type === "rule") return <hr key={index} />;
        if (block.type === "code") {
          return (
            <pre key={index} data-language={block.language || undefined}>
              <code><HighlightedCode code={block.text} language={codeLanguageFromAlias(block.language)} /></code>
            </pre>
          );
        }
        const List = block.ordered ? "ol" : "ul";
        return <List key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{inlineContent(item, filePath)}</li>)}</List>;
      })}
    </article>
  );
}
