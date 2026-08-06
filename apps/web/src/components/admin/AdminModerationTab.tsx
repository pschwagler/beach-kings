'use client';

import axios from 'axios';
import {
  AlertTriangle, ArrowLeft, Check, ChevronDown, Clock3, ExternalLink,
  FileWarning, Gavel, Image as ImageIcon, LoaderCircle, RefreshCw, Search,
  ShieldAlert, ShieldCheck,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyModerationAction, getModerationCase, getModerationCases,
  getModerationContext, getModerationEvidenceUrl, getModerationOverview,
  retryModerationJob, type ModerationQueue, type ModerationState,
} from '../../services/endpoints/admin';

type Totals = Record<'active' | 'all' | 'urgent' | 'due' | 'ordinary' | 'open' | 'acknowledged' | 'closed', number>;
interface CaseSummary {
  id: number; target_type: string; target_id: number; state: string; severity: string;
  due_at: string | null; current_action: string | null; report_count: number;
  subject_name?: string | null; target_title?: string; target_snippet?: string | null;
  target_media_type?: 'image' | null; source?: 'member_report' | 'automated'; primary_reason?: string | null;
}
interface TargetContext {
  kind: string; available: boolean; title: string; text: string | null;
  visibility: string | null; metadata: Record<string, unknown>;
}
interface Job {
  id: number; status: string; attempts: number; last_error: string | null;
  updated_at: string; can_retry: boolean;
}
interface Evidence {
  id: number; state: string; content_type: string | null; captured_at: string; purge_after: string | null;
}
interface ConversationContext {
  available: boolean;
  reason?: 'not_applicable' | 'not_captured' | 'purged' | 'unavailable';
  captured_at?: string;
  messages: Array<{ id: number; created_at: string; speaker: 'subject' | 'other'; text: string; is_target: boolean }>;
}
interface CaseDetail extends CaseSummary {
  legal_hold: boolean;
  subject: { id: number; display_name: string } | null;
  target: TargetContext;
  reports: Array<{ id: number; reason: string; details: string | null; created_at: string }>;
  provider_reviews: Array<{ flagged: boolean; categories: Record<string, boolean>; model: string | null; recommendation: { severity?: string; recommendation?: string; rationale?: string } | null; error: string | null; created_at: string }>;
  evidence: Evidence[];
  jobs: Job[];
  allowed_actions: string[];
  appeals: Array<{ id: number; case_id: number; status: 'open' | 'granted' | 'upheld'; statement: string; resolution_reason: string | null; created_at: string; resolved_at: string | null }>;
  events: Array<{ id: number; event_type: string; operator_user_id: number | null; operator_name: string | null; reason: string | null; created_at: string }>;
}
interface Overview {
  mode: string; queues: Totals; generated_at: string;
  jobs: { pending: number; processing: number; failed: number; stale: number; oldest_pending_at: string | null; latest_completion_at: string | null };
}

const TARGETS = ['', 'player', 'direct_message', 'league_message', 'court_review', 'court_photo', 'court_review_photo'];
const STATES: Array<{ value: ModerationState; label: string }> = [
  { value: 'active', label: 'Active' }, { value: 'open', label: 'Open' },
  { value: 'acknowledged', label: 'Acknowledged' }, { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All cases' },
];
const ATTENTION: Array<{ value: ModerationQueue | ''; label: string }> = [
  { value: '', label: 'All' }, { value: 'urgent', label: 'Urgent' },
  { value: 'due', label: 'Due soon' }, { value: 'ordinary', label: 'Ordinary' },
];
const ACTION_GROUPS = [
  { label: 'Case workflow', actions: ['acknowledge', 'dismiss'] },
  { label: 'Content enforcement', actions: ['quarantine', 'remove', 'restore'] },
  { label: 'Account enforcement', actions: ['warn', 'interaction_lock', 'account_suspend', 'account_ban', 'account_restore'] },
  { label: 'Appeals', actions: ['grant_appeal', 'uphold_appeal'] },
  { label: 'Evidence preservation', actions: ['legal_hold'] },
];
const LABELS: Record<string, string> = {
  acknowledge: 'Acknowledge', dismiss: 'Dismiss', quarantine: 'Quarantine', restore: 'Restore',
  remove: 'Remove permanently', warn: 'Send warning', interaction_lock: 'Limit social features',
  account_suspend: 'Suspend account', account_ban: 'Ban account', account_restore: 'Restore account',
  grant_appeal: 'Grant appeal', uphold_appeal: 'Uphold decision', legal_hold: 'Legal hold',
};
const HIGH_IMPACT = new Set(['quarantine', 'remove', 'account_suspend', 'account_ban']);
const humanize = (value: string) => value.replaceAll('_', ' ');
const apiMessage = (error: unknown, fallback: string) => axios.isAxiosError(error) && typeof error.response?.data?.detail === 'string' ? error.response.data.detail : fallback;
const relativeDue = (value: string | null) => {
  if (!value) return 'No due time';
  const hours = Math.round((new Date(value).getTime() - Date.now()) / 3_600_000);
  if (hours < 0) return `${Math.abs(hours)}h overdue`;
  if (hours === 0) return 'Due this hour';
  return `Due in ${hours}h`;
};
const isImageEvidence = (evidence: Evidence) => evidence.content_type === 'image' || evidence.content_type?.startsWith('image/');

export default function AdminModerationTab() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queue = (searchParams.get('queue') as ModerationQueue | null) ?? undefined;
  const state = (searchParams.get('state') as ModerationState | null) ?? 'active';
  const target = searchParams.get('target') ?? '';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const selectedId = Number(searchParams.get('case')) || null;
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [totals, setTotals] = useState<Totals>({ active: 0, all: 0, urgent: 0, due: 0, ordinary: 0, open: 0, acknowledged: 0, closed: 0 });
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<CaseDetail | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const backRef = useRef<HTMLButtonElement | null>(null);

  const updateUrl = useCallback((updates: Record<string, string | number | null | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => value == null || value === '' ? params.delete(key) : params.set(key, String(value)));
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const changeFilters = useCallback((updates: Record<string, string | number | null | undefined>, resetPage = true) => {
    setSelected(null);
    updateUrl({ case: null, ...(resetPage ? { page: 1 } : {}), ...updates });
  }, [updateUrl]);

  const load = useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setInitialLoading(true);
    setError(null);
    try {
      const [list, health] = await Promise.all([
        getModerationCases({ queue, state, target_type: target || undefined, search: search.trim() || undefined, page, page_size: 30 }),
        getModerationOverview(),
      ]);
      setCases(list.items); setTotals(list.totals); setTotal(list.total ?? list.items.length);
      setTotalPages(list.total_pages); setOverview(health);
      setLastRefresh(new Date()); setAccessDenied(false);
      if (selectedId) setSelected(await getModerationCase(selectedId));
      else setSelected(null);
    } catch (loadError) {
      if (axios.isAxiosError(loadError) && loadError.response?.status === 403) setAccessDenied(true);
      else setError(apiMessage(loadError, 'The moderation desk could not refresh. Existing information may be stale.'));
    } finally { setInitialLoading(false); setRefreshing(false); }
  }, [page, queue, search, selectedId, state, target]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(true); }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);
  useEffect(() => {
    const normalizedSearch = search.trim();
    if (normalizedSearch === (searchParams.get('search') ?? '')) return;
    const timer = window.setTimeout(() => changeFilters({ search: normalizedSearch || null }), 350);
    return () => window.clearTimeout(timer);
  // URL callback intentionally omitted to avoid resetting the debounce on navigation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const openCase = async (caseId: number) => {
    updateUrl({ case: caseId }); setDetailLoading(true); setError(null);
    try {
      setSelected(await getModerationCase(caseId));
      if (window.matchMedia?.('(max-width: 720px)').matches) window.requestAnimationFrame(() => backRef.current?.focus());
    }
    catch (openError) { setError(apiMessage(openError, 'Case details are unavailable.')); }
    finally { setDetailLoading(false); }
  };
  const closeCase = () => {
    const selectedIndex = cases.findIndex((item) => item.id === selectedId);
    setSelected(null); updateUrl({ case: null });
    window.requestAnimationFrame(() => rowRefs.current[selectedIndex]?.focus());
  };
  const onRowKey = (event: KeyboardEvent, index: number) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? cases.length - 1 : Math.max(0, Math.min(cases.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
    rowRefs.current[next]?.focus();
  };

  if (accessDenied) return <AccessDenied />;
  const unhealthy = Boolean(overview && (overview.jobs.failed > 0 || overview.jobs.stale > 0));
  return (
    <section className="moderation-workspace" aria-busy={refreshing}>
      <header className="moderation-command-header">
        <div><span className="moderation-kicker">Trust &amp; safety operations</span><h2>Moderation control desk</h2><p>Review reported content, apply policy, and record every decision.</p></div>
        <button className="moderation-refresh" disabled={refreshing} onClick={() => void load(true)}><RefreshCw size={16} className={refreshing ? 'spinning' : ''} /> {refreshing ? 'Refreshing' : 'Refresh'}</button>
      </header>
      {unhealthy && <div className="moderation-health-alert" role="alert"><AlertTriangle size={17} /><span>Moderation processing needs attention: {overview!.jobs.failed} failed and {overview!.jobs.stale} stale job{overview!.jobs.failed + overview!.jobs.stale === 1 ? '' : 's'}.</span></div>}
      <HealthStrip overview={overview} refreshed={lastRefresh} refreshing={refreshing} />
      {error && <div className="moderation-alert" role="alert"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => void load(true)}>Try again</button></div>}
      <div className="moderation-scope-controls">
        <div className="moderation-filter-group"><span id="moderation-status-label">Status</span><div role="group" aria-labelledby="moderation-status-label">{STATES.map(({ value, label }) => <button key={value} aria-pressed={state === value} onClick={() => changeFilters({ state: value === 'active' ? null : value })}>{label}<small>{totals[value]}</small></button>)}</div></div>
        <div className="moderation-filter-group"><span id="moderation-attention-label">Attention</span><div role="group" aria-labelledby="moderation-attention-label">{ATTENTION.map(({ value, label }) => <button key={value || 'all'} aria-pressed={(queue ?? '') === value} onClick={() => changeFilters({ queue: value || null })}>{label}{value && state === 'active' && <small>{totals[value]}</small>}</button>)}</div></div>
      </div>
      <div className="moderation-toolbar">
        <label className="moderation-search"><Search size={16} /><span className="sr-only">Search cases</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search case or target ID" /></label>
        <label><span>Target type</span><select value={target} onChange={(event) => changeFilters({ target: event.target.value || null })}>{TARGETS.map((value) => <option value={value} key={value}>{value ? humanize(value) : 'All target types'}</option>)}</select></label>
      </div>
      <div className={`moderation-columns ${selectedId ? 'moderation-columns--detail' : ''}`}>
        <section className="moderation-case-list" aria-label="Case queue">
          <div className="moderation-list-head" aria-live="polite"><span>{initialLoading ? 'Loading cases…' : `Showing ${cases.length} of ${total} cases`}</span><small>Due time ascending</small></div>
          {!initialLoading && cases.length === 0 ? <EmptyQueue /> : cases.map((item, index) => (
            <button ref={(node) => { rowRefs.current[index] = node; }} onKeyDown={(event) => onRowKey(event, index)} key={item.id} className={`moderation-case-row ${selectedId === item.id ? 'selected' : ''}`} aria-pressed={selectedId === item.id} onClick={() => void openCase(item.id)}>
              <span className={`moderation-severity moderation-severity--${item.severity}`}>{item.severity === 'urgent' ? <ShieldAlert size={13} /> : <Clock3 size={13} />}{item.severity}</span>
              <span className="moderation-row-heading"><small>Case {item.id}</small><strong>{item.target_title || item.subject_name || humanize(item.target_type)}</strong></span>
              <span className={`moderation-due ${item.due_at && new Date(item.due_at) < new Date() ? 'overdue' : ''}`}>{relativeDue(item.due_at)}</span>
              <span className="moderation-row-preview">{item.target_media_type === 'image' ? <><ImageIcon size={13} /> Image evidence</> : item.target_snippet || `${humanize(item.target_type)} · #${item.target_id}`}</span>
              <span className="moderation-row-meta"><small>{item.source === 'automated' ? 'Automated detection' : 'Member report'}{item.primary_reason ? ` · ${humanize(item.primary_reason)}` : ''}</small><small>{item.report_count} report{item.report_count === 1 ? '' : 's'} · {item.state}</small></span>
            </button>
          ))}
          {totalPages > 1 && <div className="moderation-pagination"><button disabled={page === 1} onClick={() => changeFilters({ page: page - 1 }, false)}>Previous</button><span>{page} / {totalPages}</span><button disabled={page === totalPages} onClick={() => changeFilters({ page: page + 1 }, false)}>Next</button></div>}
        </section>
        <section className="moderation-case-detail" aria-live="polite">
          {selectedId && <button ref={backRef} className="moderation-back" onClick={closeCase}><ArrowLeft size={17} /> Back to cases</button>}
          {detailLoading ? <div className="moderation-detail-state"><LoaderCircle className="spinning" /><span>Opening case…</span></div> : selected == null ? <NoSelection /> : <CasePanel key={selected.id} value={selected} onChanged={() => void load(true)} onError={setError} />}
        </section>
      </div>
    </section>
  );
}

function HealthStrip({ overview, refreshed, refreshing }: { overview: Overview | null; refreshed: Date | null; refreshing: boolean }) {
  const items = overview ? [
    ['Mode', overview.mode], ['Processing backlog', overview.jobs.pending + overview.jobs.processing], ['Failures', overview.jobs.failed], ['Stale', overview.jobs.stale],
    ['Last completion', overview.jobs.latest_completion_at ? new Date(overview.jobs.latest_completion_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'None'],
    ['Refresh', refreshing ? 'In progress' : refreshed ? refreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Waiting'],
  ] : [['Health', 'Loading…']];
  return <details className="moderation-health-disclosure"><summary><span>System health</span><small>{overview ? `${overview.jobs.pending + overview.jobs.processing} processing · ${overview.jobs.failed + overview.jobs.stale} need attention` : 'Loading…'}</small><ChevronDown size={16} /></summary><div className="moderation-health" aria-label="Worker health">{items.map(([label, value]) => <div key={label}><span>{label}</span><strong className={(label === 'Failures' || label === 'Stale') && Number(value) > 0 ? 'is-warning' : ''}>{value}</strong></div>)}</div></details>;
}

function CasePanel({ value, onChanged, onError }: { value: CaseDetail; onChanged: () => void; onError: (value: string | null) => void }) {
  const [action, setAction] = useState<string>(''); const [reason, setReason] = useState(''); const [lockHours, setLockHours] = useState(24);
  const [confirmed, setConfirmed] = useState(false); const [mutating, setMutating] = useState(false); const [success, setSuccess] = useState<string | null>(null);
  const [appealId, setAppealId] = useState<number | null>(null); const [context, setContext] = useState<ConversationContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false); const [revealedEvidence, setRevealedEvidence] = useState<Record<number, string>>({});
  const [evidenceLoading, setEvidenceLoading] = useState<number | null>(null);
  const [retryReasons, setRetryReasons] = useState<Record<number, string>>({});
  const appeals = value.appeals ?? [];
  const categories = useMemo(() => value.provider_reviews.flatMap((review) => Object.entries(review.categories).filter(([, flagged]) => flagged).map(([name]) => name)), [value.provider_reviews]);
  const needsConfirmation = HIGH_IMPACT.has(action);
  const needsAppeal = action === 'grant_appeal' || action === 'uphold_appeal';
  const consequence = actionConsequence(action, lockHours, value.legal_hold);
  const submit = async () => {
    if (!action || !reason.trim() || (needsConfirmation && !confirmed) || (needsAppeal && appealId == null)) return;
    setMutating(true); onError(null); setSuccess(null);
    try {
      await applyModerationAction(value.id, { action, reason: reason.trim(), ...((action === 'interaction_lock' || action === 'account_suspend') ? { lock_hours: lockHours } : {}), ...(action === 'legal_hold' ? { legal_hold: !value.legal_hold } : {}), ...(needsAppeal && appealId != null ? { appeal_id: appealId } : {}) });
      setSuccess(`${LABELS[action]} recorded.`); setReason(''); setConfirmed(false); onChanged();
    } catch (error) { onError(apiMessage(error, 'The action could not be recorded.')); }
    finally { setMutating(false); }
  };
  const retry = async (job: Job) => {
    const reasonValue = retryReasons[job.id]?.trim(); if (!reasonValue) return;
    setMutating(true); onError(null);
    try { await retryModerationJob(job.id, reasonValue); setSuccess(`Job ${job.id} returned to the queue.`); onChanged(); }
    catch (error) { onError(apiMessage(error, 'The failed job could not be retried.')); }
    finally { setMutating(false); }
  };
  const showContext = async () => {
    setContextLoading(true); onError(null);
    try { setContext(await getModerationContext(value.id)); }
    catch (error) { setContext({ available: false, reason: 'unavailable', messages: [] }); onError(apiMessage(error, 'Conversation context is unavailable.')); }
    finally { setContextLoading(false); }
  };
  const revealEvidence = async (id: number, openInTab = false) => {
    try {
      setEvidenceLoading(id); onError(null);
      const existing = revealedEvidence[id];
      const url = (!openInTab && existing) || (await getModerationEvidenceUrl(value.id, id)).url;
      setRevealedEvidence((current) => ({ ...current, [id]: url }));
      if (openInTab) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) { onError(apiMessage(error, 'Evidence is unavailable or has expired.')); }
    finally { setEvidenceLoading(null); }
  };
  const textTarget = value.target_type === 'direct_message' || value.target_type === 'league_message';
  const evidence = value.evidence ?? [];
  return <article>
    <header className="moderation-case-title"><div><span>Case {value.id}</span><h3>{value.target.title}</h3><p>{value.source === 'automated' || value.reports.length === 0 ? 'Automated detection' : 'Member report'}{value.reports[0]?.reason ? ` · ${humanize(value.reports[0].reason)}` : ''}</p></div><div className="moderation-state"><span>{value.state}</span>{value.legal_hold && <strong><Gavel size={13} /> Legal hold</strong>}</div></header>
    <section className="moderation-detail-section moderation-content-context"><h4>Reported content &amp; context</h4><div className="moderation-facts"><span>Subject <strong>{value.subject?.display_name ?? 'Unknown'}</strong></span><span>Target <strong>{humanize(value.target_type)} #{value.target_id}</strong></span><span>Visibility <strong>{value.target.visibility ?? 'Not applicable'}</strong></span><span>Due <strong>{relativeDue(value.due_at)}</strong></span></div>
      {value.target.text ? <div className="moderation-reported-text"><span>Reported content</span><blockquote>{value.target.text}</blockquote></div> : <p className="moderation-muted">No reviewable text is available. Reveal captured media below when present.</p>}
      {textTarget && context == null && <button className="moderation-context-button" disabled={contextLoading} onClick={() => void showContext()}>{contextLoading ? <LoaderCircle size={16} className="spinning" /> : <ShieldCheck size={16} />} Show conversation context <small>Audited access</small></button>}
      {context && <ConversationPanel value={context} />}
      {evidence.filter(isImageEvidence).map((item) => <div className="moderation-image-evidence" key={item.id}>{revealedEvidence[item.id] ? <><RestrictedImage src={revealedEvidence[item.id]} caseId={value.id} /><div><span>Restricted image evidence · link expires after five minutes</span><button onClick={() => void revealEvidence(item.id, true)}><ExternalLink size={15} /> Open full resolution</button></div></> : <button disabled={item.state === 'purged' || evidenceLoading === item.id} onClick={() => void revealEvidence(item.id)}><ImageIcon size={18} /><span>{item.state === 'purged' ? 'Image evidence was purged and is unavailable' : 'Reveal image evidence'}<small>{item.state === 'purged' ? 'Retention period ended' : 'Access is audited'}</small></span>{evidenceLoading === item.id && <LoaderCircle size={16} className="spinning" />}</button>}</div>)}
      {!value.target.text && !evidence.some(isImageEvidence) && <p className="moderation-evidence-unavailable"><FileWarning size={15} /> {evidence.some((item) => item.state === 'purged') ? 'Evidence for this case has been purged.' : 'No captured evidence is available for this case.'}</p>}
      <dl className="moderation-metadata">{Object.entries(value.target.metadata).filter(([, item]) => item != null).map(([key, item]) => <div key={key}><dt>{humanize(key)}</dt><dd>{key === 'created_at' ? new Date(String(item)).toLocaleString() : String(item)}</dd></div>)}</dl>
    </section>
    <section className="moderation-detail-section"><h4>Reports <span>{value.reports.length}</span></h4>{value.reports.length ? value.reports.map((report) => <div className="moderation-report" key={report.id}><strong>{humanize(report.reason)}</strong><time>{new Date(report.created_at).toLocaleString()}</time><p>{report.details || 'No additional detail supplied.'}</p></div>) : <p className="moderation-muted">Provider-created case; no member reports.</p>}<p className="moderation-privacy"><ShieldCheck size={14} /> Reporter identities are intentionally hidden.</p></section>
    <section className="moderation-detail-section"><h4>Provider review <span>Advisory</span></h4>{value.provider_reviews.length ? <>{categories.length > 0 && <div className="moderation-categories">{[...new Set(categories)].map((item) => <span key={item}>{humanize(item)}</span>)}</div>}{value.provider_reviews.map((review, index) => <div className="moderation-provider" key={`${review.created_at}-${index}`}><strong>{review.flagged ? 'Provider flagged' : 'Provider cleared'} · {review.model ?? 'model not recorded'}</strong>{review.recommendation && <><p><b>{humanize(review.recommendation.recommendation ?? 'owner review')}</b> · {review.recommendation.rationale}</p><small>Recommendation only; no score threshold is used.</small></>}{review.error && <p>{review.error}</p>}</div>)}</> : <p className="moderation-muted">No provider classification has completed.</p>}</section>
    {appeals.length > 0 && <section className="moderation-detail-section"><h4>Appeals <span>{appeals.length}</span></h4>{appeals.map((appeal) => <div className="moderation-report" key={appeal.id}><strong>Appeal {appeal.id} · {appeal.status}</strong><time>{new Date(appeal.created_at).toLocaleString()}</time><p>{appeal.statement}</p>{appeal.resolution_reason && <small>Resolution: {appeal.resolution_reason}</small>}</div>)}</section>}
    {evidence.some((item) => !isImageEvidence(item)) && <section className="moderation-detail-section"><h4>Other restricted evidence</h4><p className="moderation-muted">Access is audited. Links expire after five minutes.</p>{evidence.filter((item) => !isImageEvidence(item)).map((item) => <button className="moderation-evidence" disabled={item.state === 'purged'} key={item.id} onClick={() => void revealEvidence(item.id, true)}><FileWarning size={16} /><span>Evidence {item.id}<small>{item.content_type ?? 'file'} · {item.state}</small></span><strong>{item.state === 'purged' ? 'Unavailable' : 'Open captured file'}</strong></button>)}</section>}
    <section className="moderation-detail-section"><h4>Actions</h4><div className="moderation-action-groups">{ACTION_GROUPS.map((group) => { const available = group.actions.filter((item) => value.allowed_actions.includes(item)); return available.length ? <fieldset key={group.label}><legend>{group.label}</legend><div className="moderation-action-choices">{available.map((item) => <button className={action === item ? 'active' : ''} aria-pressed={action === item} key={item} onClick={() => { setAction(item); setConfirmed(false); setAppealId((item === 'grant_appeal' || item === 'uphold_appeal') ? (appeals.find((appeal) => appeal.status === 'open')?.id ?? null) : null); }}>{item === 'legal_hold' ? (value.legal_hold ? 'Release legal hold' : 'Place legal hold') : LABELS[item]}</button>)}</div></fieldset> : null; })}</div>{action && <div className="moderation-action-form"><p className="moderation-consequence"><strong>Effect</strong>{consequence}</p><label><span>Required reason</span><textarea maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Record the policy basis and relevant context…" /></label>{(action === 'interaction_lock' || action === 'account_suspend') && <label><span>Duration</span><select value={lockHours} onChange={(event) => { setLockHours(Number(event.target.value)); setConfirmed(false); }}><option value={24}>24 hours</option><option value={72}>3 days</option><option value={168}>7 days</option><option value={720}>30 days</option></select></label>}{needsAppeal && <label><span>Open appeal</span><select value={appealId ?? ''} onChange={(event) => setAppealId(Number(event.target.value))}>{appeals.filter((appeal) => appeal.status === 'open').map((appeal) => <option value={appeal.id} key={appeal.id}>Appeal {appeal.id}</option>)}</select></label>}{needsConfirmation && <label className="moderation-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I understand and confirm this action.</span></label>}<button className="moderation-submit" disabled={mutating || !reason.trim() || (needsConfirmation && !confirmed) || (needsAppeal && appealId == null)} onClick={() => void submit()}>{mutating && <LoaderCircle size={15} className="spinning" />}{action === 'legal_hold' && value.legal_hold ? 'Release legal hold' : LABELS[action] ?? action}</button></div>}{success && <p className="moderation-success" role="status"><Check size={15} />{success}</p>}</section>
    {value.jobs.length > 0 && <section className="moderation-detail-section"><h4>Worker jobs</h4>{value.jobs.map((job) => <div className="moderation-job" key={job.id}><div><strong>Job {job.id} · {job.status}</strong><small>{job.attempts} attempts · updated {new Date(job.updated_at).toLocaleString()}</small>{job.last_error && <p>{job.last_error}</p>}</div>{job.can_retry && <div className="moderation-retry"><input aria-label={`Reason to retry job ${job.id}`} placeholder="Required retry reason" value={retryReasons[job.id] ?? ''} onChange={(event) => setRetryReasons((current) => ({ ...current, [job.id]: event.target.value }))} /><button disabled={mutating || !retryReasons[job.id]?.trim()} onClick={() => void retry(job)}>Retry cycle</button></div>}</div>)}</section>}
    <section className="moderation-detail-section moderation-history-section"><h4>Append-only history</h4>{value.events.length ? <ol className="moderation-history">{[...value.events].reverse().map((event) => <li key={event.id}><span /><div><strong>{humanize(event.event_type)}</strong><small>{event.operator_name ? `${event.operator_name} · user ${event.operator_user_id}` : 'System'} · {new Date(event.created_at).toLocaleString()}</small>{event.reason && <p>{event.reason}</p>}</div></li>)}</ol> : <p className="moderation-muted">No history events recorded.</p>}</section>
  </article>;
}

function ConversationPanel({ value }: { value: ConversationContext }) {
  if (!value.available) {
    const message = value.reason === 'purged' ? 'Conversation context was purged when its retention period ended.' : value.reason === 'not_captured' ? 'Conversation context was not captured for this legacy case.' : value.reason === 'not_applicable' ? 'Conversation context does not apply to this content type.' : 'Conversation context is currently unavailable.';
    return <div className="moderation-context-unavailable"><FileWarning size={16} /><span>{message}</span></div>;
  }
  return <div className="moderation-conversation"><div><strong>Captured conversation</strong><small>{value.captured_at ? `${new Date(value.captured_at).toLocaleString()} · ` : ''}Audited access</small></div><ol>{value.messages.map((message) => <li key={message.id} className={message.is_target ? 'is-target' : ''}><div><strong>{message.speaker === 'subject' ? 'Subject' : 'Other participant'}</strong><time>{new Date(message.created_at).toLocaleString()}</time></div><p>{message.text}</p>{message.is_target && <span>Reported message</span>}</li>)}</ol></div>;
}

function RestrictedImage({ src, caseId }: { src: string; caseId: number }) {
  // A private, expiring URL must not pass through the Next image optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={`Restricted evidence for case ${caseId}`} />;
}

function actionConsequence(action: string, hours: number, legalHold: boolean) {
  const duration = hours === 24 ? '24 hours' : hours === 72 ? '3 days' : hours === 168 ? '7 days' : '30 days';
  const consequences: Record<string, string> = {
    acknowledge: 'Moves this case into acknowledged review.', dismiss: 'Closes the case without content or account enforcement.',
    quarantine: 'Immediately hides the content while keeping it restorable.', restore: 'Makes quarantined content visible and closes the case.',
    remove: 'Permanently removes the content and closes the case.', warn: 'Sends the subject a policy warning.',
    interaction_lock: `Limits the subject’s social features for ${duration}.`, account_suspend: `Suspends the subject’s account for ${duration}.`,
    account_ban: 'Bans the subject’s account with no automatic end date.', account_restore: 'Restores the subject’s account and closes the case.',
    grant_appeal: 'Reverses active enforcement and closes the appeal.', uphold_appeal: 'Keeps the enforcement in place and closes the appeal.',
    legal_hold: legalHold ? 'Releases the legal hold and returns evidence to normal retention.' : 'Prevents evidence from being purged under normal retention.',
  };
  return consequences[action] ?? 'Records this moderation decision in the case history.';
}

function EmptyQueue() { return <div className="moderation-empty"><Check size={24} /><strong>No cases match this view</strong><span>Change the status, attention, target, or search filters to broaden the result.</span></div>; }
function NoSelection() { return <div className="moderation-empty moderation-empty--detail"><ShieldCheck size={30} /><strong>Select a case to begin review</strong><span>Use ↑ and ↓ to move through the shared queue. No case is assigned or claimed.</span></div>; }
function AccessDenied() { return <div className="moderation-denied" role="alert"><ShieldAlert size={32} /><span>Restricted operations area</span><h2>System-admin access required</h2><p>You’re signed in, but this moderation workspace is limited to configured system administrators.</p></div>; }
