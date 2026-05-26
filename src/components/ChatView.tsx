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
  onQuestionSubmit: (answer: string) => void;
}

const launchpadCards = [
  { icon: Clapperboard, title: "从想法到成片", desc: "给我一个模糊念头，我帮你变成完整脚本", prompt: "我想做一个" },
  { icon: Scissors, title: "拆解脚本为分镜", desc: "把已有脚本拆成多镜头提示词", prompt: "帮我把这段脚本拆成分镜：" },
  { icon: Wand2, title: "优化镜头语言", desc: "让画面描述更具体、更有导演感", prompt: "帮我优化这条提示词的镜头语言：" },
  { icon: Sparkles, title: "生成风格提示词", desc: "匹配真实感、电影感、复古等风格", prompt: "帮我生成一条" },
  { icon: Mic2, title: "设计口播与声音", desc: "为视频配上自然的口播和音效设计", prompt: "帮我设计" },
  { icon: FileText, title: "参考风格分析", desc: "描述你喜欢的视频风格，我帮你提取关键元素", prompt: "我喜欢的视频风格是" },
];

export function ChatView({
  project,
  input,
  disabled,
  onInputChange,
  onSend,
  onOptimizePrompt,
  onSavePromptMemory,
  onGenerateVideo,
  onQuestionSubmit
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
            <div className="welcome-visual">
              <Clapperboard size={56} />
            </div>
            <h2>今天想创作什么？</h2>
            <p>我是你的 AI 导演搭档，帮你把想法变成可执行的视频提示词</p>
            <div className="launchpad-grid">
              {launchpadCards.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.title}
                    type="button"
                    className="launchpad-card"
                    onClick={() => onInputChange(card.prompt)}
                  >
                    <Icon size={28} />
                    <div>
                      <h3>{card.title}</h3>
                      <p>{card.desc}</p>
                    </div>
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
                onQuestionSubmit={onQuestionSubmit}
              />
            ))}
            {disabled && (
              <div className="message-row agent">
                <img src="/assets/agent-avatar.png" alt="" className="message-avatar" />
                <div className="typing-bubble">
                  <span className="typing-label">正在思考</span>
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
