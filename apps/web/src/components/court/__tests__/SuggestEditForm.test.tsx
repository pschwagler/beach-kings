import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SuggestEditForm from '../SuggestEditForm';
import { suggestCourtEdit } from '../../../services/api';

vi.mock('../../../services/api', () => ({ suggestCourtEdit: vi.fn() }));
vi.mock('../CourtPinCorrectionMap', () => ({
  default: ({ onChange }: { onChange: (coordinates: { latitude: number; longitude: number }) => void }) => (
    <button type="button" onClick={() => onChange({ latitude: 37.771, longitude: -122.511 })}>Move proposed pin</button>
  ),
}));

describe('SuggestEditForm', () => {
  it('submits structured conditions and a paired moderated pin correction', async () => {
    vi.mocked(suggestCourtEdit).mockResolvedValue({});
    const onSuccess = vi.fn();

    render(
      <SuggestEditForm
        court={{ id: 41, name: 'Ocean Beach', latitude: 37.769, longitude: -122.51, surface_type: 'sand' }}
        onClose={vi.fn()}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.change(screen.getByLabelText('Typical wind'), { target: { value: 'exposed' } });
    fireEvent.change(screen.getByLabelText(/wind notes/i), { target: { value: 'Strong afternoon crosswind.' } });
    fireEvent.click(screen.getByLabelText(/fix map pin/i));
    expect(screen.queryByLabelText(/latitude/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/longitude/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Move proposed pin' }));
    fireEvent.change(screen.getByLabelText(/why should the pin move/i), { target: { value: 'The courts are beside the boardwalk.' } });
    fireEvent.click(screen.getByRole('button', { name: /submit suggestion/i }));

    await waitFor(() => expect(suggestCourtEdit).toHaveBeenCalledWith(41, expect.objectContaining({
      wind_exposure: 'exposed',
      wind_notes: 'Strong afternoon crosswind.',
      latitude: 37.771,
      longitude: -122.511,
    }), 'The courts are beside the boardwalk.'));
    expect(onSuccess).toHaveBeenCalled();
  });
});
