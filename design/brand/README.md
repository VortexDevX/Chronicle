# Chronicle mark

The angular C uses layered page edges and an index-tab cut. Cobalt carries the main silhouette; pale ink marks the inner page. The master has genuine transparency and is intended for the dark catalogue surface, `#0D141A`.

## Assets

- `chronicle-master.png`: original high-resolution source.
- `public/brand/chronicle-mark.png`: transparent mark for interface branding.
- `public/icon.png`, `public/favicon.png`, `public/favicon.ico`, and `public/apple-touch-icon.png`: web and installed-web-app icons.
- `public/icon-maskable.png`: a separate, padded maskable icon.
- Android launcher assets: five density sets, adaptive foregrounds and Android 13 monochrome foregrounds. The intentionally ignored native project remains local.

Run `npm run icons:export` to reproduce exports from the master. The script updates native resources when the local Android project exists. Adaptive and maskable artwork stays within its safe zone; ordinary icons use a larger silhouette. Do not stretch the mark or add another icon tile around the transparent interface asset.

## Generation record

Mode: built-in image generation, transparent background. Final prompt:

> Use case: logo-brand. Create ONE final standalone symbol for Chronicle, a private anime, manhwa and novel progress catalogue. Asset: production logo symbol that will also become Android launcher and web favicon. Design a bold original angular C monogram formed from two interlocking squared page-edge ribbons, with one deliberate index-tab notch in the upper-right opening. Read as a single compact silhouette first; a subtle page/book reference second. Flat vector-style geometry, strong negative space, broad strokes, chamfered outer corners and precise right angles; memorable at 24 pixels. Main ribbon vivid cobalt #3159E8, a single small inner page-edge accent pale ice #E4ECEF. No letter text, no wordmark, no other symbols, no arrows, no mockup, no icon container or background tile, no gradients, glow, shadow, texture or hairline detail. Center the isolated mark on a truly transparent square canvas, mark occupies roughly 75 percent of width and height with generous clean transparent margins. Dark blue-black #0D141A is the intended application surface but keep background fully transparent. Deliver only the finished logo mark, not a presentation board or variations.
