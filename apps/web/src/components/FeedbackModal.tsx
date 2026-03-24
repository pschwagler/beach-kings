import React, { useState } from 'react';
import { X, Send, CheckCircle, AlertCircle } from 'lucide-react';
import { submitFeedback } from '../services/api';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const [feedback, setFeedback] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!feedback.trim()) return;

    setIsSubmitting(true);
    setStatus('idle');
    setErrorMessage('');

    try {
      // Submit feedback to backend
      await submitFeedback({ feedback, email });
      
      setStatus('success');
      setFeedback('');
      setEmail('');
      
      // Close modal after showing success message for a moment
      setTimeout(() => {
        onClose();
        setStatus('idle');
      }, 2000);
    } catch (err: unknown) {
      console.error('Error submitting feedback:', err);
      setStatus('error');
      const error = err as { response?: { data?: { detail?: string } } };
      setErrorMessage(
        error.response?.data?.detail ||
        'Failed to submit feedback. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-modal-overlay">
      <div className="auth-modal feedback-modal">
        <div className="auth-modal__header">
          <h2>Leave Feedback</h2>
          <button className="auth-modal__close" onClick={onClose} aria-label="Close feedback modal">
            <X size={20} />
          </button>
        </div>

        {status === 'success' ? (
          <div className="feedback-success">
            <CheckCircle size={48} className="text-success" />
            <h3>Thank You!</h3>
            <p>Your feedback helps us improve Beach League.</p>
          </div>
        ) : (
          <>
            <p className="auth-modal__description">
              We&apos;d love to hear your thoughts about the app! Please be as specific as possible about what you like or what we can improve.
            </p>

            {status === 'error' && (
              <div className="auth-modal__alert error">
                <AlertCircle size={18} />
                <span>{errorMessage}</span>
              </div>
            )}

            <form className="auth-modal__form" onSubmit={handleSubmit}>
              <label className="auth-modal__label">
                <span>Your Feedback <span className="required-asterisk">*</span></span>
                <textarea
                  className="auth-modal__input feedback-textarea"
                  placeholder="Tell us what you think..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  required
                  rows={5}
                />
              </label>

              <label className="auth-modal__label">
                <span>Email (Optional)</span>
                <input
                  type="email"
                  className="auth-modal__input"
                  placeholder="In case we have questions"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>

              <button 
                type="submit" 
                className="auth-modal__submit" 
                disabled={isSubmitting || !feedback.trim()}
              >
                {isSubmitting ? (
                  'Sending...'
                ) : (
                  <>
                    <Send size={18} />
                    Send Feedback
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
