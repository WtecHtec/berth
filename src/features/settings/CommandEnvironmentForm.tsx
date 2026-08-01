import { useState } from "react";
import {
  recommendedCommandEnvironmentSettings,
  type CommandEnvironmentSettings,
} from "../../domain/environment/models";
import { validateCommandEnvironmentSettings } from "../../domain/environment/environmentRules";
import { desktopGateway } from "../../app/services";
import {
  loadCommandEnvironmentSettings,
  saveCommandEnvironmentSettings,
} from "../../infrastructure/persistence/commandEnvironmentRepository";

interface EnvironmentDraft {
  inheritLoginShellPath: boolean;
  additionalPaths: string;
  removedVariables: string;
}

function settingsToDraft(settings: CommandEnvironmentSettings): EnvironmentDraft {
  return {
    inheritLoginShellPath: settings.inheritLoginShellPath,
    additionalPaths: settings.additionalPaths.join("\n"),
    removedVariables: settings.removedVariables.join("\n"),
  };
}

function draftToSettings(draft: EnvironmentDraft): CommandEnvironmentSettings {
  return {
    inheritLoginShellPath: draft.inheritLoginShellPath,
    additionalPaths: draft.additionalPaths.split(/\r?\n/u),
    removedVariables: draft.removedVariables.split(/\r?\n/u),
  };
}

export function CommandEnvironmentForm() {
  const [draft, setDraft] = useState(() => settingsToDraft(loadCommandEnvironmentSettings()));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const restoreRecommended = () => {
    setDraft(settingsToDraft(recommendedCommandEnvironmentSettings()));
    setMessage(null);
  };

  const save = async () => {
    const validation = validateCommandEnvironmentSettings(draftToSettings(draft));
    if (!validation.ok) {
      setMessage({ kind: "error", text: validation.error });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      // 原生层接受配置后再持久化，避免保存一份无法执行的环境。
      await desktopGateway.configureCommandEnvironment(validation.value);
      saveCommandEnvironmentSettings(validation.value);
      setDraft(settingsToDraft(validation.value));
      setMessage({ kind: "success", text: "已应用；Git 立即生效，新建终端将使用此配置。" });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="environment-form">
      <label className="environment-inherit-row">
        <span>
          <strong>继承登录 Shell PATH</strong>
          <small>自动发现 Homebrew、NVM 与 shell 配置的命令目录。</small>
        </span>
        <input
          type="checkbox"
          checked={draft.inheritLoginShellPath}
          onChange={(event) => setDraft((current) => ({
            ...current,
            inheritLoginShellPath: event.target.checked,
          }))}
        />
      </label>
      <label className="environment-field">
        <span>附加 PATH</span>
        <small>每行一个绝对目录，优先级高于系统 PATH。</small>
        <textarea
          value={draft.additionalPaths}
          placeholder={"/opt/homebrew/bin\n/Users/you/.local/bin"}
          spellCheck={false}
          onChange={(event) => setDraft((current) => ({ ...current, additionalPaths: event.target.value }))}
        />
      </label>
      <label className="environment-field">
        <span>启动前移除的变量</span>
        <small>每行一个名称；推荐保留 npm_config_prefix，避免 NVM 初始化冲突。</small>
        <textarea
          value={draft.removedVariables}
          spellCheck={false}
          onChange={(event) => setDraft((current) => ({ ...current, removedVariables: event.target.value }))}
        />
      </label>
      {message ? (
        <div className={`environment-form__message environment-form__message--${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>
          {message.text}
        </div>
      ) : null}
      <footer>
        <button className="button button--secondary" type="button" disabled={saving} onClick={restoreRecommended}>恢复推荐设置</button>
        <button className="button button--primary" type="button" disabled={saving} onClick={() => void save()}>{saving ? "正在应用…" : "应用环境"}</button>
      </footer>
    </div>
  );
}
