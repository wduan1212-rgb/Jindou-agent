import { CheckCircle2, KeyRound, Server, Video, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getLocalLlmConfig } from "../services/llmClient";
import { clearSessionApiKey, loadApiSettings, saveApiSettings } from "../services/storage";
import type { ApiSettings } from "../types/chat";

interface ApiSettingsModalProps {
  onClose: () => void;
}

export function ApiSettingsModal({ onClose }: ApiSettingsModalProps) {
  const [settings, setSettings] = useState<ApiSettings>(() => loadApiSettings());
  const [localConfig, setLocalConfig] = useState<{ hasKey: boolean; baseURL: string; model: string } | null>(null);

  useEffect(() => {
    getLocalLlmConfig().then(setLocalConfig);
  }, []);

  function update<K extends keyof ApiSettings>(key: K, value: ApiSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function save() {
    saveApiSettings(settings);
    onClose();
  }

  function pasteKey(key: "llmApiKey" | "videoApiKey", value: string) {
    update(key, value.trim());
  }

  function clearKeys() {
    clearSessionApiKey();
    setSettings(loadApiSettings());
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-panel api-modal">
        <header className="modal-header">
          <div>
            <span className="eyebrow">
              <KeyRound size={15} />
              API Settings
            </span>
            <h2>模型 API 设置</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>

        <section className="settings-section">
          <div className="section-label">
            <Server size={18} />
            语言模型 Key
          </div>
          {localConfig?.hasKey && (
            <div className="config-status">
              <CheckCircle2 size={16} />
              已有本地默认 key。粘贴新 key 会临时覆盖它。
            </div>
          )}
          <label>
            把你的语言模型 API Key 粘贴到这里
            <input
              type="password"
              value={settings.llmApiKey}
              onChange={(event) => pasteKey("llmApiKey", event.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder={localConfig?.hasKey ? "已使用本地默认 key；粘贴后覆盖" : "sk-..."}
            />
          </label>
          <p className="settings-help">只在当前浏览器会话保存，刷新后仍可使用；不在界面显示明文。</p>
        </section>

        <section className="settings-section muted-section">
          <div className="section-label">
            <Video size={18} />
            视频模型 Key
          </div>
          <label>
            把你的视频模型 API Key 粘贴到这里
            <input
              type="password"
              value={settings.videoApiKey}
              onChange={(event) => pasteKey("videoApiKey", event.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="暂未配置；第一版可先留空"
            />
          </label>
          <p className="settings-help">视频生成接口先预留，未填写时只生成可复制的视频提示词。</p>
        </section>

        <footer className="modal-actions">
          <button className="soft-button" type="button" onClick={clearKeys}>
            清除会话 Key
          </button>
          <button className="soft-button" type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary-inline-button" type="button" onClick={save}>
            保存设置
          </button>
        </footer>
      </div>
    </div>
  );
}
