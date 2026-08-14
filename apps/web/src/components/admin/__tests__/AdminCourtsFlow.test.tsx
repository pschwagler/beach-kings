import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PendingCourtsPanel from '../courts/PendingCourtsPanel';
import SuggestionDiffRow from '../courts/SuggestionDiffRow';
import { getAdminCourtRegions } from '../courts/AllCourtsPanel';
import * as courtApi from '../../../services/api';

vi.mock('../../../services/api', () => ({
  getAdminPendingCourts: vi.fn(),
  getCourtDetailById: vi.fn(),
  adminApproveCourt: vi.fn(),
  adminRejectCourt: vi.fn(),
  updateCourtDiscovery: vi.fn(),
  resolveCourtEditSuggestion: vi.fn(),
  adminDeleteCourtPhoto: vi.fn(),
  adminReorderCourtPhotos: vi.fn(),
  adminDeleteReview: vi.fn(),
  uploadCourtPhoto: vi.fn(),
}));

vi.mock('../../court/CourtPinCorrectionMap', () => ({
  default: ({ onChange }: { onChange?: (coordinates: { latitude: number; longitude: number }) => void }) => (
    <div data-testid="pin-comparison-map">
      {onChange && <button type="button" onClick={() => onChange({ latitude: 37.7705, longitude: -122.5105 })}>Move map pin</button>}
    </div>
  ),
}));

const pendingCourt = {
  id: 41,
  name: 'Harbor Courts',
  address: '10 Boardwalk Ave',
  status: 'pending',
  surface_type: 'sand',
  court_count: 3,
  created_at: '2026-08-01T12:00:00Z',
};

describe('admin court review flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(courtApi.getAdminPendingCourts).mockResolvedValue([pendingCourt]);
    vi.mocked(courtApi.getCourtDetailById).mockResolvedValue({
      ...pendingCourt,
      slug: 'harbor-courts',
      is_active: true,
      court_photos: [],
      reviews: [],
    });
    vi.mocked(courtApi.adminApproveCourt).mockResolvedValue({ status: 'approved' });
    vi.mocked(courtApi.adminRejectCourt).mockResolvedValue({ status: 'rejected' });
    vi.mocked(courtApi.updateCourtDiscovery).mockResolvedValue({});
  });

  it('requires staff to open a draft before publishing it', async () => {
    render(<PendingCourtsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: /review submission/i }));
    expect(await screen.findByRole('button', { name: /^publish court$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^publish court$/i }));
    await waitFor(() => expect(courtApi.adminApproveCourt).toHaveBeenCalledWith(41));
    expect(await screen.findByText('Harbor Courts was published to the directory.')).toBeInTheDocument();
  });

  it('uses a second explicit click to confirm rejection', async () => {
    render(<PendingCourtsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /review submission/i }));

    fireEvent.click(await screen.findByRole('button', { name: /reject draft/i }));
    expect(courtApi.adminRejectCourt).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /confirm rejection/i }));
    await waitFor(() => expect(courtApi.adminRejectCourt).toHaveBeenCalledWith(41));
  });

  it('saves staff corrections and About before publishing the exact draft', async () => {
    render(<PendingCourtsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /review submission/i }));

    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Corrected Harbor Courts' } });
    fireEvent.change(screen.getByLabelText('About'), { target: { value: 'Three public sand courts by the pier.' } });
    fireEvent.click(screen.getByRole('button', { name: /save & publish court/i }));

    await waitFor(() => expect(courtApi.updateCourtDiscovery).toHaveBeenCalledWith(41, expect.objectContaining({
      name: 'Corrected Harbor Courts',
      description: 'Three public sand courts by the pier.',
    })));
    expect(courtApi.adminApproveCourt).toHaveBeenCalledWith(41);
  });

  it('clears conditions with null and sends a moved pin as one coordinate pair', async () => {
    vi.mocked(courtApi.getCourtDetailById).mockResolvedValue({
      ...pendingCourt,
      slug: 'harbor-courts',
      is_active: true,
      wind_exposure: 'exposed',
      wind_notes: 'Afternoon crosswind',
      sand_depth: 'deep',
      sand_notes: 'Deep near the net',
      latitude: 37.769,
      longitude: -122.51,
      court_photos: [],
      reviews: [],
    });

    render(<PendingCourtsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /review submission/i }));

    fireEvent.change(await screen.findByLabelText('Typical Wind'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Wind notes'), { target: { value: '' } });
    expect(screen.queryByLabelText(/latitude/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/longitude/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Move map pin' }));
    fireEvent.click(screen.getByRole('button', { name: /save & publish court/i }));

    await waitFor(() => expect(courtApi.updateCourtDiscovery).toHaveBeenCalledWith(41, expect.objectContaining({
      wind_exposure: null,
      wind_notes: null,
      latitude: 37.7705,
      longitude: -122.5105,
    })));
  });

  it('protects unsaved staff corrections when closing a draft', async () => {
    render(<PendingCourtsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /review submission/i }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Corrected Harbor Courts' } });

    fireEvent.click(screen.getByRole('button', { name: /discard changes/i }));
    expect(screen.getByRole('button', { name: /confirm discard/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /confirm discard/i }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Court details' })).not.toBeInTheDocument());
  });

  it('resolves cherry-picked edit requests as partially applied', async () => {
    vi.mocked(courtApi.resolveCourtEditSuggestion).mockResolvedValue({});

    render(
      <SuggestionDiffRow
        suggestion={{
          id: 7,
          court_id: 41,
          suggester_name: 'Player',
          changes: { name: 'Harbor Beach Courts', court_count: 4 },
          current: { name: 'Harbor Courts', court_count: 3 },
        }}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /exclude court count/i }));
    fireEvent.click(screen.getByRole('button', { name: /apply 1 to live court/i }));

    await waitFor(() => expect(courtApi.resolveCourtEditSuggestion).toHaveBeenCalledWith(7, 'partially_applied', {
      applied_changes: { name: 'Harbor Beach Courts' },
    }));
    expect(courtApi.updateCourtDiscovery).not.toHaveBeenCalled();
  });

  it('approves an unchanged suggestion with one resolver request', async () => {
    vi.mocked(courtApi.resolveCourtEditSuggestion).mockResolvedValue({});

    render(
      <SuggestionDiffRow
        suggestion={{ id: 10, court_id: 41, changes: { name: 'Harbor Beach Courts' }, current: { name: 'Harbor Courts' } }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /approve & update live court/i }));

    await waitFor(() => expect(courtApi.resolveCourtEditSuggestion).toHaveBeenCalledWith(10, 'approved'));
    expect(courtApi.updateCourtDiscovery).not.toHaveBeenCalled();
  });

  it('cannot leave a live update behind when suggestion resolution fails', async () => {
    vi.mocked(courtApi.resolveCourtEditSuggestion).mockRejectedValue({ response: { data: { detail: 'Could not resolve edit.' } } });

    render(
      <SuggestionDiffRow
        suggestion={{ id: 11, court_id: 41, changes: { name: 'Harbor Beach Courts', court_count: 4 }, current: { name: 'Harbor Courts', court_count: 3 } }}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /exclude court count/i }));
    fireEvent.click(screen.getByRole('button', { name: /apply 1 to live court/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not resolve edit.');
    expect(courtApi.resolveCourtEditSuggestion).toHaveBeenCalledTimes(1);
    expect(courtApi.updateCourtDiscovery).not.toHaveBeenCalled();
  });

  it('presents description suggestions as an editable About field', () => {
    render(
      <SuggestionDiffRow
        suggestion={{
          id: 8,
          court_id: 41,
          changes: { description: 'Courts beside the north pier.' },
          current: { description: 'Courts by the pier.' },
        }}
      />,
    );

    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Courts beside the north pier.');
  });

  it('reviews and applies a map pin as one paired change', async () => {
    vi.mocked(courtApi.resolveCourtEditSuggestion).mockResolvedValue({});

    render(
      <SuggestionDiffRow
        suggestion={{
          id: 9,
          court_id: 41,
          note: 'The courts are north of the parking lot.',
          changes: { latitude: 37.7705, longitude: -122.5105, wind_exposure: 'exposed' },
          current: { latitude: 37.769, longitude: -122.51, wind_exposure: 'mixed' },
        }}
      />,
    );

    expect(screen.getByText('Pin placement is applied as one change.')).toBeInTheDocument();
    expect(screen.getByText('The courts are north of the parking lot.')).toBeInTheDocument();
    expect(screen.getByTestId('pin-comparison-map')).toBeInTheDocument();
    expect(screen.queryByLabelText(/latitude/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/longitude/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /exclude latitude/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /exclude typical wind/i }));
    fireEvent.click(screen.getByRole('button', { name: /apply 1 to live court/i }));

    await waitFor(() => expect(courtApi.resolveCourtEditSuggestion).toHaveBeenCalledWith(9, 'partially_applied', {
      applied_changes: { latitude: 37.7705, longitude: -122.5105 },
    }));
    expect(courtApi.updateCourtDiscovery).not.toHaveBeenCalled();
  });

  it('builds directory region filters when region names are missing', () => {
    expect(getAdminCourtRegions([
      { id: 'one', city: 'San Diego', state: 'CA', region_id: 'southern_california' },
      { id: 'two', city: 'Austin', state: 'TX', region_id: 'texas', region_name: null },
      { id: 'three', city: 'Dallas', state: 'TX', region_id: 'texas', region_name: 'Texas' },
    ])).toEqual([
      { id: 'southern_california', name: 'Southern California' },
      { id: 'texas', name: 'Texas' },
    ]);
  });
});
