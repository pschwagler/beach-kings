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
4. Set `PUSH_DELIVERY_ENABLED=true` for `push-worker` only. Startup fails with a
   clear error if delivery is enabled without the token.

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
