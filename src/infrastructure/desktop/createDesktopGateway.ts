import type { DesktopGateway } from "../../domain/desktop/DesktopGateway";
import { browserDesktopGateway } from "./browserDesktopGateway";
import { tauriDesktopGateway } from "./tauriDesktopGateway";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function createDesktopGateway(): DesktopGateway {
  return window.__TAURI_INTERNALS__ ? tauriDesktopGateway : browserDesktopGateway;
}
