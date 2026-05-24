import { Check, Copy, Download, Film, Save, Sparkles, Wand2 } from "lucide-react";
import { useState } from "react";
import { copyToClipboard } from "../services/exportManager";
import type { PromptSegment } from "../types/chat";

interface PromptCardProps {
  prompt: PromptSegment;
  onOptimize: (prompt: PromptSegment) => void;
  onSaveMemory: (prompt: PromptSegment) => void;
  onGenerateVideo: (prompt: PromptSegment) => void;
}

export function PromptCard({ prompt, onOptimize, onSaveMemory, onGenerateVideo }: PromptCardProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const ok = await copyToClipboard(prompt.prompt);
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <article className="prompt-card">
      <header className="prompt-card-header">
        <div>
          <span className="eyebrow">
            <Film size={15} />
            视频提示词
          </span>
          <h3>{prompt.title}</h3>
        </div>
        <div className="prompt-meta">
          <span>{prompt.duration} 秒</span>
          <span>{prompt.shotMode === "multi" ? "多镜头" : "单镜头"}</span>
          <span>{prompt.videoType}</span>
        </div>
      </header>

      <div className="quality-tags">
        {prompt.qualityTags.slice(0, 5).map((tag) => (
          <span key={tag}>
            <Sparkles size={13} />
            {tag}
          </span>
        ))}
      </div>

      <pre className="prompt-text">{prompt.prompt}</pre>

      <footer className="prompt-actions">
        <button type="button" className="soft-button" onClick={handleCopy}>
          {copied ? <Check size={17} /> : <Copy size={17} />}
          {copied ? "已复制" : "复制提示词"}
        </button>
        <button type="button" className="soft-button" onClick={() => onOptimize(prompt)}>
          <Wand2 size={17} />
          继续优化
        </button>
        <button type="button" className="soft-button" onClick={() => onSaveMemory(prompt)}>
          <Save size={17} />
          保存偏好
        </button>
        <button type="button" className="primary-inline-button" onClick={() => onGenerateVideo(prompt)}>
          <Download size={17} />
          生成视频
        </button>
      </footer>
    </article>
  );
}
