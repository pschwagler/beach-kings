# Build and release guide

## Production web and API

Production runs on EC2 with Docker Compose. Install and verify the [off-host
backup system](deployment/backups/README.md) before the first release on a new
host. See [EC2_DEPLOYMENT.md](EC2_DEPLOYMENT.md) for host provisioning.

1. Merge the reviewed change into `main` after the required checks pass.
2. Follow the post-merge web/API **CI** run and the subsequent **Deploy Prod**
   rollout. The workflow requires security checks, a fresh database backup,
   successful startup and migrations, and readiness and public-route checks.
3. Confirm the run succeeded and use its release manifest to verify the source
   and images. Follow the [release verification guide](deployment/release-verification.md).

For an on-demand release, use **Actions → Deploy Prod**, with `main` as the
default branch input. Use the workflow for routine releases. The API entrypoint
owns migrations. If a rollout fails, diagnose it before retrying and preserve
the remote database.

## iOS

Follow the [iOS release guide](apps/mobile/docs/ios-release.md) and the
[App Store launch checklist](apps/mobile/docs/app-store-backlog.md). Production
uses the EAS `production` profile. Version 1 ships code and assets in reviewed
TestFlight and App Store builds.

## Development and preview builds

EAS provides an iOS simulator development client and an internal preview build.
Use the manual [Deploy Dev workflow](.github/workflows/deploy-dev.yml) for dev
EC2 releases, with `refresh_db: false` to preserve the remote dev database.
