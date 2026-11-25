# DESIGN.md - Parquet design system

A clean sports app, dark only: flat near-black surfaces, one sans family, big numbers,
colour-coded chips, rounded cards. Closest reference: Sleeper. Reference pages:
`/roster` and `/league` (exemplars) and `/design` (every primitive, every variant).

## Principles

1. **The number leads.** Each screen exists to deliver one or two figures. Put them first,
   at `text-display` or `text-hero`, with their rank or context beside them. The first
   844px must answer the page's question with no scrolling.
2. **Tone, not lines.** Surfaces separate by stepping tone (`bg` > `surface` > `surface-2`
   > `elevated`). No bordered box inside a bordered box. Borders are hairline dividers
   inside a list, nothing else.
3. **Tap for more.** Lists are rows; a row opens a bottom sheet (or links to a page).
   Long pages become tabs. Explanation sits behind a Disclosure. The default state of a
   screen is short.
4. **Colour always has a partner.** Every colour that means something comes with text, an
   icon, a shape or a position that says the same thing. Violet means "yours"; info blue
   means "the field"; green/red/amber are status, never a grade (D6).

## Tokens (`app/globals.css` `@theme`)

| Token | Value | Use |
|---|---|---|
| `bg` | `#0b0d10` | page |
| `surface` | `#15181d` | cards, list groups, tab bar |
| `surface-2` | `#1e2229` | a tile inside a card, sheet sub-panels, selected row |
| `elevated` | `#282d36` | neutral chips, bar tracks, active segment |
| `border` / `border-strong` | `#252930` / `#3a414c` | list dividers / input edges |
| `ink` `muted` `secondary` `faint` | `#f3f5f8` `#adb5c1` `#a2aab7` `#939cab` | text; all >= 4.99:1 on `elevated`, the lightest ground |
| `accent` / `accent-text` / `accent-ink` | `#8b7dff` / `#a99fff` / `#0b0d10` | brand fill / brand text (7.7:1) / text on fill (6.0:1) |
| `accent-wash` / `accent-edge` / `accent-strong` / `accent-dim` | `#282841` `#444077` `#7a6bf0` `#7166d8` | your row / its edge / hover fill / quiet line (3.9:1) |
| `positive` `negative` `info` `warn` | `#4ade9e` `#ff8080` `#7cb5fb` `#fbc94a` | status; each also has `-wash` and `-edge`. Text on own wash: 7.6 / 5.9 / 6.4 / 8.1 |
| `them` / `them-wash` | `#4f78b3` / `#1c2738` | the opponent in charts and tiles (fills only, never text) |
| `poster`, `tci-1..4` | unchanged roles | title cards; TCI ramp (quadrant only) |

**Type** (Inter, self-hosted variable, `app/fonts/`; tabular numerals on `body`, `figure`
adds slashed zero): `micro` 11 (tab labels, ticks only), `meta` 12 (labels, captions),
`note` 13 (secondary lines, disclosures), `body` 14 (copy, row titles), `lede` 17
(section titles), `score` 24 (a row's figure: the score on the table), `display` 28 (page
title, stat values), `hero` 48 (one per screen; the win chance takes weight 800).
Never below 11px. Weight carries hierarchy: 700 for figures and titles, 600 for row
titles and labels that act, 400-500 otherwise. No uppercase tracked labels.

**Radii** `rounded-card` 16 (cards, lists), `rounded-control` 12 (tiles in cards),
`rounded-full` (chips, buttons, segmented), `rounded-sheet` 24 (sheets, menu). Legacy
`rounded-[--radius*]` classes are shimmed in globals.css; do not write new ones.
**Elevation** only for what floats: `--shadow-raised` (sheets), `--shadow-pop` (menu).
**Shell metrics** `--header-h` 48, `--statusbar-h` 40, `--tabbar-h` 58.

### Renamed or removed (old call sites keep working unless noted)

- Kept names, new values: every colour token above, `text-*` sizes (micro 10->11, note
  12->13, body 13->14, display 30->28), `--radius-sm/--radius/--radius-lg` (10/16/24),
  `--shadow-raised`. `--font-display` now resolves to the sans (no serif anywhere).
- Added: `--radius-card/-control/-sheet`, `--shadow-pop`, `--header-h`, `--statusbar-h`,
  `--tabbar-h`, line heights for every `text-*` step.
- Removed tokens: `--grain-1/2`, `--parquet-block/-tile/-grain`, `--noise`, `--mesh-1/2`,
  `--sheen`, `--glass-fill`, `--glass-hilite`, `--glass-bg`, `--shadow-dock`,
  `--edge-glow`, `--edge-hilite`, `--shadow-card`, `--tab-halo`, `--hero-spot`,
  `--hero-spot-faint`, `--ghost-ink`. `--font-fraunces` and `--font-jetbrains` are gone
  (`--font-mono` is the system mono stack). Light theme overrides and the ground-scoped
  ink restatements are gone (no longer needed: every ink passes on every ground).
- Removed classes: `.parquet-ground`, `.card-lit`, `.desk-sheet`, `.tab-glow`, `.glass`,
  `.edge-hilite`, `.desk-handle`, theme-toggle selectors. Flat aliases kept so old pages
  stay legible, do not use in new code: `.hero-mesh`, `.hero-card`, `.stock-franchise`,
  `.stock-cornerstone` (plain surface), `.stock-fringe` (transparent), `.ghost-rank` and
  `.tier-sheen` (hidden).
- Removed modules: `lib/theme.js`, `components/ThemeToggle.jsx`, `components/ui.jsx`
  (now `components/ui/`, same import path).

## Primitives (`@/components/ui`)

Server components unless marked (client).

- **Card** `tone` default|raised|accent|sunken, `pad` md|sm|none. One level only; step
  tone (`surface-2` tile) instead of nesting cards.
- **PageHeader** `kicker` (small, secondary), `title` (28px), `subtitle` (one line max),
  `leading` (avatar), `aside` (one control), `below` (chips row).
- **SectionHeader** sentence-case 17px title plus one `action` or `href`+`cta`.
- **StatTile** `label`, `value`, `sub`, `delta` (arrow + sign), `size` sm|md|hero,
  `visual` (e.g. RankStrip), `href`. Three across at 390px; hero spans the row.
- **Chip** (`Tag` alias) tones neutral|accent|positive|negative|info|warn, `icon`, `size`.
  Text is mandatory; status tones also pass an icon (AlertTriangle, Check, X, Info).
- **List / ListRow** `leading` (rank), `avatar`, `title` (wraps, never truncates, D111),
  `badge`, `meta`, `value`, `valueSub`, `chevron`, `highlight` (your row: wash + a "You"
  chip). `href` makes it a link; `as="span"` nests it in a Sheet trigger.
- **Sheet** (client) bottom sheet on a native modal `<dialog>`: `trigger`,
  `triggerLabel` (end it with "Show details"), `title`, `subtitle`. Focus contained,
  Escape/backdrop/close dismiss, focus returns, content mounts on first open, motion off
  under reduced motion.
- **Tabs** (client) `items` [{id, label, count, content}], `variant` underline|segmented.
  Panels are server-rendered and `hidden` when inactive. Use for 2-4 views of one page.
- **Segmented** (client) radio group for picking a value (sort, filter). Not for panels.
- **Disclosure** native `<details>`; one-line `summary` such as "How this is measured",
  "Why retool". The standard home for any explanation longer than one line.
- **Button / ButtonLink** primary|secondary|ghost, `size`, `block`. One primary a screen.
- **EmptyState** icon, one-line title, one sentence, one action.
- **SkeletonLine / SkeletonCard / SkeletonRows / SkeletonStats** shaped like the content.
- **BarList** horizontal bars with direct labels and printed values; the default chart.
- **RankStrip** one tick per team, yours tall and violet. Always beside the printed rank.

## Shell

`components/shell/AppHeader.jsx` (brand, team switcher; sticky, safe-area top) and
`components/Desk.jsx`: status bar (scorebug -> standings) above a five-slot tab bar (This
Week, Team, Trade, League, Menu; icon + label, active = violet pill behind the icon plus
`aria-current`). Menu is a panel above the bar: modal, focus-trapped, Escape closes,
page behind inert. `main` pads for header, status bar, tab bar and safe areas.

## Do / don't (from the exemplars)

- Do lead with figures: /roster opens with Total value (hero) then Direction as three
  tiles. Don't open with a paragraph or a stack of uppercase labels.
- Do make long lists rows that open a sheet: /roster players, /league standings. Don't
  expand rows inline into walls of facts, or print 17 rich rows on the default view.
- Do split a long page into tabs: Players / Picks / Outlook; Standings / Power / Windows.
  Don't stack five sections the user must scroll past to reach the one they wanted.
- Do put the reason behind a Disclosure: "Why retool", "How to read these strips",
  "How the power ranking works". Don't leave the paragraph open by default.
- Do mark your row with wash + "You" chip. Don't mark it with colour alone.
- Don't use `font-display` serif styling, `uppercase tracking-*` labels, `border
  border-border` frames on cards, `bg-bg/40` inset boxes, or gold.

## Copy rule

A screen's default state carries at most: a title, one subtitle line, labels and figures,
and one caption line per chart or list. Any sentence longer than one line goes in a
Disclosure or in the sheet behind the row. Name things as a fan would ("Points for",
"Value rank"); keep house rules: no grades or verdicts (D6), "unknown" over a guess (D19).

## Lock-in language (This Week and the lock board)

- **One time zone.** Every clock time is printed in the board's `desk.displayTz` (Eastern by
  default) with no suffix: "Decide by Wed 7:30 PM", "before 7:00 PM". The zone is named once,
  on the refresh button ("4:55 PM ET"). Helpers: `lib/lockin/time.js`. Never format a time
  with the device zone or with `timeZoneName`.
- **The model's lean** is always named as the model's: `LeanChip` "Model leans lock · clear"
  (violet, lock icon) or "Model leans hold · marginal" (neutral outline, hourglass); `short`
  "Model: lock · clear" in dense rows. Confidence is the second word, never a colour. A
  conditional lean says "If not already locked" once per list or card.
- **Win chances** are information beside the lean: "Win chance if lock / if hold", labelled
  rough, neutral grey bars, never styled as the pick.
- **Slot tiles** carry their state (`slotTiles`, `SlotCells`): tip time or day before a game
  ("7p", "Wed"), never "0.0"; violet wash + lock when locked; check when the score stands;
  reset glyph; dashed when empty; a violet underline when a lock-or-hold call is open; "O"/"Q"
  flag for Out / doubtful listings (also in the spoken label). The opponent's row repeats the
  states quietly (blue when locked). No legend on the board.
- **Countdown pill** (`Countdown pill`): neutral, amber under three hours, always with the words.
- **Status bar** is the scorebug: score, rough win chance, open calls, next deadline with its
  countdown; it always opens This Week, and steps aside on This Week's scoreboard
  (`[data-scoreboard]` sets `--statusbar-h: 0`). The This Week tab carries a badge with the
  open-call count (spoken too).
- **Decide-by time.** A move is asked for `DECIDE_BUFFER_MIN` (10) minutes before the listed
  tip, with the tip kept visible: "Wait until 7:20 PM, then lock · locks at 7:30", "By 6:50
  PM · tips 7:00"; inside the buffer "Decide now · locks at 7:30" in the warning tone. Display
  only; the engine's deadlines stay at the tip. Under a wait headline the lean chip reads "At
  the deadline: model leans lock".
- **What-if (assumptions).** Any slot tile, either side, opens "Treat as locked at X / Treat
  as playing on / Model's guess" (`AssumeTile`); the choice lives only in `?assume=` and is
  kept on links between Home and the lock board. Assumed tiles: dashed outline and a pencil,
  never the lock glyph. The scoreboard's What-if bar says what is assumed, "Rough win chance
  54% → 66% with your assumptions", any contradiction in plain words, and Reset; a manual
  refresh clears it too. Your own unknown slot does not offer "playing on" (no effect).
- **Tabs.** Segmented for 2-4 views (Team, League, the player sheet); underline only for the
  lock board's five (Tonight · Calls · Win % · Week · History).
- **Refresh** is one round button with the as-of time; after a manual refresh a short note
  says what changed ("Updated 5:12 PM ET · win chance 27% → 31%"), announced politely.

## Charts

- Direct labels: name and value printed next to the mark; no legend for a single series.
- Never colour alone: length, position or a printed number carries the value; colour
  marks only which one is yours (CHART_ACCENT) or the field (CHART_FIELD).
- Minimum sizes at 390px: label text 11px, bars 8px tall, tap targets 44px, dots 6px.
- Labels are HTML text, never `<text>` inside a scaling `viewBox`.
- `lib/chart-colors.js`: `CHART_ACCENT` (one subject), `CHART_MARK` (peers),
  `CHART_FIELD`, `CHART_INK` for numbers, `CHART_GRID` for rules, `DIVERGING` for signed
  values, `magnitudeOpacity` only as a third encoding.
- Prefer BarList and StatTile + RankStrip over radar, scatter or donut.

## The 45-degree diagonal

Still reserved for refusals (D96, `components/RefusalMark.jsx`); nothing else runs at 45.

## Per-page checklist (applying workers)

- [ ] First 844px at 390px answers the page's question; figures above the fold.
- [ ] PageHeader used; subtitle one line or none; no uppercase tracked kickers.
- [ ] No card frames (`border border-border` on a card), no box inside a box.
- [ ] Every paragraph longer than one line is in a Disclosure or a Sheet.
- [ ] Lists use List/ListRow; rich rows open a Sheet; long pages use Tabs.
- [ ] Your row: `highlight` + "You" chip. Status chips have text and icon.
- [ ] Figures use StatTile or `figure` + `font-bold`; no serif, no gold, no materials.
- [ ] Charts follow the chart rules; colours from `lib/chart-colors.js`.
- [ ] Names wrap (no `truncate`/`line-clamp-1` on names); no horizontal overflow.
- [ ] Logic stays in `lib/`; numbers unchanged; D6 and D19 copy rules hold.
- [ ] axe clean, including open tabs and sheets; focus visible; targets >= 44px.
- [ ] Visible word count before and after recorded; screenshots at 390px checked.
