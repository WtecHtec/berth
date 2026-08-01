export type FilePresentation = "image" | "video" | "audio" | "markdown" | "html" | "text";

const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "gif", "ico", "jpeg", "jpg", "png", "svg", "webp"]);
const VIDEO_EXTENSIONS = new Set(["m4v", "mov", "mp4", "ogv", "webm"]);
const AUDIO_EXTENSIONS = new Set(["aac", "flac", "m4a", "mp3", "oga", "ogg", "wav"]);
const MARKDOWN_EXTENSIONS = new Set(["markdown", "md", "mdown", "mkd"]);
const HTML_EXTENSIONS = new Set(["htm", "html"]);

/** Keeps file-type decisions independent from React and the desktop adapter. */
export function filePresentation(path?: string): FilePresentation {
  const fileName = path?.split(/[\\/]/u).pop() ?? "";
  const separator = fileName.lastIndexOf(".");
  const extension = separator >= 0 ? fileName.slice(separator + 1).toLowerCase() : "";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (AUDIO_EXTENSIONS.has(extension)) return "audio";
  if (MARKDOWN_EXTENSIONS.has(extension)) return "markdown";
  if (HTML_EXTENSIONS.has(extension)) return "html";
  return "text";
}

export function isEditablePresentation(presentation: FilePresentation): boolean {
  return presentation === "text" || presentation === "markdown" || presentation === "html";
}

export function supportsRenderedPreview(presentation: FilePresentation): boolean {
  return presentation === "markdown" || presentation === "html";
}
