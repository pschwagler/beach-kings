# Beach League mobile brand assets

Generated assets live in purpose-specific folders:

- `launcher/`: full-bleed iOS/general icon and transparent Android adaptive foreground.
- `splash/`: transparent, padded emblem for the native splash screen.
- `marks/`: transparent emblem variants for light and dark UI surfaces.
- `lockups/`: transparent horizontal wordmarks for light and dark UI surfaces.
- `tiles/`: square navy brand tiles for avatars, sharing, and promotional UI.
- `source/`: original supplied artwork plus the generated full-bleed edge source.

`app.json` currently consumes the 1024 px launcher icon, Android adaptive
foreground, splash mark, and generated 48 px web favicon directly from this
kit. The generator also refreshes the checked-in native iOS launcher and splash
asset-catalog images when the `ios` project is present.

Filename sizes are physical pixel dimensions. In React Native, choose the file
that is at least `display size × device pixel ratio`; for example, use a 128 px
mark for a 40 pt mark on a 3× device.

Use `mark-on-light` and `lockup-on-light` on light surfaces. Use `mark-on-dark`
and `lockup-on-dark` on navy or other dark surfaces. The Android adaptive
foreground expects the app's configured navy adaptive-icon background.

Regenerate the derivatives from `apps/mobile` with:

```sh
python scripts/generate-brand-assets.py
```

The script requires Pillow and NumPy. Do not edit generated size variants by
hand; update the source artwork or generation logic instead.
