# VISION_DRAFT — "The Program"

*A proposal, not a change. Nothing here is built. Screenshots referenced below were shot
2026-08-22 from current main (`7fed6c9`), fixture provider, 390px, both themes
(`scratchpad/dark/*.png`, `scratchpad/light/*.png`).*

---

## Part 1 — The critique, from real eyes

The honest headline first: **Parquet is a well-edited manuscript typeset as a database.**
The words are the best thing in the app — "You said rebuild. You bought win-now.",
"Where the room is.", "Capture the why" — and almost every one of those sentences sits on
top of the identical grey card, the identical uppercase tracked label, the identical
hairline border, at the identical width. The app has exactly one texture and it repeats
for 25 pages. That is why three disciplined cleanup passes haven't moved the owner's
verdict: the cleanups made the sameness *cleaner*.

### Page by page

**Home (`home-dark.png`).** The single best moment in the product — kicker, Fraunces
headline, the stated-vs-revealed card — and then the page gives up. Below the four-numbers
strip sit three *collapsed* accordions (STILL RUNNING · 5 active, WHAT YOUR RECORD SHOWS ·
4 findings, WHO YOU DEAL WITH · top 3): the front page of the app hides three of its four
stories behind grey bars that all look like each other and like nothing. A newspaper
doesn't print its section names on the front page; it prints its best sentence from each
section. Also: the stated-vs-revealed card is a nine-line wall of small prose in a tinted
box — the strongest content in the app rendered as its densest paragraph.

**Roster (`roster-dark.png`).** A 4,175px scroll where every instrument has the same
chassis. The good: the positional-value radar and the age strip are real graphics; the
"whose season decides them" panel is a genuinely original object. The bad: sixteen
roster rows with a red downslope sparkline on nearly every one — when 11 of 16 rows carry
the same red mark, the mark stops being information and becomes wallpaper (alarm fatigue).
The dot-strip stats at top (total value / pick capital / top-5 share) are four variations
of the same 8px strip and read as one grey blur at arm's length.

**Values (`values-dark.png`, `values-light.png`).** The exact D72 complaint at full scale:
~60 visible rows, every one structurally identical — rank, name, meta line, mono number,
chevron, swap icon. The tier — the one thing the model actually *concluded* — is the
visually weakest element on the row: small right-aligned text ("Franchise", "Cornerstone",
"High-End Rotation") that renders identically for LeBron and for a fringe center. **This
app's core object is a player's value, and the app renders it as a table row.** And
"consensus only" is printed on *every single row* — 60 repetitions of a caption that is a
property of the dataset, not of the row. Dead copy.

**Rank (`rank-dark.png`).** 9,691 pixels tall. ~120 identical draggable rows. As a
thumbnail it is literally a solid grey bar. Nobody hand-ranks 120 assets on a phone; they
disagree with the model about 15 of them.

**Trade Finder (`trade_finder-dark.png`).** The D101 regroup is right — grouped, not
ranked, the copy is honest. But visually it's 13 identical cards of comma-separated names
plus chip salad, and two bugs survive: a card *title* truncates mid-word ("Hardwood
Ca..."), and the raw internal enum **`SPLIT_ROSTER` leaks into the UI** ("WINDOW
SPLIT_ROSTER" printed on at least six cards). An internal constant in the reader's face
is the single most "not designed" moment in the app.

**Ledger (`ledger-dark.png`).** "Capture the why" + the gold-ringed composer with the
italic prompt is lovely. Then: eighteen identical rows, all truncating mid-word ("Rashad
Petr...", "Marcu...", "Colem..."), all with the identical gold "add why" pill. The page
that exists to make you *feel* the unpaid debt of 19 uncaptured decisions renders that
debt as a monotone chore list.

**Deals (`deals-dark.png`).** A phone book. 141 deals as identical two-line rows —
`Team ↔ Team / date · wk · 2 players`. Nothing distinguishes the trade that reshaped the
league from a throw-in swap. The record is the app's whole premise, and the record has no
typography of importance.

**Managers (`managers-dark.png`).** Fourteen cards and at least ten of them carry the
*same auto-generated sentence* — "X is one of the most active traders in the league (~N
trades/season)..." — truncated mid-sentence with an ellipsis on every card. Copy that
repeats fourteen times and never finishes is worse than no copy. The tags above it
already say the same thing.

**League (`league-dark.png`).** The D102 seat card is the right idea and "2029–2031" in
display type is a real moment. But the team-chips below it are fourteen identical grey
pills in five stacked rows, and the power ranking is fourteen near-identical cards with a
6px gold bar. Structure landed; the visual campaign didn't.

**Recap (`recap-dark.png`).** The Scout / The Steal / Hot Potato mini-cards with icons are
the most *fun* square inches in the app — proof fun is possible inside the house rules.
Two paragraphs later, the TIMELINE tile crams a ~40-line explanation into a half-width
column: a literal wall of 12px text in a 165px column. Worst single tile in the app.

**Awards (`awards-dark.png`).** The Superlatives have 30-for-30 names (The Closer, The
Shark, The Ghost, Best Friends Forever) and phone-book bodies — twelve sections, each the
identical 4-row list. At overview zoom the page is a solid grey column. The names deserve
title cards; they got tables.

**Depth (`depth_LAL-dark.png`).** The D97 rungs-and-braces drawing is honest and reads
well. Remaining sins: names truncate inside tie braces ("PG · 31y ·..."), and another raw
code voice leak — "SOURCE_GAP:" printed in italics as a label to a human.

**Methodology (`methodology-dark.png`).** 16,127 pixels of prose. The intellectual
backbone of the app, presented as the longest, least-designed page in it. The
production-evidence dot strips (D99) are in there, invisible at depth ~10,000px.

**Teams (`teams-dark.png`).** Fine as a front door; tags truncate ("Reacti...",
"Name ...") on most cards — same disease as /managers, inherited copy that doesn't fit.

**Trade (`trade-dark.png`), Plan (`plan-dark.png`), Dossier (`managers_2-dark.png`),
More (`more-dark.png`), Lab (`lab-dark.png`).** The strongest set. /trade is the
one page with a real primary action (a single gold CTA). /plan's numbered moves with
YOU SEND / YOU TARGET panels genuinely instruct. The dossier is the best-structured page
in the app. These need the new clothes, not new bones.

**Paper theme (`home-light.png`, `values-light.png`).** Underrated — the cream ground
with the red stated-vs-revealed card reads like a good magazine. Same sameness disease,
but the ground itself is an asset.

### What is genuinely good and must survive

1. **The editorial voice.** Kickers, Fraunces headlines, question-form WHERE NEXT links.
   No competitor sounds like this. It is the brand more than the logo is.
2. **The reserved diagonal (D96)** and the refusal register (D95). A real system with a
   real rule; a design director would kill to have invented it.
3. **The one-accent discipline as a floor.** Gold *means* something here precisely because
   it's been defended. (The second-hue exploration below has to spend against this asset
   knowingly.)
4. **The Desk.** Bottom-sheet nav with real labels; no FAB, no hamburger.
5. **D102's question-led structure on /league** and the seat card's big year-range.
6. **The recap superlative mini-cards** — the existence proof for "fun without verdicts."
7. **The plan page's numbered moves** and the trade evaluator's single-CTA layout.
8. **Paper theme's ground.**

### The kill list (useless — delete, don't restyle)

1. **"consensus only" on every /values row** (60+ repetitions). Say it once under the
   page header. (`values-dark.png`)
2. **The auto-sentence on /managers index cards** — repeated, truncated, redundant with
   the tags directly above it. Keep tags + the numbers row; the prose lives in the
   dossier. (`managers-dark.png`)
3. **Home's three collapsed accordions as a pattern.** Collapsed-by-default sections on
   the front page are the app refusing to lead. Surface one real sentence/number from
   each; kill the accordion chrome. (`home-dark.png`)
4. **Raw enums and code voice in UI**: `SPLIT_ROSTER` on trade-finder cards,
   `SOURCE_GAP:` on /depth. These are bugs wearing labels. (`trade_finder-dark.png`,
   `depth_LAL-dark.png`)
5. **The /rank 120-row drag list as the primary interface.** Keep the feature (it feeds
   the finder's conviction line); the surface becomes "disagree with the model about the
   assets you care about" — search + a short working set, not a 9,700px page.
   (`rank-dark.png`)
6. **/recap's TIMELINE wall-of-text tile.** The explanation belongs behind the existing
   "What TCI and RFI measure" link that is already on the same page, three inches lower.
   (`recap-dark.png`)
7. **/more's WHERE NEXT block** — it links to About and Methodology, which are already
   listed in the index *on the same screen*. A page whose body is a list of links does
   not need a footer of links. (`more-dark.png`)
8. **Truncation, product-wide, as a standing defect class**: ledger rows, teams tags,
   finder card titles, depth tie braces. D72 fixed six pages and the disease re-grew on
   four new ones. The redesign should ship a rule (a lint, a component contract), not
   another pass.

---

## Part 2 — Inspiration beyond the obvious references

Each source: what it actually is → the one concrete thing it gives a 390px basketball
decision app.

**1. The Athletic × Gretel — the inline as a brand you can typeset.**
Gretel's rebrand built the whole identity from a custom *inline* slab face (with A2 Type),
so any application can be branded "purely with type," over "neutral and nuanced warm
grays" with team color as a secondary system.
→ **Translation:** Parquet's brand device shouldn't be the logo block; it should be a
*typographic signature* — a single gold inline/underscore rule that lives inside the
display numerals and headline underlines (the "floor line"). One drawn element, reusable
on every page top, zero new components. The page header stops being "label + h1" and
becomes a masthead.
Sources: [Gretel — The Athletic](https://gretelny.com/the-athletic),
[GDUSA on the identity](https://gdusa.com/gretel-teams-with-the-athletic/),
[Brand New review](https://www.underconsideration.com/brandnew/archives/new_logo_and_identity_for_the_athletic_by_gretel.php)

**2. ESPN 30 for 30 — the monochrome title card and the authority of a numeral.**
The 30-for-30 mark works because it is slab, tight-kerned, monochrome — it sits on any
photo, any era, and never competes with the film. The numerals ARE the poster.
→ **Translation:** The Superlatives (/awards) become **title cards**: each award opens
with its name set huge over a near-black card with one stat as the sub — twelve distinct
posters instead of twelve identical lists. Same treatment gives Home's record ("13-7")
and the seat card's "2029–2031" permission to be the artwork, not the caption.
Sources: [Prologue Films — 30 for 30](https://prologue.com/portfolio-item/espn-30-for-30/),
[COLLINS — ESPN 30 for 30](https://www.wearecollins.com/work/espn-30-for-30/),
[analysis of the logo's design](https://thomaswictor.com/why-the-30-for-30-logo-is-the-smartest-thing-espn-ever-designed-xxe)

**3. NBA broadcast graphics — the scorebug as persistent, branded density.**
Sports Video Group's 2026 scorebug piece: the scorebug is "the signature of the
broadcast," on screen more than any other element, and modern packages treat *motion as
system architecture*, not garnish.
→ **Translation:** The Desk's context row becomes Parquet's **scorebug**: a one-line,
always-current strip of *your seat* — `PK · 13-7 · #5/14 · TCI 57 · window 2029-31` — in
mono, present on every page, tappable to /league. The app gets a signature element that
is pure standing fact (no verdict), and the reader stops re-finding their bearings on
every page.
Source: [SVG — Designing the Modern Scorebug](https://www.sportsvideo.org/2026/06/09/designing-the-modern-scorebug-how-broadcast-graphics-teams-are-rethinking-the-most-important-element-on-screen/)

**4. Basketball cards, 1986 Fleer → Prizm — value as a physical object with a material
hierarchy.** The '86 Fleer card is a system: colored border frame, yellow inner keyline,
name/team/position in a fixed plate. Prizm's whole economy is *material*: the same card
in silver, blue ice, gold /10, black 1/1 — tier carried by **finish and border, never by
a grade printed on the card**. Parallels are 70-80% of product value; the object itself
communicates scarcity.
→ **Translation:** This is the answer to "tiers must feel different without letter
grades" (D6-safe, because the tier is already the model's published output, not a new
verdict). A **Parquet asset card**: fixed name plate, mono value, sparkline — where the
*card stock changes by tier*. Franchise = double keyline + a restrained sheen; Cornerstone
= single gold keyline; Starter = plain stock; Fringe = uncoated (flat, borderless). At row
scale, the same ladder collapses to the left-edge treatment. LeBron should feel like
pulling a gold /10; a fringe center should feel like base cardboard.
Sources: [PSA on 1986-87 Fleer](https://www.psacard.com/articles/articleview/3235/modern-masterpiece-look-1986-87-fleer-basketball-card-set),
[Prizm parallel hierarchy](https://www.basketballcardinsider.com/basketball-card-parallel-guide/panini-prizm),
[parallels explained](https://www.qpmarketnetwork.com/sports-cards/parallels-in-sports-card/)

**5. NBA 2K MyGM — the same problem, made a game.** 2K's franchise mode runs rosters,
trades, and player value on a TV UI, and its most instructive object is the **Team Intel
screen — how the *other* side values your players**.
→ **Translation:** Parquet already computes both-ways pricing (finder "real room / narrow
room"). Present it 2K-style on the trade evaluator result: a **two-sided receipt** — your
ledger line and *their* ledger line, printed as two columns of the same receipt, so a deal
reads as two simultaneous books instead of one number. That's presentation, not new math.
Sources: [NBA 2K25 MyNBA/MyGM courtside report](https://nba.2k.com/2k25/courtside-report/mynba/),
[MyGM overview](https://nba2k.fandom.com/wiki/MyGM)

**6. FIFA/FC Ultimate Team — the tier ladder as instant reading.** Bronze/silver/gold by
rating band; *rare* as a brighter finish of the same card; special states (TOTW black
inform) as their own stock. Any player, one glance, no letters anywhere.
→ **Translation:** Confirms move 4's mechanism and adds one: **special states get their
own stock** — a recently-traded asset carries a "just moved" edge for a week; a refused
value is the diagonal (already designed, D95/D96). The card system and the refusal system
compose instead of competing.
Sources: [FC 25 card guide](https://fifauteam.com/fc-25-player-cards-guide/),
[evolution of FUT cards](https://futgraphics.com/articles/the-evolution-of-fut-cards-a-visual-history-from-fifa-09-to-ea-fc-24)

**7. yui540 — the owner's own reference: choreographed CSS, toy-like joy.** yui540's
portfolio is pure-CSS transition craft — curtain reveals, staggered enters — with an
explicitly "cute, toy-like worldview," shipped for real clients (pixiv, BANDAI).
→ **Translation:** Parquet already has the tokens (`interaction.css`: 120/180/260ms, one
ease-out) and almost nowhere spends them. Adopt a **register of exactly three signature
moments**: (1) list rows stagger in 12px on page enter (~30ms apart, first 8 rows only);
(2) the trade evaluator's receipt *prints* — result rows revealed top-to-bottom like a
till receipt; (3) tier sheen on the asset card catches once on first scroll-into-view.
All transform/opacity, all under the existing `prefers-reduced-motion` contract. Three
moments is a register; ten is a theme park.
Sources: [yui540.com](https://yui540.com/), [css-animator.com](https://css-animator.com/)

**8. The Pudding — the number in the prose is the mark in the chart.** Their scrollytelling
grammar: highlighted phrases in the narrative correspond 1:1 to visual changes in a pinned
graphic; the data *is* the narrative.
→ **Translation:** /methodology stops being 16,000px of prose and becomes a **stepped
walkthrough**: one pinned chart (the value model), and as you scroll, each paragraph's
highlighted number lights the corresponding mark — rank prior, age curve, the 23%
production weight (D94's whole argument, finally drawn once instead of said five times).
Same grammar later fits /recap as a season story.
Sources: [Storybench on The Pudding](https://www.storybench.org/the-proof-is-in-the-pudding-how-one-online-publication-is-using-cutting-edge-data-visualizations-to-tell-meaningful-pop-culture-stories/),
[scrollytelling analysis](https://scrollytell.ing/the-pudding-series-the-unlikely-odds-of-making-it-big/)

**9. Teenage Engineering / Braun — one signal color, spent functionally.** TE's discipline:
"orange means recording across every product." Color is an instrument label, not a mood.
Data-dense hardware feels premium because every element earns its place and the palette
is a *code*.
→ **Translation:** This is the honest frame for the second-hue exploration the owner has
now authorized. If a second hue enters, it enters the TE way, with a sentence-long
meaning that holds product-wide: **gold = yours; the second hue = the market/consensus/
everyone-else.** Two-sided objects (trade receipts, league boards, distribution strips
where your tick sits against the field) suddenly get a free dimension. If a candidate use
can't be written as "this is the field's side of a comparison," it doesn't get the hue.
Sources: [DesignWanted on TE](https://designwanted.com/teenage-engineering-creating-design-perspective/),
[TE and Rams' vocabulary](https://audionewsroom.net/2024/11/a-design-icon-reviews-the-teenage-engineering-op-xy.html),
[Constraints as aesthetic](https://blakecrosley.com/guides/design/teenage-engineering)

---

## Part 3 — The plan: "The Program"

### The direction, named

**The Program.** The thing you're handed at the arena: newsprint gravitas on the cover, a
box score in the middle, a card-shop insert stapled in, the night's numbers set huge. It
is printed matter about basketball — which is exactly what Parquet is: a private
publication about one league, issued to a readership of one.

**Intent.** Parquet should feel like *the collector's edition of your own league* — an
object with a front page, not a dashboard with sections. Three voices, deliberately
distinct, replacing today's single grey voice: the **editorial voice** (Fraunces
headlines, kickers, standfirsts — already exists, gets promoted from decoration to
structure); the **broadcast voice** (mono numerals, the scorebug, title-card numbers —
exists as a font choice, gets a job); and the **object voice** (the asset card with a
material tier ladder — doesn't exist yet, and is the single biggest missing piece,
because the app's core noun currently renders as a table row). Fun enters through
material and motion — sheen, stagger, the printed receipt — never through verdicts,
mascots, or grades. The reserved diagonal, the refusal register, and the no-verdict rule
are not casualties of this direction; they are what makes it credible. A collector's
program that refuses to editorialize is *exactly* the tone D6 wants.

### The moves, ranked by impact

**M1 — The Asset Card: player value becomes an object. [L]**
*What:* A `AssetCard` component with the Fleer-grammar fixed plate (name, pos·age, team,
mono value, 4-season sparkline, headshot now that D90 fixed photos) whose **stock varies
by tier** (Prizm/FUT ladder: Franchise double-keyline + one-time sheen → Fringe uncoated).
Row lists keep rows, but the row's left edge carries the same material ladder, so /values
stops being 60 identical bars.
*Where:* /values, /roster's by-value list, /rank, trade builder pieces, finder packages,
lineage pages.
*Why:* The mission is asset-value decisions; the asset must be the most designed object
in the app. Tier differentiation without grades is the FUT/Prizm lesson, and tiers are
already the model's published output — presentation, not new judgment.
*House rules:* D6 clean (no grade appears anywhere on the card); flag: sheen/motion under
the existing reduced-motion contract; photos have the D39/D90 fork guard already.
*The fork (owner decides):*
— **A. "Card Shop":** rows open a full-screen card (tap → card flip). Maximum fun,
maximum L, risks preciousness on a 60-item list.
— **B. "Print Ledger":** no full-screen object; the material ladder lives entirely in the
rows and in one hero card at the top of /values (the #1 asset, as the page's cover).
Cheaper, calmer, less collectible.
**Recommendation: B first, A as a fast-follow only for the trade evaluator and lineage
pages** — the two places a single asset genuinely deserves a stage. A gallery of 260
flippable cards is a toy; one card printed on a receipt is a document.

**M2 — Front-page grammar: every page gets a cover, not a header. [M]**
*What:* Codify the masthead: kicker → Fraunces headline → standfirst → **one hero fact
set as display** (the 30-for-30 numeral move: "13-7", "2029–2031", "141 deals",
"68.7%"), with the gold floor-line as the typographic signature (The Athletic's
inline lesson). Then *vary section rhythm per page* — kill the wall-to-wall uppercase
SectionHeader taxonomy; sections alternate density (a full-bleed number, then a list,
then prose) instead of N identical labeled boxes.
*Where:* Product-wide; biggest wins on Home (the three accordions become three led
stories), /awards (title cards), /league, /recap.
*Why:* This is the direct fix for "doesn't feel designed" — the app already owns the
editorial voice; it just never lets it lay out a page.
*House rules:* none.

**M3 — The scorebug: your seat, on every page. [M]**
*What:* The Desk's context row becomes a persistent one-line mono strip —
`PK · 13-7 · #5/14 · TCI 57 · 2029-31` — always current, tap → /league seat card. Add the
broadcast lesson: it's the most-seen element in the product, so it gets the brand's
tightest typography.
*Where:* The Desk (product-wide).
*Why:* Standing facts, zero verdicts; gives the app the "always on air" feel and gives
every page a shared anchor. Cheap relative to its constant visibility.
*House rules:* D6 clean — every figure is a published standing fact.

**M4 — The second hue, spent the Teenage Engineering way. [S-M]**
*What:* One cool hue (working name **court blue** — tune the existing `info` blue rather
than inventing a fifth semantic) promoted to a *meaning*: **gold = yours, blue = the
field**. Applied to exactly: distribution strips (your gold tick vs the field's blue
band), both-ways trade receipts (your column/their column), league boards (your row vs
the market), consensus-vs-your-board on /rank. Never decorative, never on a page that has
no "field" side.
*Where:* /league, /trade, /trade/finder, /values distribution marks, /rank.
*Why:* Every important object in this app is a comparison of *you against the league*;
today both sides of that comparison are grey.
*House rules:* **Real tension** — D15/D47/D48/D61/D64 declined a second hue four separate
times, and D47's rules must bind it (never the sole encoding; fill and text values differ
per theme). The owner has authorized exploration this round; this is the disciplined
version.
*The fork (owner decides):*
— **A. Adopt court blue** with the one-sentence meaning above, tokened like the accent.
— **B. No new hue; material instead** — the field's side rendered as a distinct *texture*
(halftone/stipple fill, orthogonal per D96), keeping the one-accent identity intact.
**Recommendation: A.** The comparison objects are the app's future and texture alone
won't carry them at 8px strip heights; A is also honest about what four prior rounds
protected — the accent's *meaning* — which survives intact because blue takes a
different job rather than a share of gold's.

**M5 — Execute the kill list. [S]**
*What:* Part 1's eight items: per-row "consensus only", the managers auto-sentence, Home's
collapsed accordions, raw enums (`SPLIT_ROSTER`, `SOURCE_GAP`), the 120-row /rank surface,
/recap's TIMELINE wall tile, /more's self-duplicating footer, and a truncation *rule*
(component contract or lint: any `truncate` on user-facing names must justify itself; the
D72 disease has regrown on four surfaces).
*Why:* Cheapest credibility in the plan. "Correcting anything not good or useless" was
the assignment.

**M6 — The record gets typography of importance: deals as box scores. [M]**
*What:* /deals stops being a phone book: each season leads with its **headline deal**
(largest two-way value moved — a standing measurement, not a judgment) as a full-width
box-score card; ordinary deals stay compact rows but gain a magnitude glyph (value moved,
bucketed) so the eye can find the big ones. Deal detail pages set like a receipt/box
score — monospace ledger, two columns, printed-matter rules. The two-sided receipt (M1/M5
of Part 2's 2K lesson) is the same component the trade evaluator's result uses.
*Where:* /deals, /deals/[id], /trade result.
*Why:* The record is the premise of the app; it currently has zero visual hierarchy of
importance. "Largest value moved" is arithmetic on published values, not a verdict.
*House rules:* D6 watch — the headline-deal label must stay a measurement ("most value
moved"), never "best/worst trade."

**M7 — The Superlatives become title cards. [S-M]**
*What:* Each award opens on a 30-for-30-style monochrome title card — award name huge in
Fraunces, one stat as the deck, winner's team mark — then the existing 4-row list beneath.
Twelve posters instead of twelve identical tables. (`awards-dark.png` is the before.)
*Where:* /awards; the recap's three mini-awards adopt the same family.
*Why:* Already the most fun content; currently the most monotone page. High
delight-per-effort.

**M8 — The motion register: three signature moments. [S-M]**
*What:* Spend the already-shipped tokens (`interaction.css`) on exactly three
choreographies (yui540 lesson): staggered row entrance (first ~8 rows, 30ms steps),
the evaluator's **printed receipt** reveal, and the one-time tier sheen on Franchise/
Cornerstone cards. Nothing else moves that doesn't already.
*Where:* List pages, /trade, asset cards.
*Why:* "Fun" is currently zero motion everywhere; a small fixed register adds life
without becoming noise, and the reduced-motion contract already exists.
*House rules:* keep the register closed — a fourth moment needs a decision entry.

**M9 — Methodology as a Pudding walkthrough. [L]**
*What:* One pinned chart of the value model; scroll steps light each component — rank
prior, age multiplier, the 23% production weight with D99's two-panel evidence embedded
at the moment the prose mentions it. The long-form prose survives below as the appendix.
*Where:* /methodology (16,127px today — `methodology-dark.png`).
*Why:* The app's honesty is its identity; right now the proof is unreadable. Last in
rank because it's a reader page, not a decision page — but it's the move that makes the
whole "science" claim *felt*.
*House rules:* D19 clean — it draws only what the model already computes.

### Sequencing note

M5 (kill list) and M2 (front-page grammar) first — they change the felt quality of every
page and de-risk the rest. M1B + M4A together are the visual identity payload. M3, M7,
M8 ride along per-page. M6, M9 close.

### The two decisions the owner is being asked to make

1. **M1 fork: Card Shop (A) vs Print Ledger (B).** Recommended: **B now, A later and only
   on the evaluator + lineage stages.**
2. **M4 fork: court blue (A) vs texture-only (B).** Recommended: **A** — one new hue, one
   sentence of meaning ("gold is yours, blue is the field"), D47's rules binding.
