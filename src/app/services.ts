import { createDesktopGateway } from "../infrastructure/desktop/createDesktopGateway";
import { createGitGateway } from "../infrastructure/git/createGitGateway";

/** Process-wide service instances are composed once at the application boundary. */
export const desktopGateway = createDesktopGateway();
export const gitGateway = createGitGateway();
