'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Search, ShieldCheck, ShieldOff } from 'lucide-react';
import {
  getAdminUsers,
  grantSystemAdmin,
  revokeSystemAdmin,
  type AdminUser,
  type AdminUsersResponse,
} from '../../services/api';

type RoleAction = { user: AdminUser; kind: 'grant' | 'revoke' } | null;

function errorMessage(error: unknown): string {
  const candidate = error as { response?: { data?: { detail?: string } } };
  return candidate.response?.data?.detail || 'The role change could not be saved.';
}

function accountLabel(user: AdminUser): string {
  if (user.deleted_at) return 'Deleted';
  if (user.deletion_scheduled_at) return 'Deletion scheduled';
  if (!user.is_verified) return 'Unverified';
  return 'Verified';
}

export default function AdminUsersTab() {
  const [data, setData] = useState<AdminUsersResponse | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [accountStatus, setAccountStatus] = useState('');
  const [moderationStatus, setModerationStatus] = useState('');
  const [roleStatus, setRoleStatus] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [action, setAction] = useState<RoleAction>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getAdminUsers({
        search: search || undefined,
        account_status: accountStatus || undefined,
        moderation_status: moderationStatus || undefined,
        role_status: roleStatus || undefined,
        page,
        page_size: 25,
      }));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [accountStatus, moderationStatus, page, roleStatus, search]);

  useEffect(() => { void load(); }, [load]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const confirmRoleChange = async () => {
    if (!action || !reason.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (action.kind === 'grant') {
        await grantSystemAdmin(action.user.id, reason.trim());
      } else {
        await revokeSystemAdmin(action.user.id, reason.trim());
      }
      setAction(null);
      setReason('');
      await load();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const toggleHistory = (userId: number) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };

  return (
    <section className="admin-users" aria-labelledby="admin-users-title">
      <div className="admin-section-header admin-users-heading">
        <div>
          <h2 id="admin-users-title">Users</h2>
          <p>Review account access and maintain an auditable system-admin roster.</p>
        </div>
        {data && <span className="admin-users-count">{data.total.toLocaleString()} accounts</span>}
      </div>

      <div className="admin-users-toolbar">
        <form className="admin-users-search" onSubmit={submitSearch}>
          <Search size={17} aria-hidden="true" />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search name, email, phone, or ID"
            aria-label="Search users"
          />
          <button type="submit">Search</button>
        </form>
        <div className="admin-users-filters">
          <select aria-label="Account status" value={accountStatus} onChange={(event) => { setPage(1); setAccountStatus(event.target.value); }}>
            <option value="">All accounts</option><option value="active">Verified</option>
            <option value="unverified">Unverified</option><option value="deletion_scheduled">Deletion scheduled</option>
            <option value="deleted">Deleted</option>
          </select>
          <select aria-label="Moderation status" value={moderationStatus} onChange={(event) => { setPage(1); setModerationStatus(event.target.value); }}>
            <option value="">All moderation</option><option value="active">Active</option>
            <option value="suspended">Suspended</option><option value="banned">Banned</option>
          </select>
          <select aria-label="Role status" value={roleStatus} onChange={(event) => { setPage(1); setRoleStatus(event.target.value); }}>
            <option value="">All roles</option><option value="admin">System admins</option>
            <option value="not_admin">Non-admins</option>
          </select>
        </div>
      </div>

      {error && <div className="error-message" role="alert">{error}</div>}
      {loading && <div className="admin-users-state">Loading users…</div>}
      {!loading && data?.items.length === 0 && (
        <div className="admin-users-state"><strong>No accounts match.</strong><span>Try clearing a filter or broadening the search.</span></div>
      )}
      {!loading && data && data.items.length > 0 && (
        <div className="admin-users-list">
          {data.items.map((user) => (
            <article className="admin-user-row" key={user.id}>
              <div className="admin-user-main">
                <div className="admin-user-identity">
                  <strong>{user.full_name || `User ${user.id}`}</strong>
                  <span>{user.email || user.phone_number || 'No contact identity'} · ID {user.id}</span>
                </div>
                <div className="admin-user-badges">
                  <span className={`admin-status admin-status--${accountLabel(user).toLowerCase().replaceAll(' ', '-')}`}>{accountLabel(user)}</span>
                  <span className={`admin-status admin-status--${user.moderation_status}`}>{user.moderation_status}</span>
                  {user.is_system_admin && <span className="admin-status admin-status--role">System admin</span>}
                </div>
                <div className="admin-user-actions">
                  <button type="button" className="admin-history-btn" onClick={() => toggleHistory(user.id)} aria-expanded={expanded.has(user.id)}>
                    History <ChevronDown size={15} aria-hidden="true" />
                  </button>
                  <button type="button" className={user.is_system_admin ? 'admin-role-btn admin-role-btn--revoke' : 'admin-role-btn'} onClick={() => { setReason(''); setAction({ user, kind: user.is_system_admin ? 'revoke' : 'grant' }); }}>
                    {user.is_system_admin ? <ShieldOff size={16} /> : <ShieldCheck size={16} />}
                    {user.is_system_admin ? 'Revoke' : 'Grant admin'}
                  </button>
                </div>
              </div>
              {expanded.has(user.id) && (
                <div className="admin-role-history">
                  {user.role_history.length === 0 ? <p>No role assignments recorded.</p> : user.role_history.map((entry) => (
                    <div key={entry.id} className="admin-role-event">
                      <strong>{entry.revoked_at ? 'Revoked' : 'Granted'} system admin</strong>
                      <span>
                        {new Date(entry.revoked_at || entry.granted_at).toLocaleString()}
                        {(entry.revoked_at ? entry.revoked_by_user_id : entry.granted_by_user_id)
                          ? ` · user #${entry.revoked_at ? entry.revoked_by_user_id : entry.granted_by_user_id}`
                          : ` · ${entry.grant_source}`}
                      </span>
                      <p>{entry.revoked_at ? entry.revoke_reason : entry.grant_reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {data && data.pages > 1 && (
        <nav className="admin-users-pagination" aria-label="User pages">
          <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={17} /> Previous</button>
          <span>Page {page} of {data.pages}</span>
          <button type="button" disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)}>Next <ChevronRight size={17} /></button>
        </nav>
      )}

      {action && (
        <div className="admin-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setAction(null); }}>
          <div className="admin-role-dialog" role="dialog" aria-modal="true" aria-labelledby="role-dialog-title">
            <div className="admin-role-dialog__mark">{action.kind === 'grant' ? <ShieldCheck /> : <ShieldOff />}</div>
            <h3 id="role-dialog-title">{action.kind === 'grant' ? 'Grant system-admin access?' : 'Revoke system-admin access?'}</h3>
            <p>This change takes effect immediately for <strong>{action.user.full_name || `User ${action.user.id}`}</strong>.</p>
            <label htmlFor="role-reason">Reason</label>
            <textarea id="role-reason" autoFocus maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Record why this access change is necessary" />
            <div className="admin-role-dialog__actions">
              <button type="button" onClick={() => setAction(null)} disabled={saving}>Cancel</button>
              <button type="button" className={action.kind === 'revoke' ? 'danger' : 'primary'} onClick={() => void confirmRoleChange()} disabled={saving || !reason.trim()}>{saving ? 'Saving…' : 'Confirm change'}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
