# Build and release guide

This file is the entry point for release documentation. Release requirements
are intentionally kept in their domain-specific authoritative documents rather
than duplicated here.

## Production web and API

Production runs on EC2 with Docker Compose. **Deploy Prod** runs after
successful CI on a push to main. Manual dispatch remains available for recovery. Do not deploy production with local
`docker compose up`, and do not run database migrations manually; the backend
entrypoint applies migrations when the released container starts.

Before the first production deployment containing the S3 backup system,
complete the one-time bucket, IAM role, notification, and systemd installation
in [deployment/backups/README.md](deployment/backups/README.md). Once installed,
every **Deploy Prod** run creates and verifies a new off-host database backup
before pulling images or starting migration-capable containers. A failed or
missing backup service blocks the deployment.

Normal service release:

1. Merge the reviewed commit to `main` after required CI succeeds.
2. Confirm the latest scheduled database archive and checksum exist in S3.
3. Follow the post-merge **CI** run and the subsequent **Deploy Prod** run.
   For a manual release, use **Actions → Deploy Prod** and select the branch
   input, which defaults to main. The workflow always builds and scans images.
4. Confirm the pre-deployment backup step succeeds.
5. Confirm the committed location, court-tag, and court catalog applies
   successfully. Catalog records missing from the new commit are retired, never
   deleted.
6. Confirm `/api/health`, `/api/ready`, the frontend, and required public-route
   checks succeed in the workflow.
7. Record the deployed source commit, workflow run, and frontend/backend image
   digests using the [verification procedure](deployment/release-verification.md).
   If verification fails, stop and diagnose; do not restore over the live database or rerun destructive
   migrations as an ad hoc rollback.

The security workflow runs daily, on pull requests to `main`/`develop`, and as
a production deployment gate. It audits locked dependencies and scans images;
Deploy Prod also scans the exact image digests it will deploy. A passing scan
does not prove that production has been updated. See the
[verification procedure](deployment/release-verification.md) for evidence and
current limitations.

The EC2 provisioning checklist is [EC2_DEPLOYMENT.md](EC2_DEPLOYMENT.md). It is
for creating or rebuilding the host, not for routine releases.

## iOS

The authoritative release configuration and evidence procedure is
[apps/mobile/docs/ios-release.md](apps/mobile/docs/ios-release.md). The only v1
launch checklist is
[apps/mobile/docs/app-store-backlog.md](apps/mobile/docs/app-store-backlog.md).

Production iOS builds use the checked-in EAS `production` profile. Version 1
does not use EAS Update or any other over-the-air JavaScript delivery; every
code or asset change ships in a reviewed TestFlight/App Store binary.

## Development and preview builds

The checked-in EAS profiles support an iOS simulator development client and an
internal preview build. Dev EC2 releases use the manual **Deploy Dev** workflow.
Use `refresh_db: false`. The optional production snapshot path restores and
sanitizes the remote dev database; it is not production disaster recovery and
conflicts with the agent rule against resetting remote database data.
