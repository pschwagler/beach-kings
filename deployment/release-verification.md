# Release verification

Use this procedure when answering “is the fix on main?” or “is it deployed?”.
[BUILD_AND_DEPLOY.md](../BUILD_AND_DEPLOY.md) is the release entry point.
The workflows linked below define actual behavior; this document describes it.
Do not publish host addresses, private logs, environment values, or credentials.

## Establish the source revision

Before recommending upgrades, fetch remote refs and compare the working tree
with main. These commands do not check out or overwrite working files:

```bash
git fetch origin
git branch --show-current
git status --short
git log -1 --format='%h %ad %s' --date=iso-strict HEAD
git log -1 --format='%h %ad %s' --date=iso-strict origin/main
git log -8 origin/main --oneline
```

Inspect files with `git show origin/main:<path>`. Search related history with
`git log --all --oneline -- <paths>` and use
`git branch -r --contains <fix-commit>` to distinguish merged fixes from fixes
that exist only on another branch. If installs, audits, or edits are needed,
use a clean worktree from `origin/main` rather than disturbing unrelated work.
Record the full reviewed SHA, since `origin/main` can move after a fetch.

For npm, audit that revision's `package-lock.json`. For Python, audit
`requirements-runtime.lock`, the production dependency graph, rather than
resolving `requirements.txt` (which includes development dependencies).
[Security checks](../.github/workflows/security.yml) also validate the runtime
lock and dependency compatibility. Package audits do not replace image scans
or prove that a vulnerable code path is reachable.

## Production web/API deployment

[Deploy Prod](../.github/workflows/deploy-prod.yml) follows successful push
runs of [CI](../.github/workflows/ci.yml) on main in this repository. Manual
dispatch takes one `branch` input, defaulting to main. Every release builds and
scans images. Production rollout jobs are serialized and a new rollout does not cancel one
in progress. GitHub Actions can replace a pending rollout with a newer one.

Both paths resolve one source commit before scanning and use that SHA for the
security checks, image builds, and EC2 checkout. Before changing the host,
an automatic run also checks that its commit is still at the tip of main. An
outdated run stops before checking out the source or touching containers.

The workflow:

1. Calls Security checks for the requested ref: npm audit (including dev tools),
   dependency compatibility, Python runtime lock validation/audit, and freshly
   built frontend/backend container scans. Trivy blocks fixable HIGH/CRITICAL
   findings; unfixed findings are excluded by `ignore-unfixed: true`.
2. Builds frontend/backend images in GitHub Actions and pushes them to GHCR.
   `NEXT_PUBLIC_*` frontend configuration is supplied at build time. Changing
   the host environment alone cannot change values compiled into the frontend.
3. Scans the exact frontend/backend image digests selected for deployment.
4. Connects to EC2, checks out the resolved commit, and runs the
   provider configuration preflight against the host configuration.
5. Requires the installed database-backup systemd service to complete before
   pulling images or starting migration-capable containers. See the
   [backup installation and recovery guide](backups/README.md).
6. Exports `ENV=production` and a new shared readiness generation, pulls the
   digest-selected frontend/backend images, and starts Docker Compose services.
   API and workers use the same backend image. The API entrypoint owns Alembic
   migrations; workers execute their own commands and skip migrations.
7. Checks API liveness (`/api/health`) and dependency readiness (`/api/ready`),
   applies the committed court catalog, checks the frontend, and verifies
   required public pages locally and at `https://beachleaguevb.com`.
8. Records the source SHA, both image references, and the run URL in the job
   summary and the downloadable `production-release` artifact.

Readiness includes configuration and worker heartbeat checks; the generation
prevents stale auth-delivery/moderation heartbeats from satisfying a new release.
It is not a publicly exposed build-version endpoint. `/api/health` and
`/api/ready` alone cannot identify a source commit or prove the frontend version.

## Verify deployment evidence

Start with read-only GitHub Actions inspection:

```bash
gh run list --workflow deploy-prod.yml --limit 10 \
  --json databaseId,status,conclusion,headSha,createdAt,url
gh run view <run-id> --json status,conclusion,headSha,jobs,url
```

If CLI authentication fails, use the Actions UI or the public repository's
unauthenticated REST API before declaring deployment history inaccessible:

```bash
curl --fail --silent --show-error \
  'https://api.github.com/repos/pschwagler/beach-kings/actions/workflows/deploy-prod.yml/runs?per_page=5'
curl --fail --silent --show-error \
  'https://api.github.com/repos/pschwagler/beach-kings/actions/runs/<run-id>/jobs'
```

These endpoints expose run/job results, not necessarily dispatch inputs, build
logs, image digests, or current host state. If a deployed branch commit differs
from main, compare `git rev-parse <commit>^{tree} origin/main^{tree}`: identical
tree IDs establish identical tracked file contents, even with different merge
commit IDs. Report this as deployment-history evidence rather than independent
verification of currently running containers.

For current runs, use the release manifest to identify the deployed source SHA
and image digests. Also verify the scan, backup, startup, readiness, and route
checks passed. For older runs without a manifest, inspect the selected branch
and the build job's actual checkout SHA and digests. The Actions run's
`headSha` identifies the workflow revision and can differ from the built source.

If existing authorized host access is available, confirm the host checkout and
running container references with these read-only commands from the repo on EC2:

```bash
git rev-parse HEAD
docker-compose -f docker-compose.yml ps
for service in frontend backend auth-delivery-worker moderation-worker push-worker; do
  for container_id in $(docker-compose -f docker-compose.yml ps -q "$service"); do
    docker inspect --format '{{.Name}} {{.Config.Image}} {{.Image}}' "$container_id"
  done
done
```

Compare `.Config.Image` with the frontend/backend `@sha256:` references from the
successful run. `.Image` is Docker's local image ID, not the registry manifest
digest. Check all API/worker replicas returned by Compose. Do not dump `.env`,
`docker inspect` in full, or rendered Compose configuration: these can expose
credentials. Host HEAD alone is insufficient because containers can be older
than the checkout.

Public availability can be checked separately without host access:

```bash
curl --fail --silent --show-error https://beachleaguevb.com/api/health
curl --fail --silent --show-error https://beachleaguevb.com/api/ready
bash deployment/verify-public-web-routes.sh https://beachleaguevb.com
```

Report the reviewed source SHA, run URL/conclusion, image digests and whether
running containers match, plus readiness/public-page results. If access fails,
report deployment as unverified; do not infer failure or success from it.
Never dispatch a release merely to discover the deployed version.

## Current limitations and follow-up

- The release manifest records a successful rollout. Use a read-only host
  check when you need to confirm the containers are still running those images.
  GitHub retains the artifact according to the repository retention settings.
- The image matrix scans frontend/backend, not the running PostgreSQL/Redis
  images or EC2 host packages. Those need separate maintenance evidence. A clean
  package audit is not a complete infrastructure security assessment.
- Deployment failure does not trigger an automatic database rollback. Diagnose
  and plan a compatible fix; never reset, recreate, or restore over remote data.

## Dev and mobile are separate release paths

[Deploy Dev](../.github/workflows/deploy-dev.yml) is manual, restricted to its
listed branch choices, and uses the `dev-provider-validation` GitHub environment.
It builds on EC2 with Compose rather than using the production digest pipeline.
Do not assume the production security/backup/readiness gates apply to dev.
Use `refresh_db: false`: its optional snapshot/restore path replaces remote dev
data and conflicts with the agent safety rule against remote database resets.

An EC2 deployment does not update installed mobile bundles. Follow the
[iOS release guide](../apps/mobile/docs/ios-release.md) for EAS profiles,
release evidence, TestFlight/App Store delivery, and the v1 no-OTA policy.
