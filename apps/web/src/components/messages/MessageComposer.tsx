import { Send } from 'lucide-react';
import './MessageThread.css';

interface MessageComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void | Promise<void>;
  sending?: boolean;
  disabled?: boolean;
  maxLength?: number;
  placeholder?: string;
  inputLabel?: string;
  inputTestId?: string;
  sendTestId?: string;
}

export default function MessageComposer({
  value,
  onChange,
  onSend,
  sending = false,
  disabled = false,
  maxLength = 500,
  placeholder = 'Type a message...',
  inputLabel = 'Message',
  inputTestId,
  sendTestId,
}: MessageComposerProps) {
  const canSend = value.trim().length > 0 && !sending && !disabled;

  const submit = () => {
    if (canSend) void onSend();
  };

  return (
    <div className="message-thread-composer">
      <div className="message-thread-input-wrapper">
        <textarea
          className="message-thread-input"
          value={value}
          onChange={(event) => onChange(event.target.value.slice(0, maxLength))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          aria-label={inputLabel}
          disabled={disabled || sending}
          rows={1}
          data-testid={inputTestId}
        />
        {value.length > maxLength - 50 && (
          <span className={`message-thread-char-count${value.length >= maxLength ? ' message-thread-char-count--limit' : ''}`}>
            {value.length}/{maxLength}
          </span>
        )}
      </div>
      <button
        className="message-thread-send"
        type="button"
        onClick={submit}
        disabled={!canSend}
        aria-label="Send message"
        title="Send"
        data-testid={sendTestId}
      >
        <Send size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
