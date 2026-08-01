export type CodeLanguage =
  | "css"
  | "go"
  | "html"
  | "java"
  | "javascript"
  | "json"
  | "markdown"
  | "plaintext"
  | "python"
  | "rust"
  | "shell"
  | "sql"
  | "swift"
  | "toml"
  | "typescript"
  | "yaml";

const EXTENSION_LANGUAGES: Record<string, CodeLanguage> = {
  bash: "shell",
  cjs: "javascript",
  css: "css",
  go: "go",
  htm: "html",
  html: "html",
  java: "java",
  js: "javascript",
  json: "json",
  jsonc: "json",
  jsx: "javascript",
  kt: "java",
  kts: "java",
  markdown: "markdown",
  md: "markdown",
  mjs: "javascript",
  py: "python",
  pyw: "python",
  rs: "rust",
  scss: "css",
  sh: "shell",
  sql: "sql",
  swift: "swift",
  toml: "toml",
  ts: "typescript",
  tsx: "typescript",
  vue: "html",
  yaml: "yaml",
  yml: "yaml",
  zsh: "shell",
};

const LANGUAGE_ALIASES: Record<string, CodeLanguage> = {
  bash: "shell",
  css: "css",
  go: "go",
  html: "html",
  java: "java",
  javascript: "javascript",
  js: "javascript",
  json: "json",
  jsx: "javascript",
  md: "markdown",
  plaintext: "plaintext",
  py: "python",
  python: "python",
  rs: "rust",
  rust: "rust",
  sh: "shell",
  shell: "shell",
  sql: "sql",
  swift: "swift",
  toml: "toml",
  ts: "typescript",
  tsx: "typescript",
  typescript: "typescript",
  yaml: "yaml",
  yml: "yaml",
  zsh: "shell",
};

/** 将真实文件路径映射为高亮器支持的语言类型。 */
export function codeLanguageFromPath(path?: string): CodeLanguage {
  const fileName = path?.split(/[\\/]/u).pop()?.toLowerCase() ?? "";
  if (["dockerfile", "makefile"].includes(fileName)) return "shell";
  const extension = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".") + 1) : "";
  return EXTENSION_LANGUAGES[extension] ?? "plaintext";
}

/** 规范化 Markdown 代码围栏别名，避免解析细节泄漏到 UI。 */
export function codeLanguageFromAlias(alias?: string): CodeLanguage {
  return LANGUAGE_ALIASES[alias?.trim().toLowerCase() ?? ""] ?? "plaintext";
}
