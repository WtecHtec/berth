type TerminalCommandListener = () => void;

const listeners = new Set<TerminalCommandListener>();

/** 解耦终端输入与命令提交后的订阅者，例如 Git 状态刷新。 */
export function publishTerminalCommandSubmitted() {
  for (const listener of listeners) listener();
}

export function subscribeToTerminalCommandSubmitted(listener: TerminalCommandListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
