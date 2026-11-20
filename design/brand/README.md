# Chronicle mark

The web mark is an ink C and a paper bookmark on a lilac tile. The bold letter and bookmark stay readable at favicon sizes. `chronicle-master.svg` is the source of truth and matches `components/Brand.tsx`. The older `chronicle-master.png` is retained as historical artwork.

## Web exports

Run `npm run icons:export -- --web-only` to regenerate the transparent interface mark, ordinary PWA icon, padded maskable icon, SVG/PNG/ICO favicons, and Apple touch icon. The exporter uses paper (#f7f5f0) for installation icons and keeps the mark within the maskable icon’s safe zone.

The plain `npm run icons:export` command can also update native resources if the intentionally ignored Android project exists. This web redesign uses `--web-only`; native launcher assets and release APKs are not part of this change.

Anime character artwork is separate from the Chronicle brand. Its sources and rights notice are recorded in `public/artwork/SOURCES.md`.
