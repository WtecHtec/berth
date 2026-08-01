import { createDesktopGateway } from "../infrastructure/desktop/createDesktopGateway";
import { createGitGateway } from "../infrastructure/git/createGitGateway";

/** 在应用组合根中一次性创建进程级服务实例，业务层只依赖稳定接口。 */
export const desktopGateway = createDesktopGateway();
export const gitGateway = createGitGateway();
