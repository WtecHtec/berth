const OPTIONS_WITH_VALUE = new Set([
  "-B", "-b", "-c", "-D", "-E", "-e", "-F", "-I", "-i", "-J", "-L",
  "-l", "-m", "-O", "-o", "-p", "-Q", "-R", "-S", "-W", "-w",
]);

/** 解析用户实际提交的 ssh 命令，只返回连接目标，不执行 shell 展开。 */
export function extractSshDestination(command: string): string | null {
  const tokens = command.trim().split(/\s+/u);
  if (tokens[0] !== "ssh" && !tokens[0].endsWith("/ssh")) return null;
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--") return tokens[index + 1]?.replace(/^(['"])(.*)\1$/u, "$2") ?? null;
    if (!token.startsWith("-")) return token.replace(/^(['"])(.*)\1$/u, "$2");
    const option = token.slice(0, 2);
    if (OPTIONS_WITH_VALUE.has(option) && token.length === 2) index += 1;
  }
  return null;
}

/**
 * 从 xterm 的原始按键流维护当前输入行。这里只识别直接输入/粘贴的命令，
 * 方向键历史等复杂行编辑仍交给 shell，不据此误判远端上下文。
 */
export function collectSubmittedCommands(buffer: string, data: string) {
  const commands: string[] = [];
  let nextBuffer = buffer;
  const normalizedData = data.replace(/\u001b\[(?:200|201)~/gu, "");
  for (const character of normalizedData) {
    if (character === "\r" || character === "\n") {
      if (nextBuffer.trim()) commands.push(nextBuffer.trim());
      nextBuffer = "";
    } else if (character === "\u007f" || character === "\b") {
      nextBuffer = Array.from(nextBuffer).slice(0, -1).join("");
    } else if (character === "\u0003" || character === "\u0015" || character === "\u001b") {
      // Ctrl+C/Ctrl+U 或方向键转义序列会使本地镜像不再可靠，放弃本行检测。
      nextBuffer = "";
    } else if (character >= " ") {
      nextBuffer += character;
    }
  }
  return { buffer: nextBuffer, commands };
}
