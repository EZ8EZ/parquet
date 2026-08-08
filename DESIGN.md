# DESIGN.md - Parquet design system

Aesthetic: **dark, editorial, high-contrast - a financial terminal crossed with a
well-designed sports magazine.** One sharp accent (parquet gold). Generous
whitespace, real typographic hierarchy, data in a mono face for the terminal feel.
Mobile-first: every screen is designed at 390px first, primary actions in the
bottom third, a bottom sheet ("the Desk") for navigation, and no horizontal-scrolling
tables.

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

| Token | Hex | Use |
|---|---|---|
| `bg` | `#0b0c0e` | page background (near-black) |
| `surface` | `#131519` | cards |
| `surface-2` | `#1a1d23` | raised cards / hover |
| `elevated` | `#21252c` | chips, inset rows |
| `border` | `#262b33` | hairlines |
| `border-strong` | `#363c46` | emphasis borders |
| `ink` | `#f3f5f8` | primary text |
| `muted` | `#9aa1ad` | secondary text |
| `faint` | `#656c78` | tertiary / captions |
| `accent` | `#e6b34d` | the ONE brand accent (parquet gold) |
| `accent-ink` | `#1a1206` | text on the accent |
| `positive` | `#37d383` | gains, healthy, rebuild-positive |
| `negative` | `#f2585f` | losses, injuries, contradictions |
| `info` | `#5aa9ff` | rebuilding / neutral highlight |
| `warn` | `#f0a83c` | cautions (dossier privacy, history checks) |

The near-black background carries a faint gold+blue radial grain so it never reads
as flat black.

## Layout & interaction rules (lessons from the competitor teardown)
- **The Desk**, a bottom sheet fixed to the screen: a four-item destination row
  (Home / Roster / Plan / Decision ledger, icon **and** label) over a context row
  and a drag handle that opens a drawer with search and every other surface. Never
  a hidden floating nav toggle.
- **No floating overlays that occlude content.** (The competitor's FAB collided with real
  content on every page - we have none.)
- **Stacked cards, never clipped tables**, on mobile. Rankings/values are rows, not
  a horizontally-scrolling grid.
- Single centered column, `max-w-2xl`, that widens gracefully on desktop.
- Safe-area insets respected on the Desk and the analyst composer.

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
Geometric parquet **herringbone chevron** in gold on a near-black rounded square -
`public/icon.svg`. The PWA/favicon PNG set is generated from it by
`pnpm gen:icons` (sharp). No AI-generated raster art.

## States
- **Loading:** skeletons (`.skeleton` shimmer), never spinners, except a small
  inline spinner on in-flight buttons (evaluate / save / ask).
- **Empty:** designed as onboarding, not apology - the ledger empty state is a
  "you're all caught up" and the analyst empty state teaches its adversarial intent.

## Accessibility
- Visible focus rings (`:focus-visible` → accent outline).
- Minimum 44px tap targets on interactive controls.
- Semantic HTML (`nav`, `header`, `main`, lists), `aria-current` on the active tab,
  `role="img"` + labels on charts, `prefers-reduced-motion` disables shimmer.
- High contrast: ink on near-black clears WCAG AA for body text.
