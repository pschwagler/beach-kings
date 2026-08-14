# Adding a user-to-user feature

Every feature that names, targets, delivers content from, or exposes activity
about another player must integrate with the centralized interaction policy.

1. Add the action to `InteractionAction` and give it an explicit rule in
   `ACTION_POLICY`. The exhaustive registry test must pass.
2. Enforce the action in the backend service that performs the mutation. A
   denied mutation must reach clients as `409 Interaction unavailable`.
3. Expose the action through `InteractionCapability`; use the authenticated
   batch-capability endpoint for lists and profiles.
4. Provide a generic unavailable state in mobile. Only
   `blocked_by_viewer` and the viewer's own restriction may be explained.
5. Identify the actor on notifications and real-time events so bilateral
   filtering can be applied before delivery and in feed/unread queries.
6. Add policy tests for both block directions, both restriction directions,
   the capability fetched-before-mutation race, and any shared-content
   exception.

## Abuse-path integration matrix

| Path | Blocker → blocked | Blocked → blocker | After unblock | Required assertion |
| --- | --- | --- | --- | --- |
| Direct messages | denied | denied | history returns | unread state is preserved |
| Friend requests/actions | denied | denied | not restored | cleanup is atomic |
| League invites | denied | denied | not restored | mutation returns generic 409 |
| Session invites | denied | denied | not restored | batch cannot partially bypass policy |
| Notifications/events | filtered | filtered | new events allowed | no visible block event is sent |
| Discovery/suggestions | excluded | excluded | visible after refetch | counts match filtered rows |
| Shared league facts | visible | visible | visible | rosters/results/schedules never disappear |
| Shared league chat | blocker collapses | remains visible | visible | mentions/replies stay disabled both ways |
| Account deletion | cascades safely | cascades safely | n/a | no orphaned block or restriction rows |

The IOS-001 checklist and issue #124 should only be closed after an integration
run has exercised every row in both directions against a migrated database.
