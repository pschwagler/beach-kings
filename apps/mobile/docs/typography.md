# Mobile Typography

Beach League uses two related embedded families:

- **Barlow** Regular, Medium, Semibold, and Bold for body copy, labels, and
  controls.
- **Barlow Condensed** Semibold and Bold for headings, the wordmark, and large
  scores.

The Expo font plugin embeds these faces during the native build. Do not add a
runtime `Font.loadAsync` or `useFonts` gate: the app should render its provider
tree immediately and hide the splash when navigation mounts. The font files
come from the official `@expo-google-fonts` packages; their SIL Open Font
License is checked in at `assets/fonts/OFL-Barlow.txt`.

## Usage

Use `AppText` for shipped mobile copy. It preserves React Native `Text` props
and native font scaling:

```tsx
<AppText variant="body">Next match at 6:30</AppText>
<AppText family="display" variant="title1" weight="bold">
  League Night
</AppText>
```

Use the condensed family only for short display text. Do not use it for body
copy, form labels, instructions, or long names. Do not set
`allowFontScaling={false}` or constrain `maxFontSizeMultiplier`; layouts must
adapt to the user's Dynamic Type setting.

NativeWind provides matching `font-sans` and `font-display` utilities. Use
those only when integrating with an API that cannot render `AppText`.
