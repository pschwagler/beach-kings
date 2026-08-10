import fs from "node:fs";
import path from "node:path";

const { CHECK_NAMES, createReleaseRecord, validateReleaseRecord } =
  require("../../scripts/release-record") as {
    CHECK_NAMES: readonly string[];
    createReleaseRecord: (options: {
      mobileRoot: string;
      repoRoot: string;
      environment?: string;
      buildNumber?: string;
      easBuildId?: string;
      artifact?: string;
      submitter?: string;
      xcodeVersion?: string;
      iosSdkVersion?: string;
      toolchainSource?: string;
      now?: () => Date;
      runCommand?: (command: string, args: string[], cwd: string) => string;
    }) => Record<string, any>;
    validateReleaseRecord: (
      record: Record<string, any>,
      options?: { final?: boolean },
    ) => Record<string, any>;
  };

const mobileRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(mobileRoot, "../..");
const commitSha = "a".repeat(40);

function commandResult(command: string, args: string[]): string {
  if (command === "git" && args.join(" ") === "rev-parse HEAD")
    return commitSha;
  if (command === "git" && args.join(" ") === "status --porcelain") return "";
  if (command === "xcodebuild") return "Xcode 26.2\nBuild version 17C52";
  if (command === "xcrun") return "26.2";
  throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
}

function approvedRecord(): Record<string, any> {
  const record = createReleaseRecord({
    mobileRoot,
    repoRoot,
    buildNumber: "42",
    easBuildId: "eas-build-42",
    artifact: __filename,
    submitter: "Release Submitter",
    xcodeVersion: "26.2",
    iosSdkVersion: "26.2",
    toolchainSource: "eas-build-log",
    now: () => new Date("2026-08-09T12:00:00.000Z"),
    runCommand: commandResult,
  });
  record.status = "approved";
  record.artifact.fileName = "BeachLeague.ipa";
  for (const check of CHECK_NAMES) record.checks[check] = "passed";
  record.approval = {
    decision: "go",
    releaseOwner: "Release Owner",
    decidedAt: "2026-08-09T13:00:00.000Z",
    notes: "Approved after TestFlight acceptance.",
  };
  return record;
}

describe("iOS release record", () => {
  it("generates a deterministic draft with source, environment, and artifact evidence", () => {
    const record = approvedRecord();
    expect(record).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        createdAt: "2026-08-09T12:00:00.000Z",
        release: expect.objectContaining({
          environment: "production",
          bundleIdentifier: "com.beachleague.app",
          version: "1.0.0",
          buildNumber: "42",
          apiOrigin: "https://beachleaguevb.com",
        }),
        source: { commitSha, clean: true },
        toolchain: expect.objectContaining({
          source: "eas-build-log",
          easImage: "macos-sequoia-15.6-xcode-26.2",
          xcodeVersion: "26.2",
          iosSdkVersion: "26.2",
        }),
        artifact: expect.objectContaining({
          fileName: "BeachLeague.ipa",
          sizeBytes: expect.any(Number),
          sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      }),
    );
  });

  it("keeps the checked-in template aligned with the schema", () => {
    const template = JSON.parse(
      fs.readFileSync(
        path.join(mobileRoot, "docs/release-record-template.json"),
        "utf8",
      ),
    );
    expect(template.schemaVersion).toBe(1);
    expect(Object.keys(template.checks)).toEqual(CHECK_NAMES);
    expect(template.release).toEqual(
      expect.objectContaining({
        environment: "production",
        bundleIdentifier: "com.beachleague.app",
        apiOrigin: "https://beachleaguevb.com",
      }),
    );
  });

  it("accepts a complete approved production record", () => {
    expect(() =>
      validateReleaseRecord(approvedRecord(), { final: true }),
    ).not.toThrow();
  });

  it.each([
    [
      "dirty source",
      (record: Record<string, any>) => {
        record.source.clean = false;
      },
      /clean worktree/,
    ],
    [
      "missing artifact checksum",
      (record: Record<string, any>) => {
        record.artifact.sha256 = null;
      },
      /SHA-256/,
    ],
    [
      "pending TestFlight check",
      (record: Record<string, any>) => {
        record.checks.testFlightSmoke = "pending";
      },
      /testFlightSmoke must pass/,
    ],
    [
      "missing approval",
      (record: Record<string, any>) => {
        record.approval.decision = "pending";
      },
      /approval must be go/,
    ],
    [
      "unverified toolchain",
      (record: Record<string, any>) => {
        record.toolchain.source = "local";
      },
      /EAS build log/,
    ],
    [
      "old Xcode",
      (record: Record<string, any>) => {
        record.toolchain.xcodeVersion = "26.1";
      },
      /Xcode 26.2/,
    ],
    [
      "wrong production origin",
      (record: Record<string, any>) => {
        record.release.apiOrigin = "https://example.com";
      },
      /production API origin/,
    ],
  ])("rejects final validation for %s", (_label, mutate, expected) => {
    const record = approvedRecord();
    mutate(record);
    expect(() => validateReleaseRecord(record, { final: true })).toThrow(
      expected,
    );
  });
});
