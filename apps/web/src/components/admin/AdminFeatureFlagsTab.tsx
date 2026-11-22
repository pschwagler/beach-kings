"use client";

import { useEffect, useState } from "react";
import {
  getAdminFeatureFlags,
  getFlagHistory,
  saveFeatureFlag,
  type FeatureFlag,
  type FlagChange,
} from "../../services/endpoints/featureFlags";
import "./AdminFeatureFlagsTab.css";

const emptyFlag = (): FeatureFlag => ({
  key: "",
  description: "",
  enabled: false,
  rollout_percent: 0,
  user_ids: [],
  platforms: ["web", "ios", "android"],
  revision: 1,
});

export default function AdminFeatureFlagsTab() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [draft, setDraft] = useState<FeatureFlag | null>(null);
  const [creating, setCreating] = useState(false);
  const [targets, setTargets] = useState("");
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<FlagChange[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const loaded = await getAdminFeatureFlags();
      setFlags(loaded);
      setError("");
    } catch {
      setError("Could not load feature flags. Try again.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    getAdminFeatureFlags()
      .then((loaded) => {
        if (active) setFlags(loaded);
      })
      .catch(() => {
        if (active) setError("Could not load feature flags. Try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function edit(flag: FeatureFlag, isNew = false) {
    setDraft({ ...flag });
    setCreating(isNew);
    setTargets(flag.user_ids.join(", "));
    setReason("");
    setHistory(null);
    setError("");
    setMessage("");
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const pieces = targets.trim()
      ? targets.split(/[\s,]+/).filter(Boolean)
      : [];
    if (
      pieces.some(
        (value) =>
          !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)),
      )
    ) {
      setError("Enter positive user IDs separated by commas.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const saved = await saveFeatureFlag(
        { ...draft, user_ids: pieces.map(Number) },
        reason.trim(),
        creating,
      );
      setFlags((previous) =>
        [...previous.filter((f) => f.key !== saved.key), saved].sort((a, b) =>
          a.key.localeCompare(b.key),
        ),
      );
      setDraft(null);
      setMessage(
        `Saved ${saved.key}. Connected apps refresh within about a minute.`,
      );
    } catch (err) {
      const status = (err as { response?: { status: number } }).response
        ?.status;
      setError(
        status === 409
          ? "This flag changed or already exists. Cancel and reload before saving."
          : "Could not save. Check selected user IDs and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function showHistory() {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      setHistory(await getFlagHistory(draft.key));
    } catch {
      setError("Could not load change history.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="feature-flags" aria-labelledby="flags-title">
      <div className="feature-flags-heading">
        <div>
          <h2 id="flags-title">Feature flags</h2>
          <p>
            Control releases for web and mobile. Changes apply to this
            environment.
          </p>
        </div>
        <button
          className="btn-primary"
          disabled={busy || loading || !!draft}
          onClick={() => edit(emptyFlag(), true)}
        >
          New flag
        </button>
      </div>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="success-message">
          {message}
        </p>
      )}
      {loading ? (
        <p role="status">Loading feature flags…</p>
      ) : (
        <>
          {!draft && (
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setError("");
                void load();
              }}
            >
              Reload flags
            </button>
          )}
          {!flags.length && !draft && (
            <p>
              No flags yet. Create one, then connect its key to the feature in
              both clients and the API.
            </p>
          )}
          {!draft && (
            <ul className="feature-flag-list">
              {flags.map((flag) => (
                <li key={flag.key}>
                  <div>
                    <strong>{flag.key}</strong>
                    <p>{flag.description}</p>
                    <small>
                      {flag.enabled
                        ? `${flag.rollout_percent}% rollout · ${flag.user_ids.length} selected users`
                        : "Disabled for everyone"}{" "}
                      · {flag.platforms.join(", ")}
                    </small>
                  </div>
                  <button
                    type="button"
                    onClick={() => edit(flag)}
                    aria-label={`Manage ${flag.key}`}
                  >
                    Manage
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {draft && (
        <form onSubmit={save} className="feature-flag-editor">
          <h3>{creating ? "New feature flag" : `Manage ${draft.key}`}</h3>
          <label>
            Flag key
            <input
              required
              pattern="[a-z][a-z0-9_]{1,79}"
              maxLength={80}
              disabled={!creating || busy}
              value={draft.key}
              onChange={(e) => setDraft({ ...draft, key: e.target.value })}
            />
          </label>
          <label>
            Description
            <input
              required
              maxLength={500}
              disabled={busy}
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          </label>
          <label className="feature-flag-check">
            <input
              type="checkbox"
              disabled={busy}
              checked={draft.enabled}
              onChange={(e) =>
                setDraft({ ...draft, enabled: e.target.checked })
              }
            />
            Enabled
          </label>
          <p>
            Disabling overrides every targeting rule. Enabling includes selected
            users plus the rollout percentage on allowed platforms.
          </p>
          <label>
            Rollout percentage
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              required
              disabled={busy}
              value={draft.rollout_percent}
              onChange={(e) =>
                setDraft({ ...draft, rollout_percent: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Selected user IDs
            <input
              disabled={busy}
              value={targets}
              onChange={(e) => setTargets(e.target.value)}
              placeholder="12, 34, 56"
            />
          </label>
          <p>
            Use account IDs from the Users tab. At 0%, only selected users have
            access. Signed-out visitors require 100%.
          </p>
          <fieldset disabled={busy}>
            <legend>Platforms</legend>
            {(["web", "ios", "android"] as const).map((platform) => (
              <label key={platform} className="feature-flag-check">
                <input
                  type="checkbox"
                  checked={draft.platforms.includes(platform)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      platforms: e.target.checked
                        ? [...draft.platforms, platform]
                        : draft.platforms.filter((p) => p !== platform),
                    })
                  }
                />
                {platform}
              </label>
            ))}
          </fieldset>
          <label>
            Reason for change
            <textarea
              required
              maxLength={500}
              disabled={busy}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="feature-flag-actions">
            <button
              className="btn-primary"
              disabled={busy || !reason.trim() || !draft.platforms.length}
            >
              {busy ? "Working…" : "Save flag"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDraft(null);
                setError("");
              }}
            >
              Cancel
            </button>
            {!creating && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void showHistory()}
              >
                View change history
              </button>
            )}
          </div>
          {history && (
            <div aria-live="polite">
              <h4>Recent changes</h4>
              {!history.length && (
                <p>No changes recorded since installation.</p>
              )}
              <ol>
                {history.map((change) => (
                  <li key={change.id}>
                    <time>{new Date(change.occurred_at).toLocaleString()}</time>{" "}
                    · User {change.actor_user_id ?? "removed"}
                    <p>{change.reason}</p>
                    <details>
                      <summary>Saved configuration</summary>
                      <pre>
                        {JSON.stringify(
                          { before: change.before, after: change.after },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </form>
      )}
    </section>
  );
}
