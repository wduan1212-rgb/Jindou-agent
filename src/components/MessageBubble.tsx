import { QuestionOptions } from "./QuestionOptions";
import { PromptCard } from "./PromptCard";
import type { ChatMessage, PromptSegment } from "../types/chat";

interface MessageBubbleProps {
  message: ChatMessage;
  onQuestionSubmit: (answer: string) => void;
  onOptimizePrompt: (prompt: PromptSegment) => void;
  onSavePromptMemory: (prompt: PromptSegment) => void;
  onGenerateVideo: (prompt: PromptSegment) => void;
}

export function MessageBubble({
  message,
  onQuestionSubmit,
  onOptimizePrompt,
  onSavePromptMemory,
  onGenerateVideo
}: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`message-row ${isUser ? "user" : "agent"}`}>
      {!isUser && <img src="/assets/agent-avatar.png" alt="" className="message-avatar" />}
      <div className={`message-bubble ${message.kind}`}>
        {message.content && <div className="message-content">{message.content}</div>}

        {message.kind === "questions" && message.questions && (
          <QuestionOptions questions={message.questions} onSubmit={onQuestionSubmit} />
        )}

        {message.kind === "prompts" && message.prompts && (
          <div className="prompt-stack">
            {message.prompts.map((prompt) => (
              <PromptCard
                key={prompt.id}
                prompt={prompt}
                onOptimize={onOptimizePrompt}
                onSaveMemory={onSavePromptMemory}
                onGenerateVideo={onGenerateVideo}
              />
            ))}
          </div>
        )}
      </div>
      {isUser && <img src="/assets/user-avatar.png" alt="" className="message-avatar" />}
    </div>
  );
}
