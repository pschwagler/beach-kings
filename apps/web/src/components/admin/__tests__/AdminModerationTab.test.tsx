import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminModerationTab from '../AdminModerationTab';
import * as adminApi from '../../../services/endpoints/admin';

const replace = vi.fn();
let params = new URLSearchParams('tab=moderation');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => params,
}));
vi.mock('../../../services/endpoints/admin', () => ({
  getModerationCases: vi.fn(), getModerationOverview: vi.fn(), getModerationCase: vi.fn(),
  getModerationContext: vi.fn(), getModerationEvidenceUrl: vi.fn(),
  applyModerationAction: vi.fn(), createModerationEscalation: vi.fn(), retryModerationJob: vi.fn(),
}));

const totals = { active: 1, all: 3, urgent: 1, due: 1, overdue: 0, ordinary: 0, open: 1, acknowledged: 0, closed: 2 };
const summary = {
  id: 17, target_type: 'league_message', target_id: 81, state: 'open', severity: 'urgent',
  due_at: '2099-01-01T00:00:00Z', current_action: null, report_count: 2,
  incident_type: 'stalking_doxxing', urgent_since_at: '2026-01-01T12:00:00Z', dispositioned_at: null,
  subject_name: 'Subject Name', target_title: 'League message', target_snippet: 'Reviewable content',
  target_media_type: null, source: 'member_report', primary_reason: 'harassment',
};
const detail = {
  ...summary, legal_hold: false, subject: { id: 4, display_name: 'Subject Name' },
  target: { kind: 'league_message', available: true, title: 'League message', text: 'Reviewable content', visibility: 'visible', metadata: { league_id: 3 } },
  reports: [{ id: 2, reason: 'harassment', details: 'Repeated abuse', created_at: '2026-01-01T12:00:00Z' }],
  provider_reviews: [{ flagged: true, categories: { harassment: true }, model: 'moderation-model', recommendation: { recommendation: 'owner_review', rationale: 'Human context required' }, error: null, created_at: '2026-01-01T12:01:00Z' }],
  evidence: [{ id: 5, state: 'available', content_type: 'image', captured_at: '2026-01-01T12:01:00Z', purge_after: null }],
  jobs: [], appeals: [], allowed_actions: ['acknowledge', 'dismiss', 'warn'],
  events: [{ id: 7, event_type: 'report_received', operator_user_id: null, operator_name: null, reason: null, created_at: '2026-01-01T12:00:00Z' }],
};

describe('AdminModerationTab', () => {
  beforeEach(() => {
    params = new URLSearchParams('tab=moderation'); replace.mockReset();
    vi.mocked(adminApi.getModerationCases).mockResolvedValue({ items: [summary], totals, total: 3, total_pages: 1 });
    vi.mocked(adminApi.getModerationOverview).mockResolvedValue({ mode: 'shadow', queues: totals, generated_at: '2026-01-01T00:00:00Z', jobs: { pending: 1, processing: 0, failed: 0, stale: 0, oldest_pending_at: null, latest_completion_at: null }, alerts: { pending: 2, failed: 0, latest_delivery_at: null }, sla: { unacknowledged_urgent: 1, ordinary_due_soon: 1, overdue: 0 } });
    vi.mocked(adminApi.getModerationCase).mockResolvedValue(detail);
    vi.mocked(adminApi.getModerationContext).mockResolvedValue({
      available: true,
      captured_at: '2026-01-01T12:00:00Z',
      messages: [
        { id: 80, created_at: '2026-01-01T11:59:00Z', speaker: 'other', text: 'Previous message', is_target: false },
        { id: 81, created_at: '2026-01-01T12:00:00Z', speaker: 'subject', text: 'Reviewable content', is_target: true },
      ],
    });
    vi.mocked(adminApi.getModerationEvidenceUrl).mockResolvedValue({ url: 'https://evidence.example/item', expires_in: 300 });
    vi.mocked(adminApi.applyModerationAction).mockResolvedValue({});
    vi.mocked(adminApi.createModerationEscalation).mockResolvedValue({});
    vi.mocked(adminApi.retryModerationJob).mockResolvedValue({});
  });

  it('defaults to all active attention, shows the result total, and writes case selection to the URL', async () => {
    render(<AdminModerationTab />);
    expect(await screen.findByText('Case 17')).toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 3 cases')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Active/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(adminApi.getModerationCases).toHaveBeenCalledWith(expect.objectContaining({ state: 'active', queue: undefined }));
    expect(screen.getByText('shadow')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Case 17'));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(expect.stringContaining('case=17'), { scroll: false }));
  });

  it('offers all cases independently from attention and clears selection when a filter changes', async () => {
    params = new URLSearchParams('tab=moderation&state=open&queue=urgent&case=17');
    render(<AdminModerationTab />);
    await screen.findByText('Reported content & context');
    fireEvent.click(screen.getByRole('button', { name: /^All cases/ }));
    expect(replace).toHaveBeenCalledWith(expect.not.stringContaining('case=17'), { scroll: false });
    expect(replace).toHaveBeenCalledWith(expect.stringContaining('state=all'), { scroll: false });
  });

  it('renders content, advisory provider context, evidence messaging, and reporter secrecy', async () => {
    params = new URLSearchParams('tab=moderation&state=active&case=17');
    render(<AdminModerationTab />);
    expect((await screen.findAllByText('Reviewable content')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Human context required/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show conversation context/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reveal image evidence/ })).toBeInTheDocument();
    expect(screen.getByText('Reporter identities are intentionally hidden.')).toBeInTheDocument();
    expect(screen.queryByText(/reporter.*name/i)).not.toBeInTheDocument();
  });

  it('loads audited bounded conversation context on demand', async () => {
    params = new URLSearchParams('tab=moderation&state=active&case=17');
    render(<AdminModerationTab />);
    fireEvent.click(await screen.findByRole('button', { name: /Show conversation context/ }));
    expect(await screen.findByText('Previous message')).toBeInTheDocument();
    expect(screen.getByText('Reported message')).toBeInTheDocument();
    expect(adminApi.getModerationContext).toHaveBeenCalledWith(17);
  });

  it('reveals restricted image evidence only after an explicit action', async () => {
    params = new URLSearchParams('tab=moderation&state=active&case=17');
    render(<AdminModerationTab />);
    expect(screen.queryByRole('img', { name: 'Restricted evidence for case 17' })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Reveal image evidence/ }));
    expect(await screen.findByRole('img', { name: 'Restricted evidence for case 17' })).toHaveAttribute('src', 'https://evidence.example/item');
    expect(adminApi.getModerationEvidenceUrl).toHaveBeenCalledWith(17, 5);
  });

  it('explains unavailable context for legacy cases', async () => {
    params = new URLSearchParams('tab=moderation&state=active&case=17');
    vi.mocked(adminApi.getModerationContext).mockResolvedValue({ available: false, reason: 'not_captured', messages: [] });
    render(<AdminModerationTab />);
    fireEvent.click(await screen.findByRole('button', { name: /Show conversation context/ }));
    expect(await screen.findByText('Conversation context was not captured for this legacy case.')).toBeInTheDocument();
  });

  it('shows a deliberate access-denied state on a system-admin 403', async () => {
    const denied = Object.assign(new Error('denied'), { isAxiosError: true, response: { status: 403 } });
    vi.mocked(adminApi.getModerationCases).mockRejectedValue(denied);
    render(<AdminModerationTab />);
    expect(await screen.findByText('System-admin access required')).toBeInTheDocument();
  });

  it('records a human appeal decision against the selected appeal', async () => {
    params = new URLSearchParams('tab=moderation&state=active&case=17');
    vi.mocked(adminApi.getModerationCase).mockResolvedValue({
      ...detail,
      appeals: [{
        id: 9,
        case_id: 17,
        status: 'open',
        statement: 'There is additional context for this interaction.',
        resolution_reason: null,
        created_at: '2026-01-02T12:00:00Z',
        resolved_at: null,
      }],
      allowed_actions: ['grant_appeal', 'uphold_appeal'],
    });
    render(<AdminModerationTab />);

    fireEvent.click(await screen.findByRole('button', { name: 'Grant appeal' }));
    fireEvent.change(screen.getByLabelText('Required reason'), {
      target: { value: 'The new context changes the policy determination.' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Grant appeal' }).at(-1)!);

    await waitFor(() => expect(adminApi.applyModerationAction).toHaveBeenCalledWith(17, {
      action: 'grant_appeal',
      reason: 'The new context changes the policy determination.',
      appeal_id: 9,
    }));
  });

  it('requires confirmation and explains the consequence for account suspension', async () => {
    params = new URLSearchParams('tab=moderation&state=active&case=17');
    vi.mocked(adminApi.getModerationCase).mockResolvedValue({ ...detail, allowed_actions: ['account_suspend'] });
    render(<AdminModerationTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'Suspend account' }));
    expect(screen.getByText('Suspends the subject’s account for 24 hours.')).toBeInTheDocument();
    const submit = screen.getAllByRole('button', { name: 'Suspend account' }).at(-1)!;
    fireEvent.change(screen.getByLabelText('Required reason'), { target: { value: 'Repeated severe policy violations.' } });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByLabelText('I understand and confirm this action.'));
    expect(submit).toBeEnabled();
  });

  it('shows the urgent incident checklist and records a human external response', async () => {
    params = new URLSearchParams('tab=moderation&state=active&case=17');
    render(<AdminModerationTab />);

    expect(await screen.findByText('stalking doxxing')).toBeInTheDocument();
    expect(screen.getByText(/Assess ongoing access/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Record a human-reviewed external response'));
    fireEvent.change(screen.getByLabelText('Required operational note'), { target: { value: 'Consulted the safety specialist using synthetic context.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record response' }));

    await waitFor(() => expect(adminApi.createModerationEscalation).toHaveBeenCalledWith(17, {
      channel: 'specialist_consultation',
      jurisdiction: 'unknown',
      note: 'Consulted the safety specialist using synthetic context.',
    }));
  });

  it('debounces ID search into URL state without requesting on every keystroke', async () => {
    render(<AdminModerationTab />);
    await screen.findByText('Case 17');
    const initialCalls = vi.mocked(adminApi.getModerationCases).mock.calls.length;

    fireEvent.change(screen.getByPlaceholderText('Search case or target ID'), { target: { value: '17' } });
    expect(adminApi.getModerationCases).toHaveBeenCalledTimes(initialCalls);
    expect(replace).not.toHaveBeenCalledWith(expect.stringContaining('search=17'), expect.anything());

    await waitFor(() => expect(replace).toHaveBeenCalledWith(expect.stringContaining('search=17'), { scroll: false }), { timeout: 800 });
    expect(adminApi.getModerationCases).toHaveBeenCalledTimes(initialCalls);
  });

  it('ignores an older case response after the operator opens a newer case', async () => {
    const secondSummary = { ...summary, id: 18, target_id: 82, target_title: 'Newer case' };
    vi.mocked(adminApi.getModerationCases).mockResolvedValue({ items: [summary, secondSummary], totals, total: 2, total_pages: 1 });
    let resolveFirst!: (value: typeof detail) => void;
    let resolveSecond!: (value: typeof detail) => void;
    vi.mocked(adminApi.getModerationCase)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    render(<AdminModerationTab />);
    await screen.findByText('Case 17');

    fireEvent.click(screen.getByText('Case 17'));
    fireEvent.click(screen.getByText('Case 18'));
    resolveSecond({ ...detail, ...secondSummary, target: { ...detail.target, title: 'Newer case' } });
    expect(await screen.findByRole('heading', { name: 'Newer case' })).toBeInTheDocument();
    resolveFirst(detail);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Newer case' })).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'League message' })).not.toBeInTheDocument();
  });

  it('removes restricted evidence from the DOM when its signed URL expires', async () => {
    params = new URLSearchParams('tab=moderation&state=active&case=17');
    vi.mocked(adminApi.getModerationEvidenceUrl).mockResolvedValue({ url: 'https://evidence.example/short', expires_in: 0.02 });
    render(<AdminModerationTab />);
    fireEvent.click(await screen.findByRole('button', { name: /Reveal image evidence/ }));
    expect(await screen.findByRole('img', { name: 'Restricted evidence for case 17' })).toHaveAttribute('referrerpolicy', 'no-referrer');

    await waitFor(() => expect(screen.queryByRole('img', { name: 'Restricted evidence for case 17' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Reveal image evidence/ })).toBeInTheDocument();
  });

  it('locks action controls while a mutation is in progress', async () => {
    params = new URLSearchParams('tab=moderation&state=active&case=17');
    let finish!: (value: object) => void;
    vi.mocked(adminApi.applyModerationAction).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<AdminModerationTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'Acknowledge' }));
    fireEvent.change(screen.getByLabelText('Required reason'), { target: { value: 'Beginning owner review.' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Acknowledge' }).at(-1)!);

    await waitFor(() => expect(adminApi.applyModerationAction).toHaveBeenCalled());
    expect(screen.getAllByRole('button', { name: 'Acknowledge' })[0]).toBeDisabled();
    expect(screen.getByLabelText('Required reason')).toBeDisabled();
    finish({});
    await waitFor(() => expect(screen.getByText('Acknowledge recorded.')).toBeInTheDocument());
  });

  it('renders useful empty and refresh-error states', async () => {
    vi.mocked(adminApi.getModerationCases).mockResolvedValue({ items: [], totals: { ...totals, active: 0 }, total: 0, total_pages: 1 });
    const { unmount } = render(<AdminModerationTab />);
    expect(await screen.findByText('No cases match this view')).toBeInTheDocument();
    expect(screen.getByText(/broaden the result/i)).toBeInTheDocument();
    unmount();

    vi.mocked(adminApi.getModerationCases).mockRejectedValue(new Error('offline'));
    render(<AdminModerationTab />);
    expect(await screen.findByText(/could not refresh/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('refreshes the shared queue on the visible-page interval', async () => {
    let intervalCallback: (() => void) | undefined;
    const visibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const interval = vi.spyOn(window, 'setInterval').mockImplementation((callback, delay) => {
      if (delay === 30_000) intervalCallback = callback as () => void;
      return 41;
    });
    render(<AdminModerationTab />);
    await screen.findByText('Case 17');
    const initialCalls = vi.mocked(adminApi.getModerationCases).mock.calls.length;

    intervalCallback?.();

    await waitFor(() => expect(adminApi.getModerationCases).toHaveBeenCalledTimes(initialCalls + 1));
    interval.mockRestore();
    if (visibility) Object.defineProperty(document, 'visibilityState', visibility);
  });

  it('submits an explicit legal-hold state with the required reason', async () => {
    params = new URLSearchParams('tab=moderation&state=active&case=17');
    vi.mocked(adminApi.getModerationCase).mockResolvedValue({ ...detail, allowed_actions: ['legal_hold'] });
    render(<AdminModerationTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'Place legal hold' }));
    fireEvent.change(screen.getByLabelText('Required reason'), { target: { value: 'Preserve during reviewed legal process.' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Legal hold' }).at(-1)!);

    await waitFor(() => expect(adminApi.applyModerationAction).toHaveBeenCalledWith(17, {
      action: 'legal_hold',
      reason: 'Preserve during reviewed legal process.',
      legal_hold: true,
    }));
  });

  it('requires a reason before retrying a failed worker job', async () => {
    params = new URLSearchParams('tab=moderation&state=active&case=17');
    vi.mocked(adminApi.getModerationCase).mockResolvedValue({
      ...detail,
      jobs: [{ id: 31, status: 'failed', attempts: 5, last_error: 'provider timeout', updated_at: '2026-01-01T12:05:00Z', can_retry: true }],
    });
    render(<AdminModerationTab />);
    const retry = await screen.findByRole('button', { name: 'Retry cycle' });
    expect(retry).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reason to retry job 31'), { target: { value: 'Provider recovered.' } });
    fireEvent.click(retry);

    await waitFor(() => expect(adminApi.retryModerationJob).toHaveBeenCalledWith(31, 'Provider recovered.'));
    expect(await screen.findByText('Job 31 returned to the queue.')).toBeInTheDocument();
  });
});
