import { Check, Clapperboard, Film, Images, Languages, Mic2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { AgentQuestion } from "../types/chat";

interface QuestionOptionsProps {
  questions: AgentQuestion[];
  onSubmit: (answer: string) => void;
}

const iconMap = {
  Clapperboard,
  Mic2,
  Languages,
  Images,
  Film
};

export function QuestionOptions({ questions, onSubmit }: QuestionOptionsProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const isComplete = questions.every((question) => answers[question.id]);

  const answerText = useMemo(() => {
    const lines = questions.map((question) => {
      const option = question.options.find((item) => item.id === answers[question.id]);
      return `- ${question.title}：${option?.label || ""}`;
    });
    return `已确认设置：\n${lines.join("\n")}`;
  }, [answers, questions]);

  return (
    <div className="question-card">
      {questions.map((question) => {
        const Icon = iconMap[question.icon as keyof typeof iconMap] || Film;
        return (
          <div className="question-row" key={question.id}>
            <div className="question-title">
              <Icon size={18} />
              <span>{question.prompt}</span>
            </div>
            <div className="option-grid">
              {question.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`option-pill ${answers[question.id] === option.id ? "selected" : ""}`}
                  onClick={() => setAnswers((current) => ({ ...current, [question.id]: option.id }))}
                >
                  {answers[question.id] === option.id && <Check size={14} />}
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      <button
        className="primary-inline-button"
        type="button"
        disabled={!isComplete}
        onClick={() => onSubmit(answerText)}
      >
        确认这些设置
      </button>
    </div>
  );
}
