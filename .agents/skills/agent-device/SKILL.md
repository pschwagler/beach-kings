---
name: agent-device
description: Use for Beach Kings mobile/iOS simulator verification with agent-device: open the app, inspect UI, tap/click, type, scroll, screenshot, or debug simulator state.
---

# agent-device

Use this skill for mobile verification. For setup details, read `references/bootstrap-install.md`; for UI interaction details, read `references/exploration.md`.

## Beach Kings

- App: `Beach League`; bundle ID: `com.beachleague.app`.
- First run `agent-device session list`; active `bk*` sessions are in use.
- If no `bk*` session exists, use `--session bk`. If one exists, choose `bk-a`, `bk-b`, etc. and a different simulator UDID from `agent-device devices --platform ios`.
- Start a session with explicit routing: `agent-device --session <name> open com.beachleague.app --platform ios --udid <UDID>`.
- After opening, use only `--session <name>` on follow-up commands.
- Use `snapshot` to read, `snapshot -i` before clicks, and `click @eN` instead of `tap` or text-string clicks.
- For in-app back, click the visible back-button ref.
- If the app shows React Native redbox `No script URL provided`, start Metro with `npm run start --workspace @beach-kings/mobile`, then foreground/reopen the same session.
- `network dump` does not capture React Native `fetch`; inspect `packages/api-client/src/methods.ts` and `apps/mobile/src/lib/api.ts`.

## References

- Setup, sessions, target pinning: `references/bootstrap-install.md`
- Interaction, snapshots, refs, scrolling: `references/exploration.md`
- Logs, alerts, failures: `references/debugging.md`
- Screenshots, recordings, perf: `references/verification.md`
- Remote daemon or tenancy: `references/remote-tenancy.md`
