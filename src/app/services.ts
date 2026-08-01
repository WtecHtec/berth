import { createDesktopGateway } from "../infrastructure/desktop/createDesktopGateway";

/** Process-wide service instances are composed once at the application boundary. */
export const desktopGateway = createDesktopGateway();
