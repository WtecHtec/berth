import type { GitGateway } from "../../domain/git/GitGateway";
import { browserGitGateway } from "./browserGitGateway";
import { tauriGitGateway } from "./tauriGitGateway";

export function createGitGateway(): GitGateway {
  return window.__TAURI_INTERNALS__ ? tauriGitGateway : browserGitGateway;
}
