import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import CourtSearchCombobox from '../CourtSearchCombobox';
import SegmentedControl from '../../ui/SegmentedControl';
import { getPlaceSuggestions, getPublicCourts } from '../../../services/api';

vi.mock('../../../services/api', () => ({
  getPublicCourts: vi.fn(),
  getPlaceSuggestions: vi.fn(),
}));

describe('court discovery controls', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exposes stable pressed semantics for the view control', async () => {
    const onChange = vi.fn();
    render(<SegmentedControl value="list" onChange={onChange} label="Court view" options={[{ value: 'list', label: 'List' }, { value: 'map', label: 'Map' }]} />);
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Map' }));
    expect(onChange).toHaveBeenCalledWith('map');
  });

  it('groups court and place suggestions and supports keyboard selection', async () => {
    vi.useFakeTimers();
    vi.mocked(getPublicCourts).mockResolvedValue({ items: [{ id: 1, name: 'Pier Courts', slug: 'pier-courts', address: '1 Ocean Ave' }] });
    vi.mocked(getPlaceSuggestions).mockResolvedValue([{ id: 'p1', primary_text: 'Pier 25', secondary_text: 'New York, NY', latitude: 40.7, longitude: -74, result_type: 'amenity' }]);
    const onCourtSelect = vi.fn();
    render(<CourtSearchCombobox value="pi" onChange={vi.fn()} onClear={vi.fn()} onCourtSelect={onCourtSelect} onPlaceSelect={vi.fn()} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(screen.getByText('Courts')).toBeInTheDocument();
    expect(screen.getByText('Places')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(onCourtSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'Pier Courts' }));
    vi.useRealTimers();
  });

  it('does not request suggestions before two characters', () => {
    render(<CourtSearchCombobox value="p" onChange={vi.fn()} onClear={vi.fn()} onCourtSelect={vi.fn()} onPlaceSelect={vi.fn()} />);
    expect(getPublicCourts).not.toHaveBeenCalled();
    expect(getPlaceSuggestions).not.toHaveBeenCalled();
  });

  it('aborts an in-flight request when the query changes', () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.mocked(getPublicCourts).mockImplementation((_filters, requestSignal) => {
      signal = requestSignal;
      return new Promise(() => {});
    });
    vi.mocked(getPlaceSuggestions).mockResolvedValue([]);
    const common = { onChange: vi.fn(), onClear: vi.fn(), onCourtSelect: vi.fn(), onPlaceSelect: vi.fn() };
    const { rerender } = render(<CourtSearchCombobox value="pier" {...common} />);
    act(() => { vi.advanceTimersByTime(300); });
    expect(signal?.aborted).toBe(false);
    rerender(<CourtSearchCombobox value="park" {...common} />);
    expect(signal?.aborted).toBe(true);
    vi.useRealTimers();
  });
});
