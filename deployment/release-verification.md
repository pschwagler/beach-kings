# Release verification

Follow the [release guide](../BUILD_AND_DEPLOY.md) to ship a change. Use this
procedure to confirm what is running.

## Find the deployment and release manifest

In GitHub Actions, open the latest successful
[Deploy Prod](../.github/workflows/deploy-prod.yml) run and download the
`production-release` artifact. The job summary also records the resolved source
SHA, frontend and backend image references, and run URL.

```bash
gh run list --workflow deploy-prod.yml --status success --limit 5
gh run download "$RUN_ID" --name production-release
```

For older runs without a manifest, review the build checkout SHA and image
digests in the Actions logs. The run's `headSha` identifies the workflow
revision and can differ from the build checkout. If the CLI cannot authenticate,
use the Actions UI or the public GitHub Actions REST API for run and job status.

## Compare the running images

With authorized EC2 access, run these read-only checks from the deployment
checkout:

```bash
git rev-parse HEAD
docker-compose -f docker-compose.yml ps
for service in frontend backend auth-delivery-worker moderation-worker push-worker; do
  for container_id in $(docker-compose -f docker-compose.yml ps -q "$service"); do
    docker inspect --format '{{.Name}} {{.State.Status}} {{.Config.Image}}' "$container_id"
  done
done
```

Compare each running container's image reference with the manifest's
`@sha256:` reference. API and workers should use the same backend digest. Host
HEAD and HTTP status alone cannot identify the image serving requests. Keep
private host details, logs, and environment values out of public reports.

## Check production readiness

```bash
curl --fail --silent --show-error https://beachleaguevb.com/api/health
curl --fail --silent --show-error https://beachleaguevb.com/api/ready
bash deployment/verify-public-web-routes.sh https://beachleaguevb.com
```

Record the run URL, source SHA, digest comparison, and live check results.
If host access is unavailable, report what the deployment record establishes
and leave running image identity unverified.

## Verify iOS push delivery for one account

1. Sign in to a dedicated test account on a physical iPhone using the signed build. Enable notifications in Beach League. Confirm that the account has only the intended installation registered.
2. In protected deployment configuration, keep `PUSH_DELIVERY_ENABLED=false`, set `PUSH_DELIVERY_TEST_USER_ID` to the dedicated account's numeric ID, and configure the Expo push credential. Immediately before starting the test rollout, set `PUSH_DELIVERY_START_AT` to the current time as an ISO 8601 timestamp with a UTC offset. Recreate the push worker through the deployment process. Keep the configured timestamp on restarts during the test rollout. Only test account jobs created at or after that instant are eligible for sends.
3. With the app in the background, trigger a new direct message to the test account through the normal app flow. Confirm that a notification appears on the phone and tapping it opens the conversation. Check the worker outcome and complete the [signed-device notification matrix](../apps/mobile/docs/ios-release.md#ios-006--testflight-release-candidate). A successful [Expo receipt](https://docs.expo.dev/push-notifications/sending-notifications/#check-push-receipts-for-errors) confirms the handoff to APNs. The phone confirms display and tap routing.
4. Clear `PUSH_DELIVERY_TEST_USER_ID` and recreate the worker to return to disabled mode. Keep account IDs, credentials, tokens, and raw delivery records in private test notes.

## Enable public push delivery

Immediately before the public rollout, record a fresh `PUSH_DELIVERY_START_AT`
as an ISO 8601 timestamp with a UTC offset in protected deployment configuration.
Clear `PUSH_DELIVERY_TEST_USER_ID`, set `PUSH_DELIVERY_ENABLED=true`, and recreate
the push worker through the deployment process with the Expo credential.
Keep the public launch timestamp on worker restarts. Verify delivery from a new
application event and confirm that new sends only claim jobs created at or after
the launch timestamp. Earlier ticketed jobs can still receive receipt updates.

## Recreate or roll back the push worker

Before turning on either delivery mode, verify that the running release includes
the launch cutoff. When applying configuration without a full deployment, use
the current production manifest's backend image reference, including its digest.
Recreate only `push-worker` from the production checkout.

```bash
: "${DEPLOYED_BACKEND_IMAGE:?Set this to the backend image digest from the production manifest}"
ENV=production BACKEND_IMAGE="$DEPLOYED_BACKEND_IMAGE" \
  docker-compose -f docker-compose.yml up -d --no-deps --force-recreate push-worker
```

Before rolling back to a release that predates the cutoff, stop `push-worker`.
Persist `PUSH_DELIVERY_ENABLED=false` and clear `PUSH_DELIVERY_TEST_USER_ID` in
protected deployment configuration before deploying or restarting it. Earlier
releases ignore `PUSH_DELIVERY_START_AT` and can send the historical backlog if
started with delivery enabled.

## Release and audit scope

Push CI on main gates automatic web/API rollout. Mobile checks run on PRs and
manual CI runs. The deployment uses one source SHA, serializes rollouts, and
rejects stale automatic releases or a host checkout with tracked changes.

For dependency reviews, fetch main, record the reviewed SHA, and audit its
`package-lock.json` and `requirements-runtime.lock`.
[Security checks](../.github/workflows/security.yml) validate the locked
dependencies and audit the app images. Deploy Prod also scans the exact
frontend/backend images and blocks fixable high and critical findings. Track
PostgreSQL, Redis, and EC2 host updates separately.
