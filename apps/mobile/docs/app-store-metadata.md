# iOS v1 App Store Metadata Draft

> Prepared: 2026-08-12
> Locale: English (U.S.)
> Version: 1.0.0
> Bundle ID: `com.beachleague.app`

This document is the copy/paste source for Beach League's first iOS App Store
listing and App Review notes. It describes only functionality present in the
release repository. Replace bracketed values in private App Store Connect fields
immediately before submission; never commit review credentials or personal
contact information here.

## Product-page metadata

### App name — 12 of 30 characters

```text
Beach League
```

### Subtitle — 24 of 30 characters

```text
Play, score, and connect
```

### Promotional text — 144 of 170 characters

```text
Organize beach volleyball games, follow your leagues, track ratings and stats, find nearby courts, and stay connected with the players you know.
```

### Description — 1,186 of 4,000 characters

```text
Beach League brings your beach volleyball community together—from the first serve to the updated standings.

PLAY AND SCORE
Create pickup or league sessions, build the roster, record 2v2 scores, and keep a complete game history. Ratings and standings update from submitted results, so players can follow their progress over time.

FOLLOW YOUR PERFORMANCE
See wins, losses, rating history, recent games, and breakdowns with partners and against opponents.

FIND YOUR COMMUNITY
Discover leagues and players, manage invitations, and keep up with league information, rosters, standings, and schedules.

EXPLORE LOCAL COURTS
Find nearby beach volleyball courts, save favorites, check in, browse community photos and reviews, and suggest corrections to court information. Location access is optional and used to suggest nearby league locations and courts.

STAY CONNECTED
Send direct messages, receive league updates and notifications, and control notification preferences. Community reporting and blocking tools are built in.

Beach League requires an account. Availability is limited to the United States and Canada. Users must be at least 13 in the United States and at least 14 in Canada.
```

### Keywords — 96 of 100 UTF-8 bytes

```text
volleyball,leagues,scores,rankings,stats,courts,players,matches,ELO,tournaments,pickup,standings
```

The app name is intentionally not repeated. The list contains no competitor or
company names.

### Categories

- **Primary:** Sports — the core experience is organizing and scoring amateur
  beach volleyball, then following standings, ratings, and player statistics.
- **Secondary:** Social Networking — direct messaging, friends, player
  discovery, profiles, league communities, photos, and reviews support the core
  sports experience.
- **Not Made for Kids:** the app is general-audience and enforces minimum ages of
  13 in the United States and 14 in Canada.

### Copyright

Use the App Store Connect seller's exact person or entity name:

```text
2026 [SELLER LEGAL NAME]
```

Apple expects the year followed by the person or entity that owns the exclusive
rights. Do not use the app name here unless it is also the legal rights owner.

### URLs

- Support URL: `https://beachleaguevb.com/support`
- Privacy Policy URL: `https://beachleaguevb.com/privacy-policy`
- Marketing URL (optional): `https://beachleaguevb.com`
- Terms of Service: `https://beachleaguevb.com/terms-of-service`
- Community Guidelines: `https://beachleaguevb.com/community-guidelines`

Verify public HTTP `200` responses from outside an authenticated session before
submission.

## Version notes

Apple does not show or require “What’s New in this Version” for an app's first
version. Keep the following copy for the first subsequent update rather than
trying to enter it for v1.0:

```text
This update improves reliability and usability across leagues, games, messaging, notifications, and court discovery, with additional accessibility and performance refinements.
```

## App Review notes

Paste the following into the private App Review Notes field after replacing the
bracketed build-specific values. Enter the stable demo username and password in
App Store Connect's dedicated sign-in fields, not in these notes or the repo.

```text
Beach League is a beach volleyball league, game-scoring, statistics, court-discovery, and community app for the United States and Canada. An account is required.

DEMO ACCESS
Use the non-expiring demo credentials supplied in the App Store Connect sign-in fields. The account is seeded with leagues, completed games, ratings, friends, messages, notifications, court reviews, and report/block examples. It does not require access to a personal email inbox or phone. If a verification step unexpectedly appears, contact the App Review contact listed in App Store Connect.

RECOMMENDED REVIEW PATH
1. Home: view recent games, leagues, and nearby courts.
2. Leagues: open the seeded league to review its information, roster, standings, schedule, and league chat.
3. Add Games: create a pickup game or continue the seeded league session, select four players, and enter a score. Please use the seeded review session: [REVIEW SESSION NAME].
4. Profile: open My Stats and My Games to see results, rating history, and partner/opponent breakdowns.
5. Social: view friends, direct messages, and notifications. Open a seeded conversation to test reporting and blocking without contacting a real user.
6. Courts: open a seeded court to view photos and reviews. Submitted photos remain pending while automated safety review completes.
7. Settings > Support: open Community Guidelines, Terms of Service, Privacy Policy, feedback, and email support.
8. Settings > Delete Account: the app offers account deletion in-app and explains the effect before final confirmation.

MODERATION AND USER-GENERATED CONTENT
Users can report supported community content and block accounts. New public photos undergo automated safety review before publication. Reported or flagged material enters the owner moderation workflow, where it can be removed and accounts can be restricted. Direct-message and league-chat writes have independent emergency disable controls. Community Guidelines and a support contact are available from Settings > Support.

LOCATION
Location permission is optional. When granted, approximate/current location is used to suggest nearby league locations and courts. Reviewers may deny permission and use the app's manual location and court browsing paths.

NOTIFICATIONS
Push permission is optional. Reviewers may deny it without losing the core league, game, statistics, court, or messaging experiences. Push delivery itself requires a signed physical device.

SIGN IN WITH APPLE
Sign in with Apple is available on iOS. The supplied seeded demo account is the fastest way to review populated functionality; Apple sign-in creates or links the reviewer's own account and will not contain the seeded demo data.

AGE ELIGIBILITY
The app admits users aged 13 or older in the United States and 14 or older in Canada. Users below the applicable minimum cannot continue registration, and there is no parental override below the minimum. Exact birthdates are not collected for this eligibility check.

BUILD-SPECIFIC NOTES
- Build: [APP STORE BUILD NUMBER]
- Production API and web links use beachleaguevb.com.
- No payment, subscription, advertising, or in-app purchase is offered in v1.
- If review needs help with the seeded moderation examples, contact the App Review contact listed in App Store Connect.
```

Before submission, confirm the review account is non-expiring, every described
seeded object exists, the named review session is safe to modify, and the review
contact's name, email, and phone are current in App Store Connect.

## Release-candidate screenshot plan

Capture the final signed release candidate with realistic seeded data and no
personal information, debug UI, placeholder content, moderation evidence, or
third-party marks. Use a consistent portrait orientation and time/status-bar
state. Apple permits one to ten iPhone screenshots; this plan uses eight.

| Order | Screen and setup | Suggested caption | Feature demonstrated |
|---:|---|---|---|
| 1 | Home with recent games and leagues populated | **Your beach volleyball season, at a glance** | Immediate value and active league context |
| 2 | League standings with a selected season | **Follow every league and standing** | League membership and standings |
| 3 | Score entry with four seeded players and a plausible final score | **Score games right from the court** | 2v2 session scoring |
| 4 | My Stats with rating and record visible | **See your game improve** | Ratings, wins/losses, and performance |
| 5 | Partner or opponent breakdown | **Know your best combinations** | Player-level volleyball analytics |
| 6 | Courts map/list or a polished court detail page | **Find courts near you** | Court discovery; do not imply location is required |
| 7 | Social friends/messages overview using synthetic names | **Stay connected with your players** | Friends and messaging without exposing message contents |
| 8 | Tournament or King of the Beach screen with complete seeded data | **Bring every competition together** | Tournament functionality; omit this shot if the release candidate cannot demonstrate a complete flow |

Use an accepted 6.9-inch iPhone portrait size from Apple's current screenshot
specification. Because the app sets `supportsTablet: false`, an iPad screenshot
set is not planned. App previews are optional and outside v1 scope.

## Field-limit verification

The proposed text was checked as UTF-8 against Apple's current limits:

- Name: maximum 30 characters.
- Subtitle: maximum 30 characters.
- Promotional text: maximum 170 characters.
- Description: maximum 4,000 characters.
- Keywords: maximum 100 bytes; each keyword must be more than two characters.
- App Review Notes: maximum 4,000 bytes.
- Screenshots: one to ten per supported device size/localization.
- “What’s New”: maximum 4,000 characters and unavailable for the first version.

Official Apple references:

- [App information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/)
- [Platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)
- [Categories and discoverability](https://developer.apple.com/app-store/categories/)
- [Upload app previews and screenshots](https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots)
- [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
