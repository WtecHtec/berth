type TerminalCommandListener = () => void;

const listeners = new Set<TerminalCommandListener>();

/** Decouples terminal input from consumers that need to react after a command is submitted. */
export function publishTerminalCommandSubmitted() {
  for (const listener of listeners) listener();
}

export function subscribeToTerminalCommandSubmitted(listener: TerminalCommandListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
