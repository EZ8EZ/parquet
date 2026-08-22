# DESIGN.md - Parquet design system

Aesthetic: **dark, editorial, high-contrast - a financial terminal crossed with a
well-designed sports magazine.** ("The Program", VISION.md: the collector's edition
of your own league - printed matter about basketball, not a dashboard with
sections.) One sharp accent (parquet gold) plus court blue with exactly one
meaning (see below). Generous whitespace, real typographic hierarchy, data in a
mono face for the terminal feel. Mobile-first: every screen is designed at 390px
first, primary actions in the bottom third, a bottom sheet ("the Desk") for
navigation, and no horizontal-scrolling tables.

## Materials & depth (D88)

Three tiers, all tokened in `app/globals.css` and re-stated per theme - compose a
material onto an ordinary `bg-*` card by adding one class, never by rewriting it:

| Class | What it is | Where |
|---|---|---|
| `card-lit` | a card that is *built*: `--sheen` (white-alpha light-from-above gradient) + `--shadow-card` (contact + ambient stack, the Vercel/Geist lesson) + the `--edge-hilite` top catchlight | the cards that anchor a page: Home's cover facts and figure grid, /teams rows |
| `hero-mesh` | the identity moment: the same lit card with the accent-family radial mesh (`--mesh-1/2`, the ground's own gold+blue grain hues at wash strength) under a real film-grain `--noise` tile (inline feTurbulence SVG, 4% alpha baked in, one asset for both themes) | **one per page at most** - Home's cover, /teams' first-run masthead |
| `desk-sheet` | true glass: `--glass-fill` + `--glass-hilite` pane light + `backdrop-filter: blur(20px) saturate(1.4)` + `--shadow-dock` (upward) + `--edge-glow`, the gold catchlight laid along the top edge | the Desk only - the one plane that genuinely floats |

Rules that survived from the old two-declaration system: `--shadow-raised` still
marks the things that float above the page (the drawer, the seat popover), and
text on `hero-mesh` gets the same ground-scoped ink restatement as the accent
wash. The old rule "cards separate by surface, NEVER by shadow" was deliberately
revised by D88 after three owner verdicts of "flat": surface separation is still
the base, `card-lit`'s soft stack is the lift on top of it. `.tab-glow` is the
static halo behind the Desk's lit tab (`--tab-halo`).

## The cover grammar (VISION.md M2)

A page opens as a cover, not a header: **kicker → Fraunces headline → standfirst →
one hero fact set in `--text-display` on the gold floor-line** (a 3px accent rule
under the numeral - the typographic signature). Home is the reference
implementation (`app/page.jsx`). Below the cover, sections vary their register -
a stat grid, then plain set prose ("leads": one real sentence per story with its
destination inline, `Lead` in `app/page.jsx`) - instead of N identically-labeled
boxes. Collapsed accordions on a front page are retired (VISION.md kill list #3):
the front page leads, it doesn't fold.

## Court blue (VISION.md M4A)

The second hue, with exactly one product-wide meaning: **gold = yours, blue = the
field / the market / everyone-else.** It is the existing `info` token, not a new
one. A use that cannot be written as "this is the field's side of a comparison"
does not get the hue; it is never the sole encoding (D47 still binds). First
application: /teams' total-value bars - the field's bars blue, your row's gold.

## Typography
- **Display / headlines:** Fraunces (serif, optical sizing) - gives the editorial,
  magazine voice. Used for page titles and the strategy headline.
- **UI / body:** Inter.
- **Data / figures:** JetBrains Mono with tabular numerals - every value, record,
  age, and delta. This is the "terminal" texture.

All three are loaded via `next/font/google` and wired to CSS variables in
`app/layout.tsx` (`--font-fraunces`, `--font-inter`, `--font-jetbrains`).

## Color tokens
Defined in `app/globals.css` under Tailwind v4 `@theme` (so `bg-*`, `text-*`,
`border-*` utilities are generated). Full set:

| Token | Hex (dark) | Use |
|---|---|---|
| `bg` | `#0b0c0e` | page background (near-black) |
| `surface` | `#16181d` | cards |
| `surface-2` | `#1f232a` | raised cards / hover |
| `elevated` | `#2a2f37` | chips, inset rows |
| `border` | `#3c434f` | hairlines |
| `border-strong` | `#525b6a` | emphasis borders |
| `ink` | `#f3f5f8` | primary text |
| `muted` | `#9aa1ad` | supporting prose |
| `secondary` | `#8b93a2` | anything carrying a datum |
| `faint` | `#7b8493` | chrome: separators, ticks, ordinals |
| `accent` | `#e6b34d` | the brand accent as FILL (parquet gold) |
| `accent-text` | `#edc167` | the same gold tuned to be read |
| `accent-ink` | `#1a1206` | text on the accent |
| `positive` | `#37d383` | gains, healthy, rebuild-positive |
| `negative` | `#f2585f` | losses, injuries, contradictions |
| `info` | `#5aa9ff` | rebuilding / neutral highlight - and **court blue**, the field's side of any you-vs-the-league comparison (M4A) |
| `warn` | `#f0a83c` | cautions (dossier privacy, history checks) |

Plus the material tokens (`--sheen`, `--shadow-card`, `--glass-*`, `--shadow-dock`,
`--edge-glow`, `--mesh-1/2`, `--noise`, `--tab-halo`) documented in the Materials
section above and defined per theme in `app/globals.css`.

The near-black background carries a faint gold+blue radial grain plus a film-grain
noise tile (`--noise`, an inline feTurbulence SVG at 4% alpha) so it never reads as
flat black.

## Depth & materials (D88)

Three material tiers, all tokenized in `app/globals.css` and re-stated per theme, so
"how much light does this element catch" is a system rather than a per-card guess.
The old rule ("cards separate by surface, never by shadow") was deliberately revised
after three owner verdicts of "flat": Parquet had Linear's surface-ladder half of
modern depth and none of Vercel Geist's layered-shadow half.

| Class | Tokens | Job |
|---|---|---|
| `.card-lit` | `--sheen` (white-alpha top light), `--shadow-card` (contact + ambient), `--edge-hilite` | A card that is *built*: the anchoring cards of a page (Home's four figures, the first-run team rows). Composes onto a normal `bg-surface` card - one class, never a rewrite. |
| `.hero-mesh` | `--mesh-1/--mesh-2` (the grain's own gold+blue at wash strength), `--noise`, plus the `.card-lit` stack | The identity moment - **one per page at most**. Home's revealed-strategy masthead and the first-run welcome panel. Its ink gets the wash-grade ground-scoped restatement, same as `bg-accent-wash`. |
| `.desk-sheet` | `--glass-fill`, `--glass-hilite`, `blur(20px) saturate(1.4)`, `--shadow-dock`, `--edge-glow` | Real glass, for the one plane that floats: the Desk. Saturate keeps the page alive behind the blur; `--edge-glow` is a gold catchlight laid along the top edge, brightest mid-edge, gone at the corners. |

Supporting: `.tab-glow` puts a static gold halo (`--tab-halo`) behind the lit tab's
icon; `--shadow-raised` keeps its old job (the drawer, the seat popover). All of it
is one hue - the mesh's second stop is the same grain-blue the ground has carried
since round 1. A **duotone variant** (gold + violet) is committed as an inert,
clearly-marked block gated behind `data-experiment="duotone"`; nothing sets it -
the owner decides from the D88 side-by-side screenshots whether it ships.

## Themes
Two, not more: **dark** (the default identity, D15) and **light** ("Paper" in the
toggle UI) - the standard light/dark pattern, not a second design. Both are overrides
of the same token names in `app/globals.css` (`:root[data-theme="light"]`), so no
component ever branches on which theme is active. Selectable from `/settings`
(`components/ThemeToggle.jsx`), persisted to `localStorage`, and owned end-to-end by
`lib/theme.js` (the theme list, the default, and the inline boot script that sets
`data-theme` before first paint). A third theme, a high-contrast dark variant, shipped
and was later removed by owner direction - D64 - once light/dark alone covered the
same accessibility need without asking anyone to choose between designs.

## Layout & interaction rules (lessons from the competitor teardown)
- **The Desk**, a bottom sheet fixed to the screen: a four-item destination row
  (Home / Roster / Plan / Decision ledger, icon **and** label) over a context row
  and a drag handle that opens a drawer with search and every other surface. Never
  a hidden floating nav toggle. Its material is the app's one glass
  (`desk-sheet`), the lit tab carries the gold `tab-glow` halo, and the top edge
  carries the gold catchlight. (VISION.md M3's scorebug - the context row as a
  persistent mono `record · rank · TCI · window` strip - is noted for the next
  wave; see D88.)
- **No floating overlays that occlude content.** (The competitor's FAB collided with real
  content on every page - we have none.)
- **Stacked cards, never clipped tables**, on mobile. Rankings/values are rows, not
  a horizontally-scrolling grid.
- Single centered column, `max-w-2xl`, that widens gracefully on desktop.
- Safe-area insets respected on the Desk. (The analyst composer was the other
  fixed-to-bottom control this rule was written for; that surface is shelved, so the
  Desk is now the only one. See SHELVED.md, S7.)

## Components
- `components/ui.tsx` - PageHeader, Card, SectionHeader, Tag, Stat, DeltaValue,
  EmptyState, ButtonLink, Skeletons.
- `components/PlayerAvatar.tsx` - monogram avatars in team colors by default;
  real headshots only behind `NEXT_PUBLIC_USE_PLAYER_PHOTOS` (see DECISIONS D8).
- `components/charts.tsx` - hand-rolled SVG (LineChart, BarChart, AgeStrip), legible
  at 390px, no chart library.
- `components/Desk.tsx` (the bottom sheet / navigation), `components/Brand.tsx`
  (wordmark + inline logo).

## Logo & icons
**A square grid of alternating-grain oak blocks** in gold on a near-black rounded
square - `public/icon.svg`, mirrored with themed fills in `components/Brand.jsx`. This
is the Boston Garden floor as it actually was: a basket-weave block parquet, four blocks
in a 2x2 with the grain turned 90 degrees between edge-neighbours. It was a herringbone
chevron until D96, and herringbone is diagonal, which is the one angle this product
reserves. The PWA/favicon PNG set is generated from the SVG by `pnpm gen:icons` (sharp).
No AI-generated raster art.

## The reserved diagonal (D96)
**Orthogonal marks are data. The 45-degree diagonal is reserved, everywhere in the
product, for a refusal.** Nothing else is allowed to run at 45 degrees, which is what
lets a refusal mark identify itself in any theme, at any size, without a colour and
without a caption. `components/RefusalMark.jsx` is the mark; `lib/refusal.js` is the
closed register of codes it is always paired with (D95). A diagonal carrying data is a
bug, and there are currently none.

Two consequences worth knowing before adding a mark:
- **The ground.** `.parquet-ground` in `app/globals.css` is the corrected floor - an
  alpha-only 48px mask tile of four 24px alternating-grain blocks over a flat themed
  `--parquet-grain`, held to about half a JND. One class, one call site (the app column
  in `app/layout.jsx`), deliberately not full-bleed.
- **Chart labels.** No `<text>` inside a scaling `viewBox`. A user unit is only a real
  pixel at scale 1, so text inside a `w-full` viewBox renders at a size no token can
  reach and nobody chose. Either the labels move out to HTML siblings (see
  `components/WindowMap.jsx`) or the viewBox stops scaling.

## States
- **Loading:** skeletons (`.skeleton` shimmer), never spinners, except a small
  inline spinner on in-flight buttons (evaluate / save).
- **Empty:** designed as onboarding, not apology - the ledger empty state is a
  "you're all caught up", not a "no data".

## Accessibility
- Visible focus rings (`:focus-visible` → accent outline).
- Minimum 44px tap targets on interactive controls.
- Semantic HTML (`nav`, `header`, `main`, lists), `aria-current` on the active tab,
  `role="img"` + labels on charts, `prefers-reduced-motion` disables shimmer.
- High contrast: ink on near-black clears WCAG AA for body text.
