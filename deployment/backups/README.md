# Production database backups

Production PostgreSQL backups are custom-format `pg_dump` archives uploaded to
a private S3 bucket once per day. Each archive has a SHA-256 checksum, is
validated with `pg_restore --list` before upload, and is stored under an
immutable timestamped key:

```text
s3://<bucket>/database/production/YYYY/MM/DD/beach-kings-YYYYMMDDTHHMMSSZ.dump
```

This provides an expected recovery-point objective (RPO) of 24 hours. Recovery
time depends primarily on database size and S3 transfer speed. Measure it with
the restore drill before adopting an RTO.

## 1. Configure the S3 bucket

Use a dedicated bucket in the production account. Enable Block Public Access,
versioning, default encryption, and a lifecycle policy. The example below keeps
daily archives for one year and moves older objects to cheaper storage. Replace
the placeholders; do not run it against an unrelated bucket.

```bash
aws s3api put-public-access-block \
  --bucket <backup-bucket> \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws s3api put-bucket-versioning \
  --bucket <backup-bucket> \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
  --bucket <backup-bucket> \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'

aws s3api put-bucket-lifecycle-configuration \
  --bucket <backup-bucket> \
  --lifecycle-configuration file://deployment/backups/s3-lifecycle.json
```

For stronger deletion protection, create a new bucket with S3 Object Lock and
governance retention. Object Lock must be enabled when the bucket is created.
Keep the bucket in a separate AWS account if recovery from an account-level
compromise is part of the threat model.

## 2. Give EC2 an instance role

Attach an IAM instance profile to the production EC2 instance. Do not place
long-lived AWS keys in `.env` or `backup.env`. The role needs only:

- `s3:PutObject` and `s3:GetObject` for
  `arn:aws:s3:::<backup-bucket>/database/production/*`
- `sns:Publish` for the optional failure-notification topic
- If using a customer-managed KMS key: `kms:Encrypt`, `kms:Decrypt`, and
  `kms:GenerateDataKey` for that key

The bucket policy should deny non-TLS requests. If Object Lock is enabled, do
not grant the application role permission to bypass governance retention.

## 3. Install the timer on production

Install AWS CLI v2, then install the checked-in configuration and systemd
units. Review `backup.env` before starting the timer.

```bash
sudo install -d -o root -g root -m 0700 /etc/beach-kings
sudo install -d -o ubuntu -g docker -m 0700 /var/lib/beach-kings-backups
sudo install -m 0600 deployment/backups/backup.env.example /etc/beach-kings/backup.env
sudo install -m 0644 deployment/backups/beach-kings-db-backup.service /etc/systemd/system/
sudo install -m 0644 deployment/backups/beach-kings-db-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload

# Run and inspect one backup before enabling the schedule.
sudo systemctl start beach-kings-db-backup.service
sudo systemctl status beach-kings-db-backup.service
sudo journalctl -u beach-kings-db-backup.service --since today

sudo systemctl enable --now beach-kings-db-backup.timer
systemctl list-timers beach-kings-db-backup.timer
```

The timer targets 02:00 UTC daily with up to 30 minutes of random delay and is
persistent, so a missed run starts after the instance returns. Set
`BACKUP_SNS_TOPIC_ARN` to receive a failure alert through SNS.

## 4. Verify archives and practice recovery

List recent archives:

```bash
aws s3 ls s3://<backup-bucket>/database/production/ --recursive | tail
```

At least monthly, restore a recent object into a disposable, unexposed
PostgreSQL container:

```bash
BACKUP_AWS_REGION=us-east-1 \
  deployment/backups/restore-drill.sh \
  s3://<backup-bucket>/database/production/YYYY/MM/DD/beach-kings-YYYYMMDDTHHMMSSZ.dump
```

The drill downloads and verifies the checksum, creates an isolated PostgreSQL
container with no published ports, restores with `--exit-on-error`, confirms
that public tables exist, and deletes the container. It never connects to or
modifies production PostgreSQL.

For an actual incident, first restore into a separate database or replacement
host and validate application data. Promotion or replacement of production is
a separate, explicitly approved operation; do not pipe a dump directly into
the live database.

## Operational checklist

- Confirm a new S3 object and checksum appear every day.
- Alert if the systemd unit fails or the newest archive is over 26 hours old.
- Review AWS CloudTrail access to the backup prefix.
- Run and record a restore drill monthly and after PostgreSQL upgrades.
- Review lifecycle and Object Lock retention annually.
- Keep the Docker volume for runtime persistence, but never count it as backup.
