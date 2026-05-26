import { SendHorizonal } from "lucide-react";

interface InputBarProps {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSend: (value: string) => void;
}

export function InputBar({ value, disabled, onChange, onSend }: InputBarProps) {
  function submit() {
    if (!value.trim() || disabled) return;
    onSend(value);
  }

  return (
    <div className="input-shell">
      <div className="textarea-row">
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
        <button className="send-button" type="button" disabled={!value.trim() || disabled} onClick={submit}>
          <SendHorizonal size={20} />
        </button>
      </div>
    </div>
  );
}
