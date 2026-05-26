import { Clock3, Clapperboard, Mic2, Film, Sparkles } from "lucide-react";
import { useState } from "react";

interface InputBarProps {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSend: (value: string) => void;
}

const inputModes = [
  { id: "creative", icon: Clapperboard, label: "创意" },
  { id: "script", icon: FileTextIcon, label: "脚本" },
  { id: "shot", icon: Film, label: "分镜" },
  { id: "style", icon: Sparkles, label: "风格" },
];

const quickActions = [
  { icon: Clock3, label: "15s", hint: "15秒" },
  { icon: Mic2, label: "口播", hint: "中文口播：" },
];

function FileTextIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}

export function InputBar({ value, disabled, onChange, onSend }: InputBarProps) {
  const [activeMode, setActiveMode] = useState("creative");

  function submit() {
    if (!value.trim() || disabled) return;
    onSend(value);
  }

  function handleQuickAction(hint: string) {
    if (!value.includes(hint)) {
      onChange(value ? `${value} ${hint}` : hint);
    }
  }

  return (
    <div className="input-shell">
      <div className="input-modes">
        {inputModes.map((mode) => {
          const Icon = mode.icon;
          return (
            <button
              key={mode.id}
              type="button"
              className={`input-mode-chip ${activeMode === mode.id ? "active" : ""}`}
              onClick={() => setActiveMode(mode.id)}
            >
              <Icon size={14} />
              {mode.label}
            </button>
          );
        })}
      </div>

      <div className="textarea-row">
        <Clapperboard size={20} />
        <textarea
          value={value}
          placeholder="描述你的想法、脚本或创意方向..."
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
      </div>

      <div className="input-actions">
        <div className="input-quick-actions">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                type="button"
                className="quick-action-chip"
                onClick={() => handleQuickAction(action.hint)}
              >
                <Icon size={14} />
                {action.label}
              </button>
            );
          })}
        </div>

        <button className="send-button" type="button" disabled={!value.trim() || disabled} onClick={submit}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m22 2-7 20-4-9-9-4Z" />
            <path d="M22 2 11 13" />
          </svg>
        </button>
      </div>
    </div>
  );
}
