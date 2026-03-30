'use client';

import React from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { Button } from '../../ui/UI';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Conversation history and edit/clarify input for photo match review.
 */
interface PhotoMatchConversationProps {
  conversationHistory: ConversationMessage[];
  editPrompt: string;
  onEditPromptChange: (value: string) => void;
  onSendEdit: () => void;
  needsClarification: boolean;
  clarificationQuestion?: string;
  isProcessing: boolean;
  showEditInput: boolean;
  isSubmitting: boolean;
  conversationEndRef: React.RefObject<HTMLDivElement | null>;
}

export default function PhotoMatchConversation({
  conversationHistory,
  editPrompt,
  onEditPromptChange,
  onSendEdit,
  needsClarification,
  clarificationQuestion,
  isProcessing,
  showEditInput,
  isSubmitting,
  conversationEndRef,
}: PhotoMatchConversationProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSendEdit();
    }
  };

  return (
    <>
      {conversationHistory.length > 0 && (
        <div className="conversation-section">
          <h4>
            <MessageSquare size={16} /> Conversation
          </h4>
          <div className="conversation-messages">
            {conversationHistory.map((msg, idx) => (
              <div key={idx} className={`message ${msg.role}`}>
                <span className="message-role">{msg.role === 'user' ? 'You' : 'AI'}:</span>
                <span className="message-content">{msg.content}</span>
              </div>
            ))}
            <div ref={conversationEndRef} />
          </div>
        </div>
      )}

      {needsClarification && clarificationQuestion && conversationHistory.length === 0 && (
        <div className="clarification-needed">
          <MessageSquare size={16} />
          <span>{clarificationQuestion}</span>
        </div>
      )}

      {!isProcessing && showEditInput && (
        <div className="edit-prompt-section">
          <label>Edit or Clarify</label>
          <div className="edit-input-row">
            <textarea
              value={editPrompt}
              onChange={(e) => onEditPromptChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="E.g., 'The second game should be 21-18, not 21-19' or 'JD is John Doe'"
              rows={2}
              disabled={isSubmitting}
            />
            <Button
              variant="outline"
              onClick={onSendEdit}
              disabled={!editPrompt.trim() || isSubmitting}
            >
              <Send size={16} />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
