# Mobile UI/UX Review

Last verified: August 1, 2026<br>
Documented: July 18, 2026; status updated August 1, 2026<br>
Platform: iOS simulator, iPhone 17 Pro / iPhone 17 Pro Max<br>
App: Beach League (`com.beachleague.app`)

## Purpose

This document captures UI, UX, styling, and accessibility findings from an exploratory review of the live mobile app. It is intended to guide focused design and implementation work rather than prescribe a complete redesign.


## Design context

The review uses the repository's [Product Vision](../PRODUCT_VISION.md) and [mobile wireframe documentation](../../mobile-audit/wireframes/README.md) as the design brief.

Beach League serves a mix of pickup players, competitive league players, and organizers. Its core jobs are recording games, tracking competitive progress, finding places and people to play with, and staying connected to the local beach-volleyball community. The existing visual direction combines a modern mobile interface with a vintage Malibu-inspired teal-and-gold identity.

## Review scope

The authenticated app was reviewed in light and dark modes. The walkthrough covered:

- Home and dashboard content
- Leagues, league details, games, and standings
- Add Games, pickup-game setup, and score entry
- Social, messages, and player discovery
- Profile, Settings, and appearance controls
- Court discovery and map/list presentation
- Navigation behavior and accessibility-tree exposure

No games, messages, friend requests, or other persistent user data were submitted. An unsaved game draft was discarded, and the theme was restored to System after verification.

## Executive summary

The app is coherent, usable, and more polished than a typical early product. The final score-entry interface is the strongest experience because it feels purpose-built for beach volleyball: scores are large, teams are visually separated, and the custom number pad is easy to operate.

The largest opportunity is systemic rather than screen-specific. Navigation, screen hierarchy, information density, and component semantics vary by feature. The visual language is consistent enough to feel like one product, but it relies heavily on familiar rounded cards, dashboard metrics, and charcoal/cyan dark-mode patterns. A focused normalization and brand pass would make the app feel more deliberate, more accessible, and more recognizably Beach League.

## Current status

All eight findings were rechecked against the current code on August 1, 2026, followed by a focused implementation pass. The affected mobile TypeScript project and 21 focused Jest suites pass. Authenticated simulator verification remains incomplete because the available simulator restored an existing unsaved game draft; that user state was left untouched. A development warning banner was reproducible on relaunch, so no finding is considered fully closed yet.

| Finding | Status | Since the original review |
| --- | --- | --- |
| BK-UIUX-001 Navigation | Partial | Pushed league details no longer render faux root tabs; court titles are deduplicated; Social, league, and court segments share one component; active root-tab retaps now scroll to top. Navigation-template documentation and remaining filter/chip variants still need consolidation. |
| BK-UIUX-002 Dashboard density | Partial | Active sessions now lead Home, promotional banners yield to that task, and Recent Games/Leagues use compact vertical lists. Home still contains several sections, and authenticated device verification is pending. |
| BK-UIUX-003 Player selection | Implemented; verification pending | The active slot is named explicitly, score-slot labels are team-specific, and relationship metadata is limited to the strongest signal. Focused accessibility tests pass. |
| BK-UIUX-004 Accessibility | Implemented; verification pending | Duplicate score-slot labels and the color-only Invite Players indicator are fixed in addition to the existing tab semantics. VoiceOver, Dynamic Type, and reduced-motion device checks remain. |
| BK-UIUX-005 Brand | Partial | Semantic surfaces now use warm sand and deep teal neutrals, Pickup has a volleyball icon, and theming docs match the tokens. Custom typography and the broader shadow cleanup remain. |
| BK-UIUX-006 Courts list/map | Partial | List is results-first, Map is the only full-map entry, and supported relevance signals are surfaced. Clustering and activity-based ranking still depend on richer data. |
| BK-UIUX-007 Profiles/placeholders | Implemented; verification pending | Standings now explain when data appears and Social's message empty state offers a player-discovery action. Authenticated device verification remains. |
| BK-UIUX-008 Dev warnings/test quirks | Partial | The notification assertion now waits for the async update, but the runtime warning banner was reproduced on simulator relaunch and still needs a root-cause fix. |

## Anti-pattern verdict

Verdict: mild fail.

If someone claimed parts of the app were AI-generated, the current interface would make that plausible. This is not because the app looks poor; it is because it uses several widely repeated interface patterns without enough product-specific expression:

- Rounded rectangles and generic shadows contain most content.
- Repeated horizontal card carousels create a dashboard-template rhythm.
- Similar spacing and hierarchy are used across unrelated content types.
- System typography gives every surface a similar voice.
- Dark mode leans toward the familiar charcoal-and-cyan application palette.
- Metric pills and repeated stat blocks resemble generic dashboard components.

The crown, gold accent, court photography, and split-team scoring interface are meaningful differentiators and should be developed further.

## What is working

### Clear primary navigation

The five-tab structure is easy to understand. The elevated Add Games control correctly signals that recording play is a primary product action.

### Purpose-built score entry

The completed player-selection state transitions into an effective scoring surface. Large scores, strong team separation, a custom number pad, and generous touch targets all support fast courtside use.

### Recognizable visual foundation

Teal and gold provide a stable brand base. Court imagery makes discovery content feel authentic, and the app generally applies its light and dark semantic colors consistently.

### Strong action visibility

Actions such as Add Game, Send Invites, Create League, and View Full Map are generally easy to find and large enough to operate comfortably.

## Priority findings

### BK-UIUX-001 — Standardize navigation and screen hierarchy

Priority: P1<br>
Area: Navigation, information architecture<br>
Status: Partial — implementation updated August 1, 2026

#### Progress since review

- League detail uses `League` in TopNav and no longer renders a faux root `BottomTabBar`.
- Court detail now uses `Court` in TopNav rather than repeating the court name above its body heading.
- Social, league details, and Courts now use the shared `SegmentControl` with tab semantics.
- Retapping any selected root tab requests that tab's primary content scroll to the top.
- A documented set of navigation templates and consolidation of remaining filter/chip variants are still outstanding.

#### Evidence

- League details render a custom bottom tab bar, while Courts, Settings, and Appearance remove it.
- League details display the league name in both the navigation bar and the body header.
- Social subnavigation, league tabs, segmented controls, and top-level tabs use different interaction and styling patterns.
- Retapping an already-selected tab did not consistently return its content to the top during review.

#### Why it matters

Users must relearn whether a screen is a destination, a detail, or a temporary task. Repeated titles consume vertical space, while inconsistent bottom-navigation behavior weakens spatial predictability.

#### Recommendation

- Keep the bottom tab bar on the five tab-root screens only.
- Hide bottom tabs on pushed details and use one standard back interaction.
- Define shared templates for tab roots, pushed details, full-screen tasks, and modal flows.
- Remove repeated titles when the navigation title already supplies the page heading.
- Use one shared tab/segment component for Social, league details, map/list selection, and similar controls.
- Support the platform convention where retapping the active root tab returns its primary scroll view to the top.

#### Acceptance criteria

- Every screen maps to a documented navigation template.
- Pushed details have consistent back behavior and bottom-navigation visibility.
- A page title is not repeated without a distinct informational purpose.
- All tab and segment controls share interaction, selected-state, and accessibility behavior.

### BK-UIUX-002 — Reduce dashboard density and repeated information

Priority: P1<br>
Area: Home, leagues, content hierarchy<br>
Status: Partial — implementation updated August 1, 2026

#### Progress since review

- League match rows are now grouped by session, with aggregate information in per-session footers rather than repeated on every match.
- Home includes a `QuickStatsRow` summary.
- An active session now appears first as `Continue Playing`; invite and profile banners do not compete with it.
- Recent Games and Leagues are compact vertical lists, leaving Courts as the only horizontal discovery carousel.
- Recent-game names have more space and may use two lines, but the overall number of Home sections still warrants authenticated device review.

#### Evidence

- Home stacks an invite banner, active session, recent games, leagues, a tournament placeholder, and courts into one dashboard.
- Several sections use horizontally scrolling cards, producing similar visual weight across content with different importance.
- League game cards repeat `Your Games`, `W-L`, and `Rating` aggregates on every individual match.
- Long league and player names are frequently truncated inside cards.

#### Why it matters

The next meaningful action competes with historical and promotional content. Repeated summary data increases scanning time without adding context to an individual match.

#### Recommendation

- Make Home prioritize the next actionable event: continue a session, record a game, respond to an invite, or find nearby play.
- Move secondary updates into a compact activity feed or fewer curated modules.
- Show season or player aggregates once in a summary header rather than inside every match card.
- Prefer flatter list rows when content is naturally sequential.
- Reserve horizontal carousels for content where sideways exploration adds value.

#### Acceptance criteria

- The primary Home action is identifiable within two seconds.
- Individual match rows contain match-specific information only.
- Repeated content is consolidated into a single summary location.
- Important names and scores remain readable at common text sizes.

### BK-UIUX-003 — Simplify player selection before score entry

Priority: P1<br>
Area: Add Games, score setup<br>
Status: Implemented; authenticated device verification pending — August 1, 2026

#### Progress since review

- Scoring controls remain hidden until four players are selected.
- Slot names now use a mostly consistent `First L.` format, and instructional overlays are gone.
- The pulsing `NEXT` badge is replaced by an explicit active-slot label such as `Choose Team 1 player 1`.
- Player rows show only the strongest available relationship signal instead of stacking up to four pills.
- Focused tests cover the active-slot text, all four unique accessibility labels, and relationship-pill prioritization.

#### Evidence

- The setup state combines four team slots, instructional overlays, a search field, relationship pills, player rows, Add buttons, and a disabled sticky action.
- The highlighted slot and floating `NEXT` label do not clearly explain which player position will be filled.
- Player rows can show multiple pills such as Shared League, Friend, and Recent Opponent simultaneously.
- Selected names truncate significantly once placed in team columns.
- The final number-pad scoring state is substantially clearer than the setup state.

#### Why it matters

Game entry is the central workflow and may be used outdoors, one-handed, and under time pressure. Ambiguous progression or dense metadata slows the task users should be able to complete fastest.

#### Recommendation

- Label the active slot explicitly, for example `Choose Team 1 player 1`.
- Advance focus automatically and visibly after each selection.
- Animate a selected player into the target slot to reinforce cause and effect.
- Prioritize recent teammates, opponents, and favorites without showing every relationship as a separate pill.
- Preserve full names where possible and use a consistent truncation rule when space is constrained.
- Reveal scoring controls only after four valid players are selected.

#### Acceptance criteria

- Users always know which team slot is active.
- Four players can be selected without interpreting a separate `NEXT` indicator.
- Relationship metadata does not dominate player identity.
- The transition from roster selection to scoring is clear and reversible.

### BK-UIUX-004 — Correct accessibility semantics and ambiguous labels

Priority: P1<br>
Area: Accessibility, controls<br>
Status: Implemented; VoiceOver and Dynamic Type verification pending — August 1, 2026

#### Progress since review

- Tab roles and selected states are now exposed, and status pills pair color with text.
- Score setup now exposes unique labels such as `Add Team 1 player 1` across all four slots.
- The color-only presence dot has been removed from Invite Players.
- Shared segment semantics and the score-setup accessibility behavior are covered by focused tests; full assistive-technology verification remains.

#### Evidence

- Social and league-detail tabs appeared as generic `other` elements rather than tabs or buttons in the iOS accessibility tree.
- Score setup exposed duplicate labels such as `Add player 1` and `Add player 2` for different team slots.
- Some internal identifiers were exposed through field names during the broader E2E audit.
- Several statuses rely on small colored pills or subdued dark-mode text.

#### Why it matters

VoiceOver users cannot reliably understand or navigate controls that lack roles, selected states, or unique names. Ambiguous labels also make automated testing less stable.

#### Recommendation

- Give every tab a tab role, selected state, position, and meaningful accessible label.
- Label each score slot uniquely, such as `Add Team 1 player 1`.
- Announce automatic slot advancement and score focus changes.
- Pair color with visible text or an icon for all statuses.
- Verify Dynamic Type, VoiceOver order, reduced motion, and contrast in both themes.

#### Acceptance criteria

- All interactive controls are represented as actionable elements in the accessibility tree.
- No two visible controls on the same screen share an ambiguous accessible name.
- Selected tabs and active score fields are programmatically exposed.
- Core flows remain usable at larger accessibility text sizes.

### BK-UIUX-005 — Make the brand more specific to beach volleyball

Priority: P2<br>
Area: Visual identity, typography, theming<br>
Status: Partial — implementation updated August 1, 2026

#### Current verification

- Light semantic surfaces now use warm sand-tinted neutrals, while dark surfaces use a deeper warm teal family.
- Pickup uses a volleyball icon instead of a globe, and selected Home cards rely more on borders than generic shadows.
- The mobile theming token table is synchronized with the shared token values.
- No custom fonts are loaded; `Font.loadAsync({})` remains empty, and generic shadows remain widespread elsewhere.

#### Evidence

- Light mode is clean but depends heavily on generic white cards and gray page backgrounds.
- Dark mode becomes a familiar charcoal-and-cyan dashboard and loses some of the warmer Malibu character.
- System typography gives headings, scores, and utility copy a similar voice.
- Pickup Game uses a globe symbol, which does not clearly communicate casual volleyball play.

#### Why it matters

The interface is usable but not yet distinctive enough to be recognized without the crown or wordmark. Stronger product-specific expression would improve memorability and emotional connection without reducing usability.

#### Recommendation

- Introduce warmer sand-tinted neutrals, especially in light-mode backgrounds and supporting surfaces.
- Use teal for interaction and gold for selective branded emphasis rather than distributing both evenly.
- Consider a distinctive condensed or athletic display face for the wordmark and major headings while retaining a highly readable body face.
- Develop a recurring motif from court lines, scoreboards, nets, geography, sun, or sand.
- Replace the Pickup Game globe with a volleyball or open-play symbol.
- Reduce generic shadows and use borders, spacing, imagery, or tonal surfaces to create hierarchy.

#### Acceptance criteria

- Key screens remain recognizable as Beach League when the wordmark is hidden.
- Dark mode retains the brand's warm gold and beach-oriented character.
- Typography clearly differentiates brand moments, page hierarchy, and utility copy.
- Icons consistently communicate volleyball-specific meaning.

### BK-UIUX-006 — Clarify court discovery's list and map modes

Priority: P2<br>
Area: Courts, geographic discovery<br>
Status: Partial — implementation updated August 1, 2026

#### Current verification

- List is now results-first and no longer opens with the 180px map preview.
- The Map segment is now the single route into full-map exploration; the duplicate `View Full Map` action is removed.
- Court rows surface supported signals such as Saved, Outdoor, Lighted, and Free play alongside distance/rating.
- Clustering and activity-based relevance remain outstanding and require supporting data.

#### Evidence

- List mode still devotes a large portion of the initial viewport to a map preview.
- The screen presents both a Map segment and a View Full Map action.
- The large map competes with nearby-court results, particularly in dark mode.
- The map communicates location but gives little indication of activity, available play, or community relevance.

#### Why it matters

Geographic discovery is a core product pillar. The current hybrid makes both modes less effective and does not yet communicate why one court is more relevant than another.

#### Recommendation

- Make List a true results-first mode with either no map or a compact optional preview.
- Make Map a true full-screen exploration mode instead of adding a second full-map action.
- Add clustering and activity-oriented signals as data becomes available.
- Emphasize useful ranking factors such as distance, recent activity, friends who play there, level fit, and upcoming sessions.

#### Acceptance criteria

- List and Map have distinct, predictable purposes.
- The map does not displace essential nearby results while List is selected.
- Only one control is required to enter full map exploration.
- Court relevance is explained with more than distance alone when supporting data exists.

### BK-UIUX-007 — Improve read-only profiles and placeholder states

Priority: P2<br>
Area: Profile, Home, empty states<br>
Status: Implemented; authenticated device verification pending — August 1, 2026

#### Progress since review

- Read-only profile attributes now render as rows rather than input-like controls.
- The Home Tournaments placeholder is removed.
- The Standings empty state explains that standings appear after the season's first submitted game.
- Social's Messages empty state includes a `Find someone to message` action that opens player discovery.

#### Evidence

- Read-only profile attributes are rendered inside large input-like containers.
- The Tournaments placeholder occupies a prominent Home section without offering a useful action.
- Some empty states, including standings and chat states found during the related E2E audit, provide little guidance.

#### Why it matters

Input styling implies editability. Prominent non-actionable placeholders interrupt task flow and make unfinished areas feel more important than useful content.

#### Recommendation

- Render profile information as compact read-only rows and switch to inputs only in an explicit Edit mode.
- Compress or hide unlaunched Home sections until they provide a meaningful action.
- Make empty states explain why the surface is empty and offer the next valid action when one exists.

#### Acceptance criteria

- Read-only information is visually distinct from editable fields.
- Home does not dedicate a major module to a feature users cannot use.
- Empty states teach the feature or direct users toward a relevant action.

### BK-UIUX-008 — Keep development warnings out of visual QA

Priority: P2<br>
Area: Development quality, QA<br>
Status: Partial — reproduced August 1, 2026

#### Progress since review

- No LogBox suppression or obvious static warning-producing pattern was found.
- The QueryClient GC-timer fix is in place.
- The NotificationsTab assertion now uses `waitFor`, and the focused suite passes.
- The `Open debugger to view warnings` banner was reproduced after relaunching the development build. Its source remains unresolved.

#### Evidence

- A React Native `Open debugger to view warnings` banner appeared during the walkthrough and covered part of the bottom navigation.

#### Why it matters

Development overlays can conceal layout, block interactions, invalidate screenshots, and obscure real accessibility behavior.

#### Recommendation

- Resolve warnings before design QA and screenshot capture.
- Treat recurring warning overlays as test failures in simulator review flows.

#### Acceptance criteria

- The reviewed development build opens and completes core flows without warning overlays.
- Visual regression artifacts are captured from an unobstructed interface.

## Suggested implementation order

| Phase | Work | Reason |
| --- | --- | --- |
| 1 | Navigation templates and shared tab semantics | Establishes the structural rules every later screen change should follow |
| 2 | Home and league-content distillation | Removes the largest sources of repeated hierarchy and density |
| 3 | Score-setup simplification and accessibility | Improves the highest-frequency core workflow |
| 4 | Courts list/map restructuring | Advances the product's geographic-discovery pillar |
| 5 | Typography, color, iconography, and brand expression | Applies visual refinement after screen structure is stable |
| 6 | Final accessibility, contrast, Dynamic Type, and visual QA | Verifies the normalized system across both themes and edge states |

## Product questions to resolve

1. Is Home primarily for recording the next match, finding the next game, or reviewing competitive progress?
2. What recurring visual element should identify Beach League even when the crown and wordmark are absent?
3. Which three pieces of information must a player understand within two seconds of opening the app?
4. Should nearby activity and people become more prominent than historical metrics as geographic features mature?
