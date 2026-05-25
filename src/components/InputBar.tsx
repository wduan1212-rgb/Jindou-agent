import { BotMessageSquare, SendHorizonal } from "lucide-react";
interface InputBarProps {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSend: (value: string) => void;
}

export function InputBar({
  value,
  disabled,
  onChange,
  onSend
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

      <div className="input-actions">
        <button className="send-button" type="button" disabled={!value.trim() || disabled} onClick={submit}>
          <SendHorizonal size={20} />
        </button>
      </div>
    </div>
  );
}
