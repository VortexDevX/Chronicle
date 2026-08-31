# Chronicle UI/UX Redesign & Product Polish Directive

## Document Purpose

This document is the implementation directive for improving the **Chronicle** web application UI/UX.

Repository:

`https://github.com/VortexDevX/Chronicle`

The objective is **not** to redesign Chronicle from scratch or replace its visual identity. The objective is to make the existing application:

- easier to understand
- faster to operate
- more consistent
- more useful at a glance
- more polished on desktop and mobile
- more "product-like"
- more efficient for frequent users
- better at exposing Chronicle's strongest existing features

The current application already has a strong foundation:

- Home dashboard
- Library with grid/list modes
- Updates
- Release Radar
- Shelves
- Droppedyard
- Analytics
- Cron history
- Command palette
- Add/Edit media modal
- Telegram notifications
- Android push notifications
- Anime/Donghua release schedules through SIMKL
- Manhwa tracker scraping
- Media progress tracking
- Responsive layout
- PWA support

**Do not destroy working architecture merely for visual changes.**

---

# 1. Product Direction

Chronicle should feel like a **personal media command center**, not a CRUD database with anime posters.

The interface should answer these questions quickly:

1. What am I currently watching/reading?
2. What can I watch/read next?
3. What was newly released?
4. What is releasing soon?
5. What should I update in my library?
6. Where should I go to manage my collection?

The design principle is:

> **Reduce decisions, expose useful information, make common actions one click.**

Do not add visual clutter merely because the application can technically display more information.

---

# 2. Existing Architecture Constraints

The redesign must preserve the current application architecture.

## Technology

Current stack includes:

- Next.js
- React
- TypeScript
- MongoDB
- Mongoose
- Zustand
- Cheerio
- Vitest
- Playwright
- Lucide icons

Do not replace these technologies for UI work.

## Existing media types

Chronicle supports:

- Anime
- Manhwa
- Donghua
- Light Novel

Do not introduce unnecessary new media categories.

## Progress behavior

`progress_current` is user-controlled.

Remote data must never automatically advance the user's manually recorded progress.

The UI may display:

- current progress
- latest available progress
- unread difference
- next release

but manual progress must remain authoritative.

---

# 3. Navigation Redesign

## Current navigation

Current navigation contains:

- Home
- Library
- Updates
- Queue
- Droppedyard
- Shelves
- Analytics
- Cron history

The current `/queue` page has evolved into **Release Radar**, so "Queue" is now misleading.

## Required change

Rename:

`Queue` → `Release Radar`

Use a calendar/clock/spark icon rather than a generic list icon.

## Recommended hierarchy

Organize navigation conceptually as:

```text
MAIN
  Home
  Library
  Updates
  Release Radar

LIBRARY
  Shelves
  Droppedyard

INSIGHTS
  Analytics

SYSTEM
  Cron history
```

Visible section labels are optional.

The important requirement is to establish a clear information hierarchy.

## Why

"Queue" implies manually queued media.

Release Radar is actually a dynamic schedule of upcoming Anime and Donghua episodes.

That feature deserves to be presented as a first-class Chronicle feature.

---

# 4. Desktop Sidebar

## Current behavior

The sidebar is fixed at approximately 240px wide.

## Required improvement

Add a collapsible desktop sidebar.

Expanded:

```text
[icon] Chronicle

[+] Add entry

Home
Library
Updates
Release Radar

Shelves
Droppedyard

Analytics

Cron history

Settings
Logout
```

Collapsed:

```text
[icon]
[+]

[home]
[library]
[updates]
[radar]

[shelves]
[graveyard]

[analytics]

[history]

[settings]
[logout]
```

## Requirements

- Store collapsed/expanded preference in localStorage.
- Preserve accessible labels through `title` and/or `aria-label`.
- Keep the active route obvious.
- Do not cause content jumping when toggled.
- Animate width/transform smoothly.
- Preserve mobile navigation behavior.

The implementation should mirror the existing pattern used for persisted Library view mode.

---

# 5. Mobile Navigation

The mobile experience should not rely entirely on repeatedly opening a hamburger menu.

Add a mobile bottom navigation bar.

Recommended:

```text
┌─────────────────────────────────────────┐
│ Home │ Library │  +  │ Updates │ Radar │
└─────────────────────────────────────────┘
```

The "+" button should open the Add Entry modal.

Secondary areas such as:

- Shelves
- Droppedyard
- Analytics
- Settings
- Cron history

can live behind a More/secondary menu.

## Requirements

- Safe-area aware on mobile.
- Fixed to bottom.
- Does not cover scrollable content.
- Uses compact icons + labels.
- Active state must be obvious.
- Preserve keyboard navigation and screen reader labels.

---

# 6. Top Bar

The current TopBar already supports:

- route context
- global search
- Add action
- command palette trigger

Preserve that foundation.

## Required improvements

### Search

Keep the "Search your library" affordance.

Improve it so:

- `/` focuses search/command palette.
- `Cmd/Ctrl + K` opens the command palette.
- Search can quickly find media.
- Search result actions are available without navigating through multiple screens.

### Add

The Add button must remain prominent.

On desktop:

```text
[ + Add ]
```

On smaller layouts the label may collapse to an icon.

---

# 7. Command Palette

The command palette is already present.

Expand it into a true Chronicle command center.

Recommended commands:

```text
Search "One Piece"
Add entry
Log next episode
Open Home
Open Library
Open Updates
Open Release Radar
Create shelf
Open Analytics
Open Droppedyard
Open Settings
```

For a selected title:

```text
One Piece

Log Episode 1176
Open details
Open watch link
Edit entry
Move to shelf
Drop entry
```

## Keyboard shortcuts

Recommended shortcuts:

```text
Cmd/Ctrl + K → Command palette
/            → Search
A            → Add entry
G H          → Home
G L          → Library
G U          → Updates
G R          → Release Radar
Esc          → Close modal/palette
```

Do not implement shortcuts that conflict with text input.

---

# 8. Home Redesign

The current Home page already contains:

- featured media
- continue rail
- new releases
- recent activity

The existing structure should be preserved but made more actionable.

## Home should prioritize

1. Continue watching/reading
2. Next upcoming release
3. Unread releases
4. Continue journey
5. Recent activity

## Hero redesign

Current hero information should evolve toward:

```text
CONTINUE WATCHING

One Piece

Episode 1175 / ?

████████████████░░  92%

Next episode
Episode 1176
Tomorrow · 7:30 PM
In 18h 42m

[ Log Episode 1176 ] [ Details ]
```

For Manhwa:

```text
CONTINUE READING

The Beginning After the End

Chapter 217 / ?

██████████████░░

New chapters: +2

[ Log Chapter 218 ] [ Details ]
```

## Important

The Home page must consume existing release data where available.

Do not invent release times.

For Anime/Donghua, use existing:

- `next_episode`
- `next_episode_release_at`
- `previous_episode`
- `previous_episode_release_at`

when available.

---

# 9. Home "Today" Section

Add a high-value "Today" summary.

Example:

```text
TODAY

2 releases
1 unread title
3 recent updates

NEXT
One Piece · Episode 1176 · 7:30 PM

CATCH UP
Tales of Herding Gods · Ep 98 → 99

CONTINUE
Solo Leveling · Episode 12
```

This section should answer:

> "What should I do with Chronicle today?"

It should use already available application data rather than introduce a redundant backend system.

---

# 10. Home Next Releases

Add a compact "Next Up" rail.

Example:

```text
NEXT UP

One Piece              Ep 1176     18h
Tales of Herding Gods  Ep 99       2d
Solo Leveling           Ep 25       4d
```

Features:

- actual release time
- countdown
- media type
- cover
- click to open details

Keep it compact.

---

# 11. Updates Page Redesign

Current Updates functionality should remain intact.

The page should become more like an inbox.

Instead of excessive explanatory copy, prioritize:

```text
Updates

3 new episodes
2 anime · 1 donghua

[ Mark all caught up ]
```

## Update row

Recommended structure:

```text
[cover]

ONE PIECE
Episode 1176 available

You: 1175
New: +1

[ Log Episode ] [ Edit ] [ Open ]
```

For Manhwa:

```text
CHAPTER 184
You: 182
New: +2
```

## Keep

- Telegram state
- last checked timestamp
- tracker errors
- partial failure notices
- unread delta

## Reduce

Developer-oriented explanatory text.

For example, long explanations about notification implementation should not dominate the screen.

Put advanced details behind:

- tooltips
- secondary metadata
- expandable details

---

# 12. "Catch Up" Action

This should be implemented as a major productivity feature.

If:

```text
Current: 42
Latest: 47
```

show:

```text
[ Catch up to 47 ]
```

Clicking opens:

```text
Update progress?

Chapter 42 → 47

[ Cancel ] [ Catch up ]
```

For episodes:

```text
Episode 1175 → 1178
```

## Requirements

- Preserve manual progress authority.
- Never advance automatically without user action.
- Create normal activity entries using existing mechanisms.
- Trigger existing notification/update behavior correctly.
- Support fractional progress where the existing system supports it.

---

# 13. Smart Progress Actions

Do not use generic "Log next" wording everywhere.

Determine the actual next value.

Example:

```text
Current: 1175
Latest: 1176

[ Log Episode 1176 ]
```

When there is no known newer release:

```text
[ Up to date ]
```

When an Anime/Donghua has a future schedule:

```text
Next: Episode 1177
Tomorrow · 7:30 PM
```

When the media is completed:

```text
✓ Completed
```

This makes the interface context-aware instead of generic.

---

# 14. Media Card Redesign

The current MediaCard is already a reusable component and should remain the central card component.

Do not duplicate card implementations unless necessary.

## Information hierarchy

Every card should communicate quickly:

1. Title
2. Media type/status
3. Current progress
4. Completion percentage
5. New/unread state
6. Upcoming release when applicable
7. Primary action

Recommended Anime/Donghua card:

```text
┌─────────────────────────────┐
│                             │
│          COVER              │
│                             │
│  +1 NEW                     │
└─────────────────────────────┘

One Piece                  ★ 9.2
Anime · Active

1175 / 1200 episodes
████████████████░░ 98%

◷ Tomorrow · 7:30 PM
```

Manhwa:

```text
184 / ? chapters
████████████░░

+2 new chapters
```

Completed:

```text
✓ Completed
120 / 120 episodes
```

Dropped:

```text
✕ Dropped
Maybe revisit
```

---

# 15. Release Information on Media Cards

Anime/Donghua already have release schedule data.

Expose it directly on cards.

Examples:

```text
◷ In 18h
```

or:

```text
◷ Tomorrow · 7:30 PM
```

or:

```text
◷ Available now
```

Do not show release schedule UI for media that has no valid schedule.

Do not fabricate a schedule.

---

# 16. Media Card Actions

Primary actions should be obvious.

Recommended:

- Log next
- Edit
- Open watch/source link
- Delete

Use hover actions on desktop.

On mobile:

- maintain touch-friendly controls
- avoid requiring hover
- avoid tiny icon-only actions without labels/tooltips where ambiguity exists

The current implementation already has poster actions and edit/delete actions. Improve their hierarchy rather than replacing everything.

---

# 17. Add/Edit Entry Modal

The current MediaModal contains a large amount of functionality.

This is useful but cognitively heavy.

## Redesign as progressive sections

```text
Add Entry

BASICS
Title
Type
Status

PROGRESS
Current
Total
Rating

CONNECTIONS
Watch URL
MangaDex
Linked entries

ORGANIZATION
Shelves
Notes
Custom Cover

[ Cancel ] [ Add Entry ]
```

Use collapsible/secondary sections if needed.

Do not expose internal implementation concepts such as:

- `simkl_id`
- source adapter details
- internal IDs

unless debugging is explicitly being performed.

---

# 18. Anime/Donghua-Specific Entry UX

Anime and Donghua no longer require manual release-source setup.

The current architecture resolves release information through SIMKL and can use AniList IDs for automatic matching.

Therefore the user should see something like:

```text
Release tracking

✓ Automatic episode tracking enabled
```

or:

```text
Release tracking

✓ Synced automatically
```

Avoid exposing:

```text
simkl_id = ...
```

The implementation detail is irrelevant to normal users.

---

# 19. Watch URL vs Tracker URL

Maintain the distinction clearly.

For Anime/Donghua:

```text
Watch URL
```

This is an external viewing link and should never be implied to be the schedule data source.

For Manhwa:

```text
Tracker URL
```

because it may be used for chapter scraping.

The UI should use context-sensitive labeling exactly as the application already does.

---

# 20. Release Radar

Release Radar is one of Chronicle's strongest features.

It should feel like a dedicated product feature, not a repurposed queue.

## Header

Recommended:

```text
Release Radar

Your next episodes.

12 scheduled
3 today
```

## Next-up hero

```text
NEXT UP

One Piece
Episode 1176

Today · 7:30 PM

18h 42m
```

The countdown must always be calculated from the stored release timestamp.

Never persist countdown strings.

---

# 21. Release Radar Timeline

Add an optional visual timeline.

Concept:

```text
NOW ─────── ● ───────── ● ───────────── ●
           7PM          11PM           Tue
         One Piece      Donghua       Anime
```

Keep it subtle.

Do not turn the UI into a neon dashboard.

The purpose is temporal orientation, not decoration.

---

# 22. Release Radar Grouping

Keep release grouping by day.

Recommended structure:

```text
TODAY
────────────────────────────

7:30 PM   One Piece
           Episode 1176

9:00 PM   Tales of Herding Gods
           Episode 99


TOMORROW
────────────────────────────

...
```

The current date grouping behavior should be preserved.

---

# 23. Release Radar Controls

Current filters include:

- search
- all
- today
- 3 days

Keep these.

Improve labels and affordances.

Recommended:

```text
[ Find a series... ]

[ All ] [ Today ] [ 3 days ]
```

Potential future filters:

- Anime
- Donghua
- This week

Do not add filters without enough data to justify them.

---

# 24. Release Radar Matching UX

The current manual matching fallback is a good feature.

Keep:

```text
Needs a quick match
Pick the right show once.
```

Improve the interaction to make the process feel effortless.

Recommended modal:

```text
Match release calendar

Tales of Herding Gods

Search:
[ Tales of Herding Gods           ]

Results:

Tales of Herding Gods
SIMKL ...

Tales of the Herding Gods
SIMKL ...

[ Select ]
```

After selection:

```text
✓ Match saved
Future releases will use this match.
```

Keep the "Change a saved title match" functionality.

---

# 25. Empty States

Every empty state should explain:

1. what is empty
2. why
3. what the user can do next

Bad:

```text
No data.
```

Good:

```text
Your chronicle is empty.

Add your first title to start tracking
progress, releases, and activity.

[ Add Entry ]
```

For Release Radar:

```text
No upcoming episodes here.

Your active Anime and Donghua will appear
automatically when SIMKL has an announced release.

[ Open Library ]
```

Do not suggest actions the user cannot actually perform.

---

# 26. Droppedyard

Keep the unique "Droppedyard" identity.

Clarify the purpose immediately:

```text
Droppedyard

Titles you've stopped watching or reading.
```

Use tabs/filters:

```text
All
Maybe Revisit
Dropped Permanently
```

Show useful context:

```text
Solo Leveling
Dropped

Reason:
Lost interest

[ Maybe Revisit ]
[ Delete ]
```

Use the existing `drop_reason` and `retry_flag` fields where appropriate.

Do not introduce duplicate state systems.

---

# 27. Shelves

Shelves should feel like curated collections rather than another database page.

Improve presentation with:

- shelf cover collage
- entry count
- media type breakdown
- recently updated title
- quick open

Example:

```text
MURIM

24 titles
18 Manhwa · 6 Donghua

[ Open Shelf ]
```

Use existing linked media data.

Avoid adding unnecessary analytics to every shelf.

---

# 28. Analytics

Analytics should prioritize useful personal insights.

Recommended top metrics:

```text
Episodes completed
Chapters completed
Titles completed
Active titles
Current streak
```

Then:

```text
This week
This month
All time
```

Show trends clearly.

Avoid chart spam.

The page should answer:

> "How have I actually been using Chronicle?"

rather than:

> "How many graphs can we render?"

---

# 29. Settings Redesign

Current Settings mixes:

- account
- notifications
- Android delivery testing
- PWA install
- backup/import
- logout

Separate these visually.

Recommended:

```text
Settings

ACCOUNT
Recovery email

NOTIFICATIONS
Telegram
Android push

APP
Install Chronicle
Appearance

DATA
Export
Import

ACCOUNT
Log out
```

## Push testing

Hide advanced test functionality behind a secondary/advanced section.

For example:

```text
Android push
[ Enabled ]

Advanced
  Send test notification
```

Normal users do not need to see Firebase diagnostics constantly.

---

# 30. Appearance Settings

The current UI is dark-first.

Add a proper appearance selector if appropriate:

```text
Appearance

System
Dark
Light
```

Keep Chronicle's identity intact across themes.

Do not simply invert colors.

Ensure:

- contrast
- borders
- status states
- buttons
- modal backgrounds
- inputs
- disabled states

remain readable.

---

# 31. Visual Design System

Current design uses:

- very dark surfaces
- soft red accent
- status colors
- sharp edges
- Segoe typography

Keep the overall identity.

## Geometry

Current radius values are extremely sharp.

Move gradually toward:

```css
--radius-sm: 6px;
--radius-md: 10px;
--radius-lg: 14px;
```

Pills remain fully rounded.

Do not make everything excessively rounded.

The target aesthetic is:

> modern, dark, editorial, slightly sharp

not:

> generic SaaS with giant bubble cards

---

# 32. Surface Hierarchy

Establish distinct roles:

```text
root surface
page surface
card surface
raised/hover surface
modal surface
```

Avoid having multiple shades that are visually indistinguishable.

Borders should separate structure without making every component outlined.

---

# 33. Typography

Keep the existing display/body font strategy.

Improve hierarchy through:

- stronger page titles
- smaller eyebrow labels
- clearer metadata
- more restrained secondary text
- larger numeric emphasis for progress/release times

Example:

```text
Eyebrow
Your next episode

Title
One Piece

Primary number
1176

Secondary
Episode · Tomorrow 7:30 PM
```

Do not overuse uppercase text.

---

# 34. Color Usage

Keep red as the primary Chronicle accent.

Use semantic colors intentionally:

- green = success/healthy
- amber = attention
- red = destructive/error
- cyan = informational
- violet = special/secondary state

Do not assign random colors to arbitrary UI pieces.

Status colors should remain consistent throughout the app.

---

# 35. Motion and Animation

Add motion primarily to communicate state.

Good places:

- modal opening/closing
- sidebar expansion
- card hover
- progress changes
- toast appearance
- release countdown refresh
- navigation transitions
- loading states
- filter changes

Avoid:

- constant floating animations
- random particle effects
- excessive glowing borders
- perpetual motion
- decorative animations unrelated to interaction

Motion should make the interface feel alive, not distract the user.

---

# 36. Loading States

The application already contains skeleton and loading states.

Improve them for consistency.

Every page should have:

- initial loading state
- inline refresh state
- partial failure state
- retry action
- empty state

Do not replace visible content with a full-page spinner when only one panel is refreshing.

Use stale content while refreshing when practical.

---

# 37. Error States

Errors should be actionable.

Bad:

```text
Request failed.
```

Better:

```text
Release calendar could not refresh.

Your existing data is still available.

[ Try again ]
```

For tracker errors:

```text
Tracker attention

One Piece could not be checked.

Last known release: Episode 1175

[ Retry ] [ Edit ]
```

Never silently replace valid existing data with empty state on transient failure.

---

# 38. Accessibility

The redesign must improve or preserve accessibility.

Requirements:

- all icon-only buttons have accessible labels
- focus states are visible
- modals trap focus correctly
- Escape closes modals when safe
- interactive rows are keyboard accessible
- buttons are not simulated with plain `<div>`
- sufficient text contrast
- form labels remain associated
- status changes should not require color alone
- touch targets should be large enough on mobile

Do not remove useful `aria-label` attributes already present.

---

# 39. Responsive Design

Desktop:

- wide cards
- expanded sidebar
- multi-column layouts
- visible metadata

Tablet:

- compact sidebar
- fewer columns
- preserved filters

Mobile:

- bottom navigation
- one-column content
- horizontally scrollable rails
- larger touch targets
- stacked card actions
- full-width modal controls

Do not simply shrink the desktop UI.

Design mobile interactions separately.

---

# 40. Mobile Media Cards

Mobile card interaction should not depend on hover.

Actions should remain easy to discover.

Recommended:

```text
[poster]

One Piece
Anime · Active

1175 / 1200
████████████████

◷ Tomorrow · 7:30 PM

[ Log ]
```

Secondary actions may be inside a three-dot menu.

Avoid four tiny icons fighting for space.

---

# 41. Microcopy

Use concise, useful language.

Prefer:

```text
Next episode
Available now
In 18h
Caught up
Needs attention
```

Avoid:

```text
The system has successfully determined that...
```

The interface should sound human without becoming childish.

---

# 42. Coolness Without Clutter

Chronicle should feel "cool" through:

- strong layout
- intentional typography
- good transitions
- useful data
- elegant hover states
- strong artwork
- contextual actions
- subtle gradients
- clean empty states
- clear hierarchy

Do NOT make it "cool" through:

- excessive glassmorphism
- giant glowing blobs
- random particles
- unnecessary 3D
- animated backgrounds
- giant neon borders
- excessive rounded cards

The product should look confident, not desperate for attention.

---

# 43. Data-Aware UI Rules

## Anime/Donghua

Use:

- current progress
- latest remote progress
- next episode
- release timestamp
- release countdown
- watch URL
- media type

## Manhwa

Use:

- current progress
- latest remote progress
- tracker status
- tracker URL
- unread chapters

## Light Novel

Use:

- current progress
- total progress
- rating
- notes
- shelves

Do not show Anime-specific schedule UI for Light Novels.

---

# 44. Source/Implementation Details Must Stay Invisible

The user should not need to know:

- SIMKL ID
- AniList ID
- scraper internals
- Cron implementation
- host cooldown
- retry counts
- AbortSignal
- internal source adapters

These should remain implementation details.

Exception:

Cron history and tracker health are legitimate system-level features and may expose high-level operational status.

---

# 45. Information Priority

For normal users, prioritize information in this order:

```text
What should I do?
        ↓
What changed?
        ↓
What's next?
        ↓
What am I tracking?
        ↓
Why did something fail?
        ↓
Technical details
```

Never reverse this hierarchy.

---

# 46. Recommended "Today" Experience

A future high-value Home mode can combine:

```text
TODAY

NEXT RELEASE
One Piece
Episode 1176
7:30 PM · In 18h

NEW
Tales of Herding Gods
Episode 99
+1 available

CONTINUE
Solo Leveling
Episode 12 / 25

CATCH UP
The Beginning After the End
Chapter 182 → 184

RECENT
3 updates today
```

This can become Chronicle's strongest default dashboard.

---

# 47. Recommended Implementation Phases

## Phase 1: Navigation + Core UX

Implement:

- Queue → Release Radar rename
- Sidebar grouping
- Sidebar collapse
- improved TopBar
- smart progress labels
- card metadata hierarchy
- release information on cards

Acceptance:

- no broken routes
- no visual regressions
- no loss of functionality

---

## Phase 2: Progress Productivity

Implement:

- Catch up
- smart Log Episode/Chapter X
- up-to-date state
- improved Updates inbox
- Mark all caught up where appropriate

Acceptance:

- manual progress remains authoritative
- activity logging remains correct
- notifications remain correct

---

## Phase 3: Home Redesign

Implement:

- improved hero
- Next Up
- Today summary
- stronger Continue section
- release-aware Home
- better empty states

Acceptance:

- Home answers the user's next action within seconds
- no unnecessary scrolling required for core information

---

## Phase 4: Release Radar Polish

Implement:

- stronger hero
- timeline
- cleaner filters
- improved matching UI
- clearer release cards
- better mobile experience

Acceptance:

- release times are accurate
- countdown derives from actual timestamp
- manual matches persist correctly

---

## Phase 5: Add/Edit Flow

Implement:

- progressive sections
- better contextual fields
- reduced technical noise
- clearer Watch URL / Tracker URL distinction
- improved save feedback

Acceptance:

- new user can add an Anime without understanding SIMKL
- new user can add a Manhwa tracker correctly
- editing existing entries remains backward compatible

---

## Phase 6: Mobile + Accessibility

Implement:

- bottom navigation
- touch-friendly controls
- mobile card actions
- modal improvements
- keyboard navigation
- accessibility audit

Acceptance:

- no horizontal overflow
- controls are usable on touch
- focus order makes sense
- screen-reader labels exist for icon-only actions

---

## Phase 7: Visual Polish

Implement:

- refined radius system
- stronger surface hierarchy
- motion system
- improved transitions
- typography tuning
- refined empty/loading/error states
- appearance settings where justified

Acceptance:

- visual consistency across all dashboard routes
- no random one-off styling
- motion is subtle and purposeful

---

# 48. Files Likely to Be Relevant

Inspect before modifying.

Primary UI:

```text
app/(dashboard)/home/page.tsx
app/(dashboard)/library/page.tsx
app/(dashboard)/updates/page.tsx
app/(dashboard)/queue/page.tsx
app/(dashboard)/droppedyard/page.tsx
app/(dashboard)/shelves/page.tsx
app/(dashboard)/analytics/page.tsx
app/(dashboard)/cron-history/page.tsx

components/MediaCard.tsx
components/MediaModal.tsx
components/Sidebar.tsx
components/TopBar.tsx
components/CommandPalette.tsx
components/SettingsModal.tsx
components/MediaArtwork.tsx

app/globals.css

types/media.ts

lib/models/MediaItem.ts

lib/sources/simklCalendar.ts

lib/services/media/updateFeedQuery.ts
```

Do not assume all of these need modifications.

---

# 49. Implementation Rules for Coding Agents

Before editing:

1. Read the current code.
2. Identify existing reusable components.
3. Identify existing state management.
4. Identify data already available from APIs.
5. Identify current responsive behavior.
6. Identify existing CSS patterns.
7. Identify current accessibility behavior.
8. Identify existing tests.

Then make the smallest coherent changes required.

Do not duplicate:

- media cards
- modal systems
- notification systems
- source logic
- release schedule logic
- progress handling
- API fetching utilities

---

# 50. Backend Changes During UI Work

Backend changes are acceptable only when required to expose already-available information.

Examples:

- exposing next release information in Home payload
- exposing catch-up metadata
- exposing richer release state

Do not redesign backend architecture merely to make UI work easier.

Reuse existing data where possible.

---

# 51. Testing Requirements

After UI changes:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

For relevant UI changes:

```bash
npm run test:e2e
```

Verify:

- desktop
- mobile
- signed-out behavior where relevant
- authenticated behavior
- empty states
- loading states
- errors
- keyboard navigation
- modals
- progress updates
- release information

---

# 52. Regression Requirements

Do not break:

- Anime progress tracking
- Donghua progress tracking
- Manhwa scraping
- Light Novel tracking
- SIMKL release calendar
- Release Radar matching
- Telegram notifications
- Android push notifications
- shelves
- linked entries
- media import/export
- PWA installation
- existing media records
- manual progress authority

---

# 53. Definition of "Done"

The redesign is complete when:

- Release Radar is clearly named and discoverable.
- Common actions require fewer clicks.
- The Home screen answers "what should I do next?" immediately.
- Media cards show useful progress and schedule context.
- Updates feels like an inbox rather than a diagnostic report.
- Users can catch up multiple episodes/chapters in one action.
- Anime/Donghua schedule information appears naturally.
- SIMKL implementation details remain hidden from normal users.
- Add/Edit Entry is easier to understand.
- Desktop navigation can collapse.
- Mobile navigation is efficient.
- Loading/error/empty states are consistent.
- Accessibility is preserved/improved.
- The visual system feels cohesive.
- Animation is purposeful.
- No major existing functionality is removed merely for aesthetics.

---

# 54. Priority Matrix

## P0 — Do First

```text
[ ] Rename Queue → Release Radar
[ ] Improve MediaCard hierarchy
[ ] Smart Log Episode/Chapter X
[ ] Add next release to Anime/Donghua cards
[ ] Simplify Updates
[ ] Add Catch up action
[ ] Improve Home hierarchy
```

## P1 — High Value

```text
[ ] Release Radar polish
[ ] Desktop sidebar collapse
[ ] Mobile bottom navigation
[ ] Add/Edit modal redesign
[ ] Command palette actions
[ ] Today section
```

## P2 — Polish

```text
[ ] Timeline visualization
[ ] Refined radius system
[ ] Motion system
[ ] Appearance settings
[ ] Advanced empty states
[ ] Analytics refinement
[ ] Accessibility deep pass
```

## P3 — Optional Future Enhancements

```text
[ ] Personalized daily briefing
[ ] Calendar integrations
[ ] Smarter recommendation surfaces
[ ] More schedule sources
[ ] Advanced notification preferences
```

---

# 55. Final Design Principle

Chronicle should not become bigger.

It should become **clearer**.

Every screen should have one obvious purpose.

Every major piece of information should answer a user question.

Every common action should be reachable quickly.

Every decorative choice should support hierarchy.

The final feeling should be:

> "This app already knows what I need."

Not:

> "This app has a lot of features."

The difference is good product design.
