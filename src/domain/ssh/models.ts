/** 来自 ~/.ssh/config 的可连接站点，不在 Berth 内保存密码或私钥。 */
export interface SshSite {
  id: string;
  hostname?: string;
  user?: string;
  port?: number;
}

export type SftpEntryKind = "directory" | "file" | "symlink";

export interface SftpEntry {
  name: string;
  path: string;
  kind: SftpEntryKind;
  size: number;
  modified: string;
}

export interface SftpDirectory {
  path: string;
  entries: SftpEntry[];
}

export interface SftpTextFile {
  content: string;
  size: number;
  modified: string;
}

/** 只缓存连接元数据；认证材料始终由系统 OpenSSH 管理。 */
export interface SshRecentConnection {
  id: string;
  target: string;
  label: string;
  lastConnectedAt: string;
  pinned: boolean;
}
