import { MessageCircle } from 'lucide-react';

export default function VerificationCodeInput({ 
  value, 
  onChange, 
  onSendCode = null, 
  isSubmitting = false,
  placeholder = '1234'
}) {
  return (
    <label className="auth-modal__label">
      Verification Code
      <div className="auth-modal__code-row">
        <input
          type="text"
          name="code"
          className="auth-modal__input"
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          maxLength={4}
          required
        />
        {onSendCode && (
          <button
            type="button"
            className="auth-modal__ghost-button"
            onClick={onSendCode}
            disabled={isSubmitting}
          >
            <MessageCircle size={16} />
            Send Code
          </button>
        )}
      </div>
    </label>
  );
}

