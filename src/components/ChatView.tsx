import { Clapperboard, FileText, Mic2, Scissors, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { InputBar } from "./InputBar";
import { MessageBubble } from "./MessageBubble";
import type { PromptSegment } from "../types/chat";
import type { Project } from "../types/project";

interface ChatViewProps {
  project: Project;
  input: string;
  disabled?: boolean;
  onInputChange: (value: string) => void;
  onSend: (value: string) => void;
  onOptimizePrompt: (prompt: PromptSegment) => void;
  onSavePromptMemory: (prompt: PromptSegment) => void;
  onGenerateVideo: (prompt: PromptSegment) => void;
}

const quickCards = [
  { icon: Clapperboard, title: "把脚本变成", text: "视频提示词" },
  { icon: Sparkles, title: "从 0 到 1", text: "搭建广告视频" },
  { icon: Wand2, title: "优化视频模型", text: "提示词" },
  { icon: Scissors, title: "拆分 30 秒", text: "多镜头视频" },
  { icon: FileText, title: "生成单镜头", text: "脚本提示词" },
  { icon: Mic2, title: "帮我确认", text: "口播与风格" }
];

export function ChatView({
  project,
  input,
  disabled,
  onInputChange,
  onSend,
  onOptimizePrompt,
  onSavePromptMemory,
  onGenerateVideo
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [project.messages.length, disabled]);

  return (
    <main className="chat-view">
      <header className="chat-header">
        <div>
          <h1>{project.title}</h1>
          <span>对话已开始</span>
        </div>
      </header>

      <div className="chat-scroll" ref={scrollRef}>
        {project.messages.length === 0 ? (
          <section className="welcome-panel">
            <img src="/assets/agent-avatar.png" alt="" className="hero-avatar" />
            <h2>Jindou Agent</h2>
            <p>你的导演级视频提示词搭档</p>
            <div className="pixel-divider">
              <span />
            </div>
            <h3>今天想创作什么视频？</h3>
            <div className="quick-grid">
              {quickCards.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={`${card.title}-${card.text}`}
                    type="button"
                    className="quick-card"
                    onClick={() => onInputChange(`${card.title}${card.text}：`)}
                  >
                    <Icon size={26} />
                    <span>
                      {card.title}
                      <br />
                      {card.text}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : (
          <div className="message-list">
            {project.messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onOptimizePrompt={onOptimizePrompt}
                onSavePromptMemory={onSavePromptMemory}
                onGenerateVideo={onGenerateVideo}
              />
            ))}
            {disabled && (
              <div className="message-row agent">
                <img src="/assets/agent-avatar.png" alt="" className="message-avatar" />
                <div className="typing-bubble">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <InputBar
        value={input}
        disabled={disabled}
        onChange={onInputChange}
        onSend={onSend}
      />
      <div className="content-note">内容由 AI 生成，请自行核查与使用</div>
    </main>
  );
}
