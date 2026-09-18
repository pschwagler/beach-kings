# Keyboard and form layout

## Form sheets

Use `ui/BottomSheet` for bottom sheets. It owns modal accessibility, top safe-area
spacing, and iOS keyboard avoidance through keyboard-controller's
`KeyboardAvoidingView` with `automaticOffset`. Give long forms a bounded height
within that adjusted viewport, a fixed header, a `flex: 1` scrolling body, and a
nonshrinking action footer. `ReportSheet` is the current example.

- Use one keyboard-avoidance owner. Do not add automatic keyboard insets to a
  scroll view inside an already adjusted sheet.
- Wait for native iOS modal dismissal before presenting a replacement modal;
  overlapping dismissal/presentation can hide the new accessibility tree.
- Keep submit and keyboard dismissal reachable above the keyboard. Dismissal
  calls `Keyboard.dismiss()` and preserves the form state.
- Use `keyboardShouldPersistTaps="handled"` so a form action can receive its
  first tap while editing. Use interactive dismissal where appropriate on iOS.
- Apply bottom safe-area padding once, in the action footer; reduce it while
  the keyboard occupies the bottom of the screen.
- Reveal the focused editor when the viewport changes. Do not scroll the form
  on unrelated changes while another control has focus.

## Multiline editors

Keep the value controlled by the form, independent of keyboard visibility. Give
the editor an explicit minimum usable height and a bounded content-driven height;
allow native editor scrolling beyond that bound. Limit its height to the actual
remaining body viewport, including at accessibility text sizes. Set `textAlignVertical="top"`
and `submitBehavior="newline"`. Do not use the shared single-line `Input` height
for a multiline field. Support font scaling and use the semantic palette.

`numberOfLines` or a minimum-height class alone does not establish the layout
contract for a multiline editor inside a shrinking modal. Inspect the rendered
field with actual text, including a long draft and a cursor near the end.

## Other surfaces reviewed (2026-09-18)

| Surface | Structure and next check |
| --- | --- |
| Report sheet | Shared sheet, bounded editor, scrolling body, fixed actions. Verify keyboard transitions and large text on native iOS. |
| Shared page modal | Explicit bounded flex chain and modal focus handling. Child forms still need their own keyboard strategy. |
| Feedback screen | Has keyboard avoidance and a bounded content-driven multiline editor. Preserve that structure. |
| Chat composer | Uses `KeyboardStickyView` and list insets. Preserve the chat-specific arrangement. |
| Account status appeal | Plain scroll view, no explicit keyboard avoidance, minimum-height-only editor. Next: add one keyboard-aware scroll owner and bound the editor; verify appeal submission with a long draft. |
| Court review modal | Shared page modal, plain scroll view, minimum-height editor. Next: make the form keyboard-aware and check review text, tags, and submit while editing. |
| Season form | Bespoke modal and inner React Native keyboard avoider. Next: verify lower fields and footer on a small phone, then consolidate with the shared sheet. |

These follow-ups are source-review findings, not claims of reproduced native
failures. Validate each before expanding the implementation.

## Native acceptance

Check small and large iPhones, default and accessibility text sizes, and VoiceOver.
Open the keyboard, enter several lines, move the cursor, scroll a long draft,
dismiss and reopen the keyboard, and submit. Confirm the visible text, selection,
footer, safe areas, focus order, and retained draft after an error. Also check a
hardware keyboard, where input focus does not imply a visible software keyboard.
Component tests cover state and submission behavior; they cannot certify native
keyboard geometry or VoiceOver announcements.

## References

- [React Native ScrollView](https://reactnative.dev/docs/scrollview)
- [React Native TextInput](https://reactnative.dev/docs/textinput)
- [Keyboard controller KeyboardAvoidingView](https://kirillzyusko.github.io/react-native-keyboard-controller/docs/api/components/keyboard-avoiding-view)
