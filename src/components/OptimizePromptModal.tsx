import { ImagePlus, Route, Sparkles, X } from "lucide-react";
import { useState } from "react";
import type { PromptSegment } from "../types/chat";

interface OptimizePromptModalProps {
  prompt: PromptSegment;
  onClose: () => void;
  onSubmit: (direction: string) => void;
}

const presets = [
  {
    icon: Route,
    label: "增强运镜",
    text: "请重点增强运镜设计，让每个时间段的镜头运动、景别变化、转场方式更有导演感。"
  },
  {
    icon: ImagePlus,
    label: "丰富画面",
    text: "请重点丰富画面细节，让场景、光线、人物动作、道具和环境层次更具体、更可生成。"
  },
  {
    icon: Sparkles,
    label: "丰富剧情",
    text: "请重点丰富剧情递进，让人物动机、情绪变化、前后反差和广告记忆点更清晰。"
  }
];

export function OptimizePromptModal({ prompt, onClose, onSubmit }: OptimizePromptModalProps) {
  const [customDirection, setCustomDirection] = useState("");

  function submit(direction: string) {
    if (!direction.trim()) return;
    onSubmit(direction.trim());
    onClose();
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-panel optimize-modal">
        <header className="modal-header">
          <div>
            <span className="eyebrow">
              <Sparkles size={15} />
              Optimize
            </span>
            <h2>选择优化方向</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>

        <div className="optimize-options">
          {presets.map((preset) => {
            const Icon = preset.icon;
            return (
              <button key={preset.label} type="button" onClick={() => submit(preset.text)}>
                <Icon size={19} />
                <span>{preset.label}</span>
              </button>
            );
          })}
        </div>

        <div className="custom-optimize">
          <label>
            自定义优化方向
            <textarea
              value={customDirection}
              onChange={(event) => setCustomDirection(event.target.value)}
              placeholder="例如：更像新加坡年轻女性的真实生活感，口播更自然，减少广告味..."
            />
          </label>
          <button
            className="primary-inline-button"
            type="button"
            disabled={!customDirection.trim()}
            onClick={() => submit(customDirection)}
          >
            让 Agent 判断
          </button>
        </div>
      </div>
    </div>
  );
}
