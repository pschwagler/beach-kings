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
  applyModerationAction, createModerationEscalation, getModerationCase, getModerationCases,
  getModerationContext, getModerationEvidenceUrl, getModerationOverview,
  retryModerationJob, type ModerationQueue, type ModerationState,
} from '../../services/endpoints/admin';
import './AdminModerationTab.css';

type Totals = Record<'active' | 'all' | 'urgent' | 'due' | 'overdue' | 'ordinary' | 'open' | 'acknowledged' | 'closed', number>;
interface CaseSummary {
  id: number; target_type: string; target_id: number; state: string; severity: string;
  due_at: string | null; current_action: string | null; report_count: number;
  incident_type: string | null; urgent_since_at: string | null; dispositioned_at: string | null;
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
  alerts: { pending: number; failed: number; latest_delivery_at: string | null };
  sla: { unacknowledged_urgent: number; ordinary_due_soon: number; overdue: number };
}

const TARGETS = ['', 'player', 'direct_message', 'league_message', 'court_review', 'court_photo', 'court_review_photo'];
const STATES: Array<{ value: ModerationState; label: string }> = [
  { value: 'active', label: 'Active' }, { value: 'open', label: 'Open' },
  { value: 'acknowledged', label: 'Acknowledged' }, { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All cases' },
];
const ATTENTION: Array<{ value: ModerationQueue | ''; label: string }> = [
  { value: '', label: 'All' }, { value: 'urgent', label: 'Urgent' },
  { value: 'due', label: 'Due soon' }, { value: 'overdue', label: 'Overdue' },
  { value: 'ordinary', label: 'Ordinary' },
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
  const urlSearch = searchParams.get('search') ?? '';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const selectedId = Number(searchParams.get('case')) || null;
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [totals, setTotals] = useState<Totals>({ active: 0, all: 0, urgent: 0, due: 0, overdue: 0, ordinary: 0, open: 0, acknowledged: 0, closed: 0 });
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
  const loadSequence = useRef(0);
  const detailSequence = useRef(0);

  const updateUrl = useCallback((updates: Record<string, string | number | null | undefined>) => {
    // Read at interaction time so rapid filter/selection changes compose with
    // the URL Next has already committed instead of a stale render snapshot.
    const params = new URLSearchParams(window.location.search || searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => value == null || value === '' ? params.delete(key) : params.set(key, String(value)));
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const changeFilters = useCallback((updates: Record<string, string | number | null | undefined>, resetPage = true) => {
    detailSequence.current += 1;
    setSelected(null);
    updateUrl({ case: null, ...(resetPage ? { page: 1 } : {}), ...updates });
  }, [updateUrl]);

  const load = useCallback(async (quiet = false) => {
    const requestId = ++loadSequence.current;
    const detailRequestId = detailSequence.current;
    quiet ? setRefreshing(true) : setInitialLoading(true);
    setError(null);
    try {
      const [list, health, detailValue] = await Promise.all([
        getModerationCases({ queue, state, target_type: target || undefined, search: urlSearch.trim() || undefined, page, page_size: 30 }),
        getModerationOverview(),
        selectedId ? getModerationCase(selectedId) : Promise.resolve(null),
      ]);
      if (requestId !== loadSequence.current) return;
      setCases(list.items); setTotals(list.totals); setTotal(list.total ?? list.items.length);
      setTotalPages(list.total_pages); setOverview(health);
      setLastRefresh(new Date()); setAccessDenied(false);
      if (detailRequestId === detailSequence.current) setSelected(detailValue);
    } catch (loadError) {
      if (requestId !== loadSequence.current) return;
      if (axios.isAxiosError(loadError) && loadError.response?.status === 403) setAccessDenied(true);
      else setError(apiMessage(loadError, 'The moderation desk could not refresh. Existing information may be stale.'));
    } finally {
      if (requestId === loadSequence.current) { setInitialLoading(false); setRefreshing(false); }
    }
  }, [page, queue, selectedId, state, target, urlSearch]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(true); }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);
  const commitSearch = useCallback((value: string) => {
    changeFilters({ search: value || null });
  }, [changeFilters]);

  const openCase = async (caseId: number) => {
    const requestId = ++detailSequence.current;
    updateUrl({ case: caseId }); setDetailLoading(true); setError(null);
    try {
      const detailValue = await getModerationCase(caseId);
      if (requestId !== detailSequence.current) return;
      setSelected(detailValue);
      if (window.matchMedia?.('(max-width: 720px)').matches) window.requestAnimationFrame(() => backRef.current?.focus());
    }
    catch (openError) {
      if (requestId === detailSequence.current) setError(apiMessage(openError, 'Case details are unavailable.'));
    }
    finally { if (requestId === detailSequence.current) setDetailLoading(false); }
  };
  const closeCase = () => {
    detailSequence.current += 1;
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
  const unhealthy = Boolean(overview && (overview.jobs.failed > 0 || overview.jobs.stale > 0 || overview.alerts.failed > 0));
  return (
    <section className="moderation-workspace" aria-busy={initialLoading || detailLoading || refreshing}>
      <header className="moderation-command-header">
        <div><span className="moderation-kicker">Trust &amp; safety operations</span><h2>Moderation control desk</h2><p>Review reported content, apply policy, and record every decision.</p></div>
        <button className="moderation-refresh" disabled={refreshing} onClick={() => void load(true)}><RefreshCw size={16} className={refreshing ? 'spinning' : ''} /> {refreshing ? 'Refreshing' : 'Refresh'}</button>
      </header>
      {unhealthy && <div className="moderation-health-alert" role="alert"><AlertTriangle size={17} /><span>Moderation processing needs attention: {overview!.jobs.failed + overview!.alerts.failed} failed and {overview!.jobs.stale} stale job{overview!.jobs.failed + overview!.alerts.failed + overview!.jobs.stale === 1 ? '' : 's'}.</span></div>}
      <HealthStrip overview={overview} refreshed={lastRefresh} refreshing={refreshing} />
      {error && <div className="moderation-alert" role="alert"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => void load(true)}>Try again</button></div>}
      <div className="moderation-scope-controls">
        <div className="moderation-filter-group"><span id="moderation-status-label">Status</span><div role="group" aria-labelledby="moderation-status-label">{STATES.map(({ value, label }) => <button key={value} aria-pressed={state === value} onClick={() => changeFilters({ state: value === 'active' ? null : value })}>{label}<small>{totals[value]}</small></button>)}</div></div>
        <div className="moderation-filter-group"><span id="moderation-attention-label">Attention</span><div role="group" aria-labelledby="moderation-attention-label">{ATTENTION.map(({ value, label }) => <button key={value || 'all'} aria-pressed={(queue ?? '') === value} onClick={() => changeFilters({ queue: value || null })}>{label}{value && state === 'active' && <small>{totals[value]}</small>}</button>)}</div></div>
      </div>
      <div className="moderation-toolbar">
        <ModerationSearch key={urlSearch} value={urlSearch} onCommit={commitSearch} />
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

function ModerationSearch({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    const normalized = draft.trim();
    if (normalized === value) return;
    const timer = window.setTimeout(() => onCommit(normalized), 350);
    return () => window.clearTimeout(timer);
  }, [draft, onCommit, value]);
  return <label className="moderation-search"><Search size={16} /><span className="sr-only">Search cases</span><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Search case or target ID" inputMode="numeric" /></label>;
}

function HealthStrip({ overview, refreshed, refreshing }: { overview: Overview | null; refreshed: Date | null; refreshing: boolean }) {
  const items = overview ? [
    ['Mode', overview.mode], ['Processing backlog', overview.jobs.pending + overview.jobs.processing], ['Failures', overview.jobs.failed], ['Stale', overview.jobs.stale],
    ['Last completion', overview.jobs.latest_completion_at ? new Date(overview.jobs.latest_completion_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'None'],
    ['Pending alerts', overview.alerts.pending], ['Failed alerts', overview.alerts.failed],
    ['Last alert', overview.alerts.latest_delivery_at ? new Date(overview.alerts.latest_delivery_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'None'],
    ['Urgent unacknowledged', overview.sla.unacknowledged_urgent], ['Ordinary due soon', overview.sla.ordinary_due_soon], ['Overdue', overview.sla.overdue],
    ['Refresh', refreshing ? 'In progress' : refreshed ? refreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Waiting'],
  ] : [['Health', 'Loading…']];
  return <details className="moderation-health-disclosure"><summary><span>System health</span><small>{overview ? `${overview.alerts.pending} alerts pending · ${overview.sla.overdue} cases overdue` : 'Loading…'}</small><ChevronDown size={16} /></summary><div className="moderation-health" aria-label="Worker and alert health">{items.map(([label, value]) => <div key={label}><span>{label}</span><strong className={(label === 'Failures' || label === 'Failed alerts' || label === 'Stale' || label === 'Overdue') && Number(value) > 0 ? 'is-warning' : ''}>{value}</strong></div>)}</div></details>;
}

function CasePanel({ value, onChanged, onError }: { value: CaseDetail; onChanged: () => void; onError: (value: string | null) => void }) {
  const [action, setAction] = useState<string>(''); const [reason, setReason] = useState(''); const [lockHours, setLockHours] = useState(24);
  const [confirmed, setConfirmed] = useState(false); const [mutating, setMutating] = useState(false); const [success, setSuccess] = useState<string | null>(null);
  const [appealId, setAppealId] = useState<number | null>(null); const [context, setContext] = useState<ConversationContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false); const [revealedEvidence, setRevealedEvidence] = useState<Record<number, string>>({});
  const [evidenceLoading, setEvidenceLoading] = useState<number | null>(null);
  const [retryReasons, setRetryReasons] = useState<Record<number, string>>({});
  const evidenceTimers = useRef<Record<number, number>>({});
  const appeals = value.appeals ?? [];
  const categories = useMemo(() => value.provider_reviews.flatMap((review) => Object.entries(review.categories).filter(([, flagged]) => flagged).map(([name]) => name)), [value.provider_reviews]);
  const needsConfirmation = HIGH_IMPACT.has(action);
  const needsAppeal = action === 'grant_appeal' || action === 'uphold_appeal';
  const consequence = actionConsequence(action, lockHours, value.legal_hold);
  useEffect(() => () => {
    Object.values(evidenceTimers.current).forEach((timer) => window.clearTimeout(timer));
  }, []);
  const submit = async () => {
    if (!action || !reason.trim() || (needsConfirmation && !confirmed) || (needsAppeal && appealId == null)) return;
    const submittedAction = action;
    const submittedReason = reason.trim();
    const submittedAppealId = appealId;
    const submittedLockHours = lockHours;
    setMutating(true); onError(null); setSuccess(null);
    try {
      await applyModerationAction(value.id, { action: submittedAction, reason: submittedReason, ...((submittedAction === 'interaction_lock' || submittedAction === 'account_suspend') ? { lock_hours: submittedLockHours } : {}), ...(submittedAction === 'legal_hold' ? { legal_hold: !value.legal_hold } : {}), ...(needsAppeal && submittedAppealId != null ? { appeal_id: submittedAppealId } : {}) });
      setSuccess(`${LABELS[submittedAction]} recorded.`); setReason(''); setConfirmed(false); onChanged();
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
      const response = (!openInTab && existing) ? null : await getModerationEvidenceUrl(value.id, id);
      const url = response?.url ?? existing!;
      if (response) {
        setRevealedEvidence((current) => ({ ...current, [id]: url }));
        window.clearTimeout(evidenceTimers.current[id]);
        evidenceTimers.current[id] = window.setTimeout(() => {
          setRevealedEvidence((current) => {
            const next = { ...current };
            delete next[id];
            return next;
          });
          delete evidenceTimers.current[id];
        }, response.expires_in * 1000);
      }
      if (openInTab) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) { onError(apiMessage(error, 'Evidence is unavailable or has expired.')); }
    finally { setEvidenceLoading(null); }
  };
  const textTarget = value.target_type === 'direct_message' || value.target_type === 'league_message';
  const evidence = value.evidence ?? [];
  return <article>
    <header className="moderation-case-title"><div><span>Case {value.id}</span><h3>{value.target.title}</h3><p>{value.source === 'automated' || value.reports.length === 0 ? 'Automated detection' : 'Member report'}{value.reports[0]?.reason ? ` · ${humanize(value.reports[0].reason)}` : ''}</p></div><div className="moderation-state"><span>{value.state}</span>{value.legal_hold && <strong><Gavel size={13} /> Legal hold</strong>}</div></header>
    {value.severity === 'urgent' && <IncidentCard value={value} onChanged={onChanged} onError={onError} />}
    <section className="moderation-detail-section moderation-content-context"><h4>Reported content &amp; context</h4><div className="moderation-facts"><span>Subject <strong>{value.subject?.display_name ?? 'Unknown'}</strong></span><span>Target <strong>{humanize(value.target_type)} #{value.target_id}</strong></span><span>Visibility <strong>{value.target.visibility ?? 'Not applicable'}</strong></span><span>Due <strong>{relativeDue(value.due_at)}</strong></span></div>
      {value.target.text ? <div className="moderation-reported-text"><span>Reported content</span><blockquote>{value.target.text}</blockquote></div> : <p className="moderation-muted">No reviewable text is available. Reveal captured media below when present.</p>}
      {textTarget && context == null && <button className="moderation-context-button" disabled={contextLoading} onClick={() => void showContext()}>{contextLoading ? <LoaderCircle size={16} className="spinning" /> : <ShieldCheck size={16} />} Show conversation context <small>Audited access</small></button>}
      {context && <ConversationPanel value={context} />}
      {evidence.filter(isImageEvidence).map((item) => <div className="moderation-image-evidence" key={item.id}>{revealedEvidence[item.id] ? <><RestrictedImage src={revealedEvidence[item.id]} caseId={value.id} /><div><span>Restricted image evidence · link expires after five minutes</span><button disabled={evidenceLoading === item.id} onClick={() => void revealEvidence(item.id, true)}><ExternalLink size={15} /> Open full resolution</button></div></> : <button disabled={item.state === 'purged' || evidenceLoading === item.id} onClick={() => void revealEvidence(item.id)}><ImageIcon size={18} /><span>{item.state === 'purged' ? 'Image evidence was purged and is unavailable' : 'Reveal image evidence'}<small>{item.state === 'purged' ? 'Retention period ended' : 'Access is audited'}</small></span>{evidenceLoading === item.id && <LoaderCircle size={16} className="spinning" />}</button>}</div>)}
      {!value.target.text && !evidence.some(isImageEvidence) && <p className="moderation-evidence-unavailable"><FileWarning size={15} /> {evidence.some((item) => item.state === 'purged') ? 'Evidence for this case has been purged.' : 'No captured evidence is available for this case.'}</p>}
      <dl className="moderation-metadata">{Object.entries(value.target.metadata).filter(([, item]) => item != null).map(([key, item]) => <div key={key}><dt>{humanize(key)}</dt><dd>{key === 'created_at' ? new Date(String(item)).toLocaleString() : String(item)}</dd></div>)}</dl>
    </section>
    <section className="moderation-detail-section"><h4>Reports <span>{value.reports.length}</span></h4>{value.reports.length ? value.reports.map((report) => <div className="moderation-report" key={report.id}><strong>{humanize(report.reason)}</strong><time>{new Date(report.created_at).toLocaleString()}</time><p>{report.details || 'No additional detail supplied.'}</p></div>) : <p className="moderation-muted">Provider-created case; no member reports.</p>}<p className="moderation-privacy"><ShieldCheck size={14} /> Reporter identities are intentionally hidden.</p></section>
    <section className="moderation-detail-section"><h4>Provider review <span>Advisory</span></h4>{value.provider_reviews.length ? <>{categories.length > 0 && <div className="moderation-categories">{[...new Set(categories)].map((item) => <span key={item}>{humanize(item)}</span>)}</div>}{value.provider_reviews.map((review, index) => <div className="moderation-provider" key={`${review.created_at}-${index}`}><strong>{review.flagged ? 'Provider flagged' : 'Provider cleared'} · {review.model ?? 'model not recorded'}</strong>{review.recommendation && <><p><b>{humanize(review.recommendation.recommendation ?? 'owner review')}</b> · {review.recommendation.rationale}</p><small>Recommendation only; no score threshold is used.</small></>}{review.error && <p>{review.error}</p>}</div>)}</> : <p className="moderation-muted">No provider classification has completed.</p>}</section>
    {appeals.length > 0 && <section className="moderation-detail-section"><h4>Appeals <span>{appeals.length}</span></h4>{appeals.map((appeal) => <div className="moderation-report" key={appeal.id}><strong>Appeal {appeal.id} · {appeal.status}</strong><time>{new Date(appeal.created_at).toLocaleString()}</time><p>{appeal.statement}</p>{appeal.resolution_reason && <small>Resolution: {appeal.resolution_reason}</small>}</div>)}</section>}
    {evidence.some((item) => !isImageEvidence(item)) && <section className="moderation-detail-section"><h4>Other restricted evidence</h4><p className="moderation-muted">Access is audited. Links expire after five minutes.</p>{evidence.filter((item) => !isImageEvidence(item)).map((item) => <button className="moderation-evidence" disabled={item.state === 'purged'} key={item.id} onClick={() => void revealEvidence(item.id, true)}><FileWarning size={16} /><span>Evidence {item.id}<small>{item.content_type ?? 'file'} · {item.state}</small></span><strong>{item.state === 'purged' ? 'Unavailable' : 'Open captured file'}</strong></button>)}</section>}
    <section className="moderation-detail-section" aria-busy={mutating}><h4>Actions</h4><div className="moderation-action-groups">{ACTION_GROUPS.map((group) => { const available = group.actions.filter((item) => value.allowed_actions.includes(item)); return available.length ? <fieldset disabled={mutating} key={group.label}><legend>{group.label}</legend><div className="moderation-action-choices">{available.map((item) => <button className={action === item ? 'active' : ''} aria-pressed={action === item} key={item} onClick={() => { setAction(item); setConfirmed(false); setAppealId((item === 'grant_appeal' || item === 'uphold_appeal') ? (appeals.find((appeal) => appeal.status === 'open')?.id ?? null) : null); }}>{item === 'legal_hold' ? (value.legal_hold ? 'Release legal hold' : 'Place legal hold') : LABELS[item]}</button>)}</div></fieldset> : null; })}</div>{action && <fieldset className="moderation-action-form" disabled={mutating}><p className="moderation-consequence"><strong>Effect</strong>{consequence}</p><label><span>Required reason</span><textarea maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Record the policy basis and relevant context…" /></label>{(action === 'interaction_lock' || action === 'account_suspend') && <label><span>Duration</span><select value={lockHours} onChange={(event) => { setLockHours(Number(event.target.value)); setConfirmed(false); }}><option value={24}>24 hours</option><option value={72}>3 days</option><option value={168}>7 days</option><option value={720}>30 days</option></select></label>}{needsAppeal && <label><span>Open appeal</span><select value={appealId ?? ''} onChange={(event) => setAppealId(Number(event.target.value))}>{appeals.filter((appeal) => appeal.status === 'open').map((appeal) => <option value={appeal.id} key={appeal.id}>Appeal {appeal.id}</option>)}</select></label>}{needsConfirmation && <label className="moderation-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I understand and confirm this action.</span></label>}<button className="moderation-submit" disabled={!reason.trim() || (needsConfirmation && !confirmed) || (needsAppeal && appealId == null)} onClick={() => void submit()}>{mutating && <LoaderCircle size={15} className="spinning" />}{action === 'legal_hold' && value.legal_hold ? 'Release legal hold' : LABELS[action] ?? action}</button></fieldset>}{success && <p className="moderation-success" role="status"><Check size={15} />{success}</p>}</section>
    {value.jobs.length > 0 && <section className="moderation-detail-section"><h4>Worker jobs</h4>{value.jobs.map((job) => <div className="moderation-job" key={job.id}><div><strong>Job {job.id} · {job.status}</strong><small>{job.attempts} attempts · updated {new Date(job.updated_at).toLocaleString()}</small>{job.last_error && <p>{job.last_error}</p>}</div>{job.can_retry && <div className="moderation-retry"><input aria-label={`Reason to retry job ${job.id}`} placeholder="Required retry reason" value={retryReasons[job.id] ?? ''} onChange={(event) => setRetryReasons((current) => ({ ...current, [job.id]: event.target.value }))} /><button disabled={mutating || !retryReasons[job.id]?.trim()} onClick={() => void retry(job)}>Retry cycle</button></div>}</div>)}</section>}
    <section className="moderation-detail-section moderation-history-section"><h4>Append-only history</h4>{value.events.length ? <ol className="moderation-history">{[...value.events].reverse().map((event) => <li key={event.id}><span /><div><strong>{humanize(event.event_type)}</strong><small>{event.operator_name ? `${event.operator_name} · user ${event.operator_user_id}` : 'System'} · {new Date(event.created_at).toLocaleString()}</small>{event.reason && <p>{event.reason}</p>}</div></li>)}</ol> : <p className="moderation-muted">No history events recorded.</p>}</section>
  </article>;
}

const INCIDENT_CHECKLISTS: Record<string, string[]> = {
  credible_threat: ['Assess whether danger appears immediate and identify jurisdiction.', 'Preserve app-held evidence; do not forward evidence by email.', 'Follow the reviewed immediate-danger runbook before any outside contact.'],
  sexual_exploitation: ['Do not download, copy, or redistribute suspected exploitative material.', 'Preserve app-held evidence and confirm the legal-hold decision.', 'Use the reviewed child-safety reporting path for the applicable jurisdiction.'],
  stalking_doxxing: ['Assess ongoing access, location exposure, and immediate safety risk.', 'Preserve identifiers and app-held context without contacting the reported person.', 'Consult the reviewed stalking/doxxing response checklist.'],
  self_harm: ['Assess whether the content indicates imminent risk.', 'Keep intervention human-reviewed; the application never contacts crisis services.', 'Use the reviewed U.S. or Canadian crisis-resource path only when appropriate.'],
  minor_safety: ['Assess immediate danger and the child’s jurisdiction.', 'Preserve app-held evidence and confirm the legal-hold decision.', 'Consult the reviewed child-safety reporting path before outside contact.'],
  other_urgent: ['Assess immediate danger and jurisdiction.', 'Preserve relevant app-held evidence.', 'Consult a safety specialist before selecting an outside channel.'],
};
const ESCALATION_CHANNELS = [
  ['emergency_services', 'Emergency services'], ['ncmec_cybertipline', 'NCMEC CyberTipline'],
  ['cybertip_ca', 'Cybertip.ca'], ['us_988', 'U.S. 988'], ['canada_988', 'Canadian 9-8-8'],
  ['local_law_enforcement', 'Local law enforcement'], ['specialist_consultation', 'Specialist consultation'],
];

function IncidentCard({ value, onChanged, onError }: { value: CaseDetail; onChanged: () => void; onError: (value: string | null) => void }) {
  const [channel, setChannel] = useState('specialist_consultation');
  const [jurisdiction, setJurisdiction] = useState('unknown');
  const [externalReference, setExternalReference] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const incident = value.incident_type ?? 'other_urgent';
  const submit = async () => {
    if (!note.trim()) return;
    setSaving(true); setSaved(false); onError(null);
    try {
      await createModerationEscalation(value.id, { channel, jurisdiction, note: note.trim(), ...(externalReference.trim() ? { external_reference: externalReference.trim() } : {}) });
      setNote(''); setExternalReference(''); setSaved(true); onChanged();
    } catch (error) { onError(apiMessage(error, 'The external escalation record could not be saved.')); }
    finally { setSaving(false); }
  };
  return <section className="moderation-incident" aria-labelledby={`incident-${value.id}`}>
    <div className="moderation-incident-heading"><ShieldAlert size={19} /><div><span>Urgent incident protocol</span><h4 id={`incident-${value.id}`}>{humanize(incident)}</h4></div><strong>{value.dispositioned_at ? 'Disposition recorded' : 'Disposition required'}</strong></div>
    <ol>{(INCIDENT_CHECKLISTS[incident] ?? INCIDENT_CHECKLISTS.other_urgent).map((item) => <li key={item}>{item}</li>)}</ol>
    <p className="moderation-legal-prompt"><Gavel size={15} />{value.legal_hold ? 'Legal hold is active.' : 'Review whether evidence needs a legal hold before normal retention expires.'}</p>
    <div className="moderation-incident-resources" aria-label="Vetted external resources">
      <a href="https://www.missingkids.org/gethelpnow/cybertipline" target="_blank" rel="noreferrer">NCMEC <ExternalLink size={12} /></a>
      <a href="https://www.canada.ca/en/public-safety-canada/campaigns/online-child-sexual-exploitation/key-resources.html" target="_blank" rel="noreferrer">Canada child safety <ExternalLink size={12} /></a>
      <a href="https://988lifeline.org/get-help/" target="_blank" rel="noreferrer">U.S. 988 <ExternalLink size={12} /></a>
      <a href="https://988.ca/" target="_blank" rel="noreferrer">Canada 9-8-8 <ExternalLink size={12} /></a>
    </div>
    <details className="moderation-escalation-form"><summary>Record a human-reviewed external response <ChevronDown size={15} /></summary><p>No evidence is uploaded or sent through this form. Recording a contact acknowledges the case but does not disposition it.</p><div>
      <label><span>Channel</span><select value={channel} onChange={(event) => setChannel(event.target.value)}>{ESCALATION_CHANNELS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label><span>Jurisdiction</span><select value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)}><option value="unknown">Unknown</option><option value="united_states">United States</option><option value="canada">Canada</option></select></label>
      <label><span>External reference (optional)</span><input maxLength={200} value={externalReference} onChange={(event) => setExternalReference(event.target.value)} /></label>
      <label className="moderation-escalation-note"><span>Required operational note</span><textarea maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Record what was reviewed and what human action was taken. Do not paste evidence or personal contact details." /></label>
      <button className="moderation-submit" disabled={saving || !note.trim()} onClick={() => void submit()}>{saving && <LoaderCircle size={15} className="spinning" />}Record response</button>
    </div>{saved && <p className="moderation-success" role="status"><Check size={15} />External response recorded in append-only history.</p>}</details>
  </section>;
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
  return <img src={src} alt={`Restricted evidence for case ${caseId}`} referrerPolicy="no-referrer" />;
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
