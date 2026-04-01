/**
 * FeedbackModal — unit tests.
 *
 * Covers:
 * - Close button has aria-label="Close"
 * - Modal renders when isOpen is true
 * - Modal does not render when isOpen is false
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../services/api', () => ({
  submitFeedback: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import FeedbackModal from '../FeedbackModal';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FeedbackModal', () => {
  it('renders when isOpen is true', () => {
    render(<FeedbackModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('Leave Feedback')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<FeedbackModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByText('Leave Feedback')).not.toBeInTheDocument();
  });

  it('close button has aria-label="Close"', () => {
    render(<FeedbackModal isOpen={true} onClose={vi.fn()} />);
    const closeButton = screen.getByRole('button', { name: /close/i });
    expect(closeButton).toHaveAttribute('aria-label', 'Close');
  });
});
