# Native push notifications

Native delivery uses Expo Push Service from the separate `push-worker` process.
FastAPI transactions only create notification rows and durable delivery jobs;
they never wait for Expo. WebSockets remain the foreground cache transport.

## Enable delivery

1. Link the mobile app to the production EAS project and confirm the runtime
   `projectId` is present.
2. Configure production APNs credentials in EAS and enable enhanced push
   security.
3. Store `EXPO_ACCESS_TOKEN` in the deployment secret store.
4. Immediately before starting either rollout, set `PUSH_DELIVERY_START_AT` for
   `push-worker` to the current time as an ISO 8601 timestamp with a UTC offset
   (for example, `2026-01-01T12:00:00Z`). For a scoped TestFlight rollout, keep
   `PUSH_DELIVERY_ENABLED=false` and set `PUSH_DELIVERY_TEST_USER_ID` to the
   dedicated account's numeric ID. For public launch, choose a fresh timestamp,
   clear `PUSH_DELIVERY_TEST_USER_ID`, and set `PUSH_DELIVERY_ENABLED=true`.
5. Recreate the worker to apply the rollout configuration. Keep its timestamp
   fixed across restarts. Both active modes require a valid timestamp and the
   Expo access token at startup.

The cutoff includes jobs created at the configured instant. Earlier pending
jobs stay queued and are ineligible for Expo sends. The worker can still
check receipts for earlier jobs that already have Expo tickets.

Never print an Expo device token, unregister secret, message body, or full push
payload while diagnosing delivery.

## Test delivery and receipts

Register a signed build on a physical phone, trigger a normal application event,
and inspect aggregate worker logs. An accepted send moves a job from `pending`
to `ticketed`; after 15 minutes the worker requests its Expo receipt and records
`delivered` or a sanitized error code. `DeviceNotRegistered` removes the stale
installation. Transient network, HTTP 429, and provider failures retry at most
five times with bounded exponential backoff.

For diagnosis, query job status, attempts, ticket ID, and `last_error_code` by
notification ID. Do not select or log the payload column or join the device
token value. Terminal metadata is retained for 30 days and then purged.
