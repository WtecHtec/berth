import type { Terminal } from "@xterm/xterm";

/**
 * 处理 xterm 在 macOS WKWebView 中的键盘兼容问题。
 *
 * 部分 WebView 会把 Shift + Quote 识别成死键并让 xterm 停留在组合输入状态，
 * 后续普通输入和退格因此无法继续处理。这里只接管无其他修饰键的双引号输入，
 * 其余按键仍完全交给 xterm，避免影响终端快捷键和输入法。
 */
export function handleXtermKeyboardCompatibility(event: KeyboardEvent, terminal: Terminal): boolean {
  const isPlainShiftedQuote = event.type === "keydown"
    && event.code === "Quote"
    && event.shiftKey
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey;

  if (!isPlainShiftedQuote) return true;

  event.preventDefault();
  terminal.input("\"", true);
  // false 表示该按键已经处理，阻止 xterm 再次进入死键或组合输入分支。
  return false;
}
