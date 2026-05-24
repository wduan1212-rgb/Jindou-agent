import { BotMessageSquare, Boxes, Keyboard, SendHorizonal, Settings2 } from "lucide-react";
import { ReferenceUploader } from "./ReferenceUploader";
import type { ReferenceAsset } from "../types/chat";

interface InputBarProps {
  value: string;
  references: ReferenceAsset[];
  disabled?: boolean;
  onChange: (value: string) => void;
  onReferencesChange: (references: ReferenceAsset[]) => void;
  onSend: (value: string) => void;
  onOpenSettings: () => void;
  onTemplateClick: (template: string) => void;
}

export function InputBar({
  value,
  references,
  disabled,
  onChange,
  onReferencesChange,
  onSend,
  onOpenSettings,
  onTemplateClick
}: InputBarProps) {
  function submit() {
    if (!value.trim() || disabled) return;
    onSend(value);
  }

  return (
    <div className="input-shell">
      <div className="textarea-row">
        <BotMessageSquare size={20} />
        <textarea
          value={value}
          placeholder="告诉我你的脚本雏形，或直接说你的想法..."
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
      </div>

      <ReferenceUploader references={references} onChange={onReferencesChange} />

      <div className="input-actions">
        <button className="soft-button" type="button" onClick={() => onTemplateClick("把这个脚本拆成 15 秒内的多镜头视频提示词：")}>
          <Boxes size={17} />
          提示词模板
        </button>
        <button className="icon-button" type="button" onClick={onOpenSettings} aria-label="API 设置">
          <Settings2 size={17} />
        </button>
        <button className="icon-button" type="button" aria-label="输入模式">
          <Keyboard size={17} />
        </button>
        <button className="send-button" type="button" disabled={!value.trim() || disabled} onClick={submit}>
          <SendHorizonal size={20} />
        </button>
      </div>
    </div>
  );
}
