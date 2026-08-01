import { useEffect } from "react";
import { desktopGateway } from "../app/services";
import {
  loadCommandEnvironmentSettings,
  subscribeToCommandEnvironmentSettings,
} from "../infrastructure/persistence/commandEnvironmentRepository";

/** 应用启动及其他窗口修改配置时，同步原生子进程环境。 */
export function useCommandEnvironmentSync() {
  useEffect(() => {
    const synchronize = (settings = loadCommandEnvironmentSettings()) => {
      void desktopGateway.configureCommandEnvironment(settings);
    };
    synchronize();
    return subscribeToCommandEnvironmentSettings(synchronize);
  }, []);
}
