# Chronicle themes

Paper & Lilac pairs warm paper with plum ink. Dusk & Lilac uses deep plum panels and lighter lilac accents. The reader has its own light, dark, night, and AMOLED palettes. Story covers and official character artwork provide the illustrations.

## Tokens and ownership

`app/sakuga.css` defines the shared visual styles after globals, marketing, catalogue, reading-room, and studio. `app/themes.css` supplies the dark token values, theme controls, and transition. The landing and Home CSS modules govern the layout of each page.

| Role | Token | Paper & Lilac | Dusk & Lilac |
| --- | --- | --- | --- |
| Canvas | --bg-root | #f7f5f0 | #19151f |
| Main page | --bg-base | #faf8f5 | #1d1824 |
| Card | --bg-card | #fffdf9 | #241e2e |
| Raised surface | --bg-raised | #f0ebf4 | #2c2439 |
| Ink | --text-primary | #302b3a | #f1eaf5 |
| Secondary copy | --text-secondary | #62596d | #c2b5ce |
| Muted copy | --text-muted | #756a7f | #aa9ab9 |
| Link and focus | --accent | #735299 | #c7abe8 |
| Primary action | --action | #c5b0ea | #bda0e1 |
| Success / warning / error | --green / --amber / --red | #397453 / #866021 / #b3475e | #a3d5b8 / #e5c08e / #f0a1b2 |

Barlow Condensed supplies headings, Manrope supplies interface copy, and Fira Code supplies compact labels and exact progress. `next/font` serves them locally. User-selected reader fonts remain independent.

## Composition

- The public landing page introduces the tracker through a collage of official artwork, feature details, and format links. Authenticated visitors see Home and Library actions.
- Home pairs a featured story spread and recent queue with weekly activity, unread releases, and a reading log. The featured story can rotate, pause, or shuffle. A failed save restores the exact previous progress.
- Library supports both cover grids and rows, format tabs, filters, bulk selection, entry editing, and detail dialogs.
- Shelves use real collection covers. Updates and activity retain readable rows. Analytics colors retain their semantic meaning.
- The desktop sidebar and mobile drawer contain horizontal overflow locally. Hover changes color and background without shifting links sideways. Focus outlines stay inside the navigation.
- All account tabs, discovery, trackers, upload previews, bookmarks, reader panels, error pages, and loading states share the new surfaces and controls.
- Public pages contain no invented libraries or fabricated usage counts. Character decorations do not represent stored library records.

## Motion by purpose

| Opportunity | Treatment |
| --- | --- |
| Theme changes | Three panels reveal the new palette in 540ms. Browsers without View Transitions use a short fade. |
| The featured story changes | The cover and copy settle together in 360ms. |
| A page or cover group first enters view | Anime.js: 8px settle, 360ms, up to 100ms stagger |
| A progress save succeeds | Drawn five-mark accent, 380ms, at most once per 1.2 seconds; checkmark stroke |
| A save fails | Persistent error and restored progress; no success accent |
| Progress amount changes | Bar width eases for 380ms |
| Primary action hover | 1px lift and soft shadow |
| Cover hover | 2px lift; removed on touch and reduced motion |
| Navigation and routine control clicks | Color, selection, and focus feedback; no global particle burst or squash |
| Menu/filter opens | 180ms reveal from its anchor |
| Dialog opens | 300ms centered settle; existing focus trapping and return focus |
| Reader panel/chapter opens | 240ms panel slide / 440ms chapter-heading entrance |
| Toast arrives | 240ms upward settle; error remains dismissible |
| Work is pending | Visible loading signal; static copy remains under reduced motion |

`SakugaEffects` enhances existing markup. Its canvas never captures input, caps DPR at 1.5 and particles at 64, stops when idle/hidden, and cleans up observers/animations on unmount. It follows success state, not button clicks. Native dialogs receive the canvas in their top layer only when needed.

Settings > Account stores the color theme and interface motion preference on the device. The selected theme is applied before the page paints and synchronizes across tabs. Reduced motion switches themes immediately. The operating system’s reduced motion setting takes priority, and saved, error, or loading states remain readable.

## Assets and contracts

- `components/Brand.tsx` and `design/brand/chronicle-master.svg` provide the shared mark. Run `npm run icons:export -- --web-only` for browser/PWA assets without touching the ignored native project.
- `public/artwork/SOURCES.md` records official character and still sources. Each illustration links back to its source. Artwork stays clear of controls and reading text.
- `Dialog` retains native modal semantics, keyboard containment, return focus, scroll locking, and unsaved-edit confirmation.
- Manual progress changes only on user action. Scrapers still update remote availability separately; decimal progress remains exact.

See `FRONTEND_INVENTORY.md` for every JSX control and `FRONTEND_REDESIGN.md` for browser coverage and limitations.
