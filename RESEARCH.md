# RESEARCH.md - Dynasty Fantasy Basketball Companion (Competitive Research)

_Prepared 2026-07-28. Sources are public marketing pages, free tool surfaces, GitHub repos, app-store listings, and third-party reviews. No proprietary or paid datasets were scraped. Several fantasy sites (Hashtag, Fantrax, RotoWire) return HTTP 403 to automated fetching; those details are corroborated from search-indexed snippets and reputable third-party reviews and are flagged inline._

## 1. Executive summary

The dynasty-basketball tooling market is **fragmented across three non-overlapping camps** - content/editorial (RotoWire, RotoBaller), league platforms (Fantrax, Yahoo), and analytics engines (Basketball Monster, Hashtag Basketball) - and **no single product unifies crowdsourced trade values, pick/asset modeling, and league sync** the way dynasty football's ecosystem has matured. Our original hypothesis that "no KeepTradeCut-for-NBA exists" is **REFUTED**: **Court Consensus** (courtconsensus.com) is a genuine crowdsourced dynasty-basketball value site with an ELO engine, and there are several hybrid crowd/expert entrants (Dynatyze, OneNumberHoops, Hashtag's blended calculator) plus an open-source clone (chooseyourhooper.com). **However, none of them has KeepTradeCut-scale vote liquidity** - the category has early incumbents but no entrenched leader, and the FantasyCalc "values from real executed trades" model is **completely unoccupied for the NBA**. The strategic implication: this is not greenfield, but it is winnable, and - critically for us - none of these competitors touches the behavioral/decision-intelligence layer where our four differentiators (decision ledger, revealed-vs-stated strategy, manager dossiers, adversarial LLM analyst) would live.

---

## 2. Per-tool teardowns

### 2A. Fantasy Basketball tools

#### Hashtag Basketball (hashtagbasketball.com)
1. **Does well:** Best-in-class category-league planning, anchored by the Advanced NBA Schedule Grid (which teams play most games in a week - the streaming bible for H2H). Broad free access; imports Yahoo, ESPN, Fantrax, Sleeper.
2. **IA / nav:** Schedule Grid, Playoff Schedule, Dynasty Rankings, Keeper, Prospector, Trade Analyzer, **Dynasty Trade Calculator**, Defense vs Position, Playing Time Trends, Player Analysis, ADP, Waiver Pickups. Projections in three flavors (standard, BLEND7, BLEND14).
3. **Pricing:** HASHTAG+ **$2.50/mo** - one sub covers all four sister sites (NBA/MLB/NHL/NFL); much is usable free. (Confirmed via search + Patreon.)
4. **Mobile:** Web-only, **no native app**; third-party reviews call the UI dated and note no real-time platform integration.
5. **Feature most worth stealing:** Its **Dynasty Trade Calculator that blends editorial dynasty rankings with crowdsourced values** - the only purpose-built dynasty trade-value tool among the established basketball sites.

#### Basketball Monster (basketballmonster.com)
1. **Does well:** The most rigorous projection/valuation engine - full-season + daily projections updated multiple times daily, customized to exact league settings, with punt-strategy analysis and skill-based valuation. The analyst's power tool.
2. **IA / nav:** Tools (Player Rankings, Team Analysis, Trade Analysis, Lineups, Box Scores, Schedule Grid); Members (Projections, Draft Tracker, Projected Standings, Smart Tool, Advanced Ownership, Depth Charts, Tiers); the "Monster" suite (Draft/Analysis/**Trade**/Matchup/Usage Monster); dynasty via Josh Lloyd's "DURANT" rankings.
3. **Pricing:** Subscription, prorated by % of season remaining; third-party 2026 review cites **$9.99 / $19.99 / $29.99 per month** tiers (verify against live page before external citation).
4. **Mobile:** Web-only; reviews cite a high learning curve and density "overwhelming for casual users."
5. **Feature most worth stealing:** **League-settings-customized valuation output** - every projection and trade value recalculated to _your_ scoring/roster rules, not a generic ranking. This personalization is what power users pay for.

#### Fantrax - Dynasty Basketball (fantrax.com)
1. **Does well:** The industry-leading dynasty/keeper **league-hosting platform** with the deepest customization; where serious dynasty basketball leagues actually live. A platform, not a content site.
2. **IA / features:** Free + premium commissioner tiers; **draft-pick trading up to 10 years out** (configurable rounds/years), **multi-team trades**, 365-day off-season transactions, extensive keeper/dynasty rules. Apps carry standard league nav (Home, Teams, Players, Transactions, Standings).
3. **Pricing:** Free leagues available; **Premium Commissioner ~$79.95-$129.95/season** (i.e., under ~$8/user for a 12-team league).
4. **Mobile:** **Native iOS + Android, ~4.8 stars**, but recurring complaints: "outdated" UI, roster-edit bugs, navigation friction, historically no full in-app draft.
5. **Feature most worth stealing:** **Deep draft-pick-as-asset management** (picks tradeable up to 10 years out) plus **multi-team trades** - the transactional backbone dynasty managers demand and content tools lack.

#### Yahoo Fantasy Basketball
1. **Does well:** Scale, polish, and free accessibility - the mainstream default with the most refined consumer/mobile UX of the group.
2. **IA / nav:** Free game (Create/Join, Rankings, Analysis, My Team, Players, Matchups). **Yahoo Fantasy+** adds ~19 tools: Research Assistant, **Trade Hub** (most-traded, team analysis, **top-3 trade partners**), Draft Tools, Expert Rankings (Yahoo + RotoWire).
3. **Pricing:** Base **free**; **Fantasy+ = $2.92/mo billed annually** (7-day trial).
4. **Mobile:** **Best-in-class native apps** - the consumer UX benchmark.
5. **Feature most worth stealing:** The Trade Hub's **"Top 3 Trade Partners"** - algorithmically surfacing _who_ to trade with by roster fit. A partner-matching layer over dynasty values would differentiate strongly.

#### RotoWire - Basketball Dynasty (rotowire.com)
1. **Does well:** Comprehensive tool + data suite around pro editorial - projections (season/daily/ROS with ceiling/floor), lineup optimizers, a genuine Trade Analyzer.
2. **IA / nav:** NBA Fantasy, Starting Lineups, Injury Report, Draft Kit, Rankings (keeper/weekly/rookie/best-ball), Projections, Lineup Optimizer, Cheat Sheets, ADP, Auction Values, and a Dynasty section (rankings, buy/hold/sell) - dynasty content is largely **editorial articles**, not an interactive engine.
3. **Pricing:** Subscription (season/monthly); NBA price not exposed to fetch; also powers Yahoo's expert rankings.
4. **Mobile:** Responsive web, tool-heavy pages; content/DFS-first, not app-first.
5. **Feature most worth stealing:** The **"Buy / Hold / Sell" dynasty framing** on a ranked list - an action-oriented overlay that guides _decisions_, not just rankings.

#### RotoBaller - Basketball Dynasty (rotoballer.com)
1. **Does well:** High-volume, frequently-updated dynasty editorial - Top-150 dynasty rankings and Top-70 rookie dynasty rankings refreshed monthly with rationale (upside, role, age, draft capital).
2. **IA / nav:** SEO/content-led - NBA > Fantasy Basketball Advice > Rankings, Dynasty Rankings, Dynasty Rookie Rankings, Sleepers, Waiver Wire, plus Betting/Props/DFS. A Trade Analyzer exists but dynasty output is written rankings.
3. **Pricing:** Freemium; "Big-4" Premium Pass bundles Betting/Props/DFS (promoted 50% off).
4. **Mobile:** Responsive, ad-heavy; no native app.
5. **Feature most worth stealing:** **Separate, always-current rookie/draft-class dynasty rankings** - a low-cost engagement magnet, since dynasty managers obsess over incoming rookies and future picks.

---

### 2B. Dynasty Football tools (studied for UX patterns to steal)

#### KeepTradeCut (keeptradecut.com) - the crowdsourced mechanic
1. **Does well:** Turns a low-effort, addictive micro-game into a continuously-updated market. **The mechanic:** users see three players and answer "Keep one, Trade one, Cut one" _in a vacuum_. Each answer is decomposed into pairwise preferences ("owner values Player 1 > Player 2"); one 3-player vote yields multiple data points. Values are computed with an **adapted ELO algorithm** tuned so numeric gaps reflect stud scarcity, not just ordinal rank. A **"contribute-to-consume" loop** requires you to vote periodically to see updated rankings - guaranteeing fresh data. Planted "test" votes with obvious answers detect bad actors. Superflex and 1QB are **two parallel value databases**.
2. **IA / nav:** Dynasty Rankings (1QB/SF toggle), Rookie Rankings, Trade Calculator, Trade Database, Waiver Database, the Keep-Trade-Cut voting game, League Power Rankings, positional rankings.
3. **Pricing:** **100% free by design** - a paywall would kill contribution volume; donations cover servers.
4. **Mobile:** Responsive web, no dedicated native app surfaced.
5. **Pattern most worth stealing:** The **contribute-to-consume 3-way vote → ELO engine**. It solves the cold-start data problem cheaply and keeps values live - the single most transferable mechanic to NBA dynasty.

#### FantasyCalc (fantasycalc.com) - values from real executed trades
1. **Does well:** Values "algorithmically generated from hundreds of thousands of real trades" (running counter ~2.6M) - actual completed transactions run through an optimization algorithm that solves for the values that best explain which trades actually cleared. A **revealed-preference** story ("what managers _did_, not what pundits _say_"). Values re-fit to your scoring/roster/format; league import; auto-updates multiple times daily; offers a **public API**.
2. **IA / nav:** Rankings (redraft + dynasty, SF/1QB), Trade Calculator, Trade Database, league sync. Clean, single-purpose surfaces.
3. **Pricing:** Effectively free; donations + API, no prominent consumer premium tier.
4. **Mobile:** Web-first, responsive; API enables third-party embedding.
5. **Pattern most worth stealing:** **Revealed-preference valuation from executed trades**, paired with a **public values API** as a distribution wedge. (Contrast worth internalizing: KTC = _stated_ preference; FantasyCalc = _revealed_ preference. The best product fuses both.)

#### Dynasty Daddy (dynasty-daddy.com) - open source
1. **Does well:** All-in-one **aggregator** - its explicit purpose is to "eliminate toggling between multiple websites." It doesn't generate its own values; it ingests KTC/FantasyCalc/FantasyPros and ties them to your live league rosters, then layers analytics. Broadest platform support (ESPN, Yahoo, Sleeper, MFL, Fleaflicker, Fantrax, FFPC). Stack (public GitHub, source-available; confirm license): Angular + Node/Express + PostgreSQL + a Python daily-scrape cron.
2. **IA / full feature set:** Trade Calculator, **Power Rankings**, **Trade Finder** (one-click fair trades from league rosters), Trade Database (3.6M+ trades), **Playoff Simulator** (10k+ Monte Carlo sims), Start/Sit optimizer, Advanced Player Comparison (query-builder), team valuation, draft breakdowns.
3. **Pricing:** Core free; Premium via **Patreon $6/mo**.
4. **Mobile:** Responsive web ("mobile/tablet/desktop optimized"); no native app.
5. **Pattern most worth stealing:** The **aggregator + league-tie-in** model and specifically the **Trade Finder** - "one-click generate fair trades from your league" flips the product from passive lookup to active suggestion engine.

#### DynastyProcess (dynastyprocess.com) - open data + published methodology
1. **Does well:** Radical transparency and reusable infrastructure - the "developer/analyst layer" of dynasty. Publishes open CSVs including **`db_playerids.csv`, a cross-platform player-ID crosswalk** (maps IDs across Sleeper/MFL/ESPN - quietly the most valuable asset here), FantasyPros ECR, and player/pick `values.csv`. **Transparent value formula:** `Value = 10500 * e^(FP_ECR * -0.0235)` with a user-tunable elite-vs-depth curve. Rookie-pick values from blended GAM models with **future picks discounted to ~80%** (present-value logic). Ships R packages (`ffopportunity`, `ffsimulator`).
2. **IA / nav:** Market Values, Trade Calculator, Personal Rankings, Crystal Ball (standings projection), Blog (methodology), GitHub org.
3. **Pricing:** Entirely **free and open**.
4. **Mobile:** Web/Shiny apps + downloadable data; a data layer, not a mobile consumer product.
5. **Pattern most worth stealing:** **A transparent, tunable value formula + an owned cross-platform player-ID crosswalk.** The ID map is foundational infrastructure; the user-adjustable value curve (elite-vs-depth slider) is a cheap, high-trust UX feature that black-box competitors can't match.

#### Sleeper (mobile app) - IA & trade flow
1. **Does well:** Best-in-class mobile-native, ad-free, social-first experience; the trade flow is engineered to remove friction.
2. **IA / nav:** Swipe-based panels; the **Trade Center is a dedicated panel reached by swiping right** anytime. Trades can be **initiated from almost anywhere** - a manager's roster, a player card, league rosters, or the trade block.
3. **Trade flow:** Two-way interest system - list your own players on a **trade block** AND flag players you want, so the app surfaces _demand_ for your assets. Build offers from any player card; add draft picks/FAAB. From the Trade Center: **accept / decline / counter**, where counter is **edit-in-place** (tinker with the current offer, no rebuild). Offers can carry a **self-destruct countdown timer**.
4. **Pricing:** Free, no ads; revenue is adjacent (Wallet / prize leagues).
5. **Pattern most worth stealing:** **Initiate-a-trade-from-anywhere + edit-in-place counter-offers**, plus the **two-way trade block** (list what you're shopping AND what you want) that turns trading into matchmaking rather than cold outreach.

---

### 2C. Direct competitor - Citadel (dynasty FOOTBALL companion; we build the basketball analogue)

_URL: citadel-git-design-system-review-…vercel.app - a design-system-review deployment (prototype). No pricing shown. Inspected live at a 375×812 mobile viewport across all four routes._

**What it is:** "The ultimate dynasty football companion." Enter a Sleeper username; it "prices every asset, grades every trade, and scouts every rival in your league." Four routes: **Home, Rankings, Trade, Methodology.**

**What's genuinely strong (worth learning from):**
- **Methodology page is excellent and is the core IP.** Values are computed by fusing **three sources** - real executed trades (FantasyCalc-style), crowd head-to-head votes (KTC-style), and expert rankings - onto a common latent scale, then a 10-stage pipeline: calibrate each source as an imperfect instrument of one latent value, combine with equal voices, **Gaussian-mixture tiers chosen by BIC**, **5-day-half-life exponential smoothing**, Superflex/PPR handled via measured multipliers, pick valuation "priced by who owes them," backtested against completed real-world trades, Monte-Carlo playoff odds, and a **consolidation premium measured from real trades** in trade grading. This is a best-practice blueprint - and it depends on data sources that **do not yet exist for the NBA**.
- Rankings has clean filters (Superflex/1QB toggle, position filter, search) and the copy promises every value "ships with its tier, its spread, and its range."
- Trade page stacks Side A / Side B vertically (correct for mobile) with an Evaluate CTA.

**What its navigation gets WRONG for mobile (specific, observed):**
1. **Navigation is hidden behind a floating toggle.** On mobile the nav collapses to a single floating button ("Open navigation. Current page: Home") plus a lone floating pill showing only the current page. **You must tap the toggle before Rankings/Trade/Methodology are even visible - two taps to navigate anywhere.** This is a bottom-tab-bar problem solved wrongly.
2. **When expanded, all four items cram into one horizontal pill** (Home · Rankings · Trade · Methodology), text-only, no icons, with "Methodology" running to the screen edge - tight tap targets on a 375px width.
3. **The floating action button (FAB) collides with real content on every page.** On Home it overlaps the yellow **"Import"** submit button; on Rankings it overlaps row 1 (Josh Allen's value); on Trade it overlaps the **Side B** header and hides Side B's value counter; on Methodology it sits on top of body text in stage 01.
4. **The floating nav pill occludes scrolling content.** On Rankings it covers row 9; on Methodology it sits directly on top of stage-03 body text ("…the two markets [pill] apart their values…") - persistent, unavoidable while reading.
5. **The Rankings table overflows the viewport and clips the VALUE column** - Josh Allen renders as "11,66" (truncated), and the promised **"spread" and "range" columns simply don't fit / aren't shown on mobile.** A wide table was ported to mobile without a card/stacked treatment.
6. **Poor vertical density / dead space.** The Home hero + input occupy the top third; ~60% of the screen below is empty gray. The username input didn't even render until an interaction on first load.

**Net:** Citadel has strong _content and methodology thinking_ but a **mobile IA that fights the user** - hidden nav, colliding floating overlays, and desktop tables clipped on phones. For a mobile-first PWA, this is the exact set of mistakes to avoid: use a real fixed bottom tab bar with icons + labels, never float overlays on top of content, and render rankings as stacked cards (not clipped tables) on phones.

---

## 3. Feature matrix

Legend: ● = yes / strong · ◐ = partial / hybrid / editorial-only · ○ = no / not surfaced

| Tool | Crowdsourced values | Values from real trades | Trade calculator/analyzer | Dynasty rankings | Rookie/pick valuation | League import | Trade-partner match / finder | Native mobile app | Open data/API | Pricing |
|---|---|---|---|---|---|---|---|---|---|---|
| **Hashtag Basketball** | ◐ (blended) | ○ | ● | ● | ◐ | ● | ○ | ○ | ○ | $2.50/mo |
| **Basketball Monster** | ○ | ○ | ● (Trade Monster) | ◐ (DURANT) | ◐ | ● | ○ | ○ | ○ | ~$10-30/mo |
| **Fantrax** | ○ | ○ | ● (league) | ○ | ● (picks 10yr, multi-team) | n/a (is the league) | ○ | ● (~4.8★) | ○ | Free / ~$80-130/season |
| **Yahoo Fantasy NBA** | ○ | ○ | ● | ◐ | ○ | n/a (is the league) | ● (top-3 partners) | ● (benchmark) | ○ | Free / $2.92/mo (Fantasy+) |
| **RotoWire NBA** | ○ | ○ | ● | ◐ (editorial) | ◐ | ● | ○ | ○ | ○ | Subscription |
| **RotoBaller NBA** | ○ | ○ | ◐ | ◐ (editorial) | ● (rookie boards) | ○ | ○ | ○ | ○ | Freemium |
| **Court Consensus (NBA)** | ● (Best/Mid/Worst → ELO) | ○ | ● | ● | ● (picks) | ◐ (new) | ○ | ○ | ○ | Free (not disclosed) |
| **Dynatyze (NBA)** | ◐ (10% crowd ELO) | ○ | ● | ● | ● | ● | ○ | ○ | ○ | Free/freemium |
| **KeepTradeCut (NFL)** | ● (Keep/Trade/Cut → ELO) | ○ | ● | ● | ● | ● | ○ | ○ | ○ | Free |
| **FantasyCalc (NFL)** | ○ | ● | ● | ● | ● | ● | ○ | ○ | ● (API) | Free |
| **Dynasty Daddy (NFL)** | ◐ (ingests KTC) | ◐ (ingests) | ● | ● | ● | ● (7 platforms) | ● (Trade Finder) | ○ | ● (open source) | Free / $6/mo |
| **DynastyProcess (NFL)** | ○ | ○ | ● | ● | ● (PV-discounted) | ◐ | ○ | ○ | ● (open data + crosswalk) | Free |
| **Sleeper (NFL/NBA)** | ○ | ○ | ● (in-league) | ○ | ● | n/a (is the league) | ◐ (two-way block) | ● (best-in-class) | ● (public API) | Free |
| **Citadel (NFL competitor)** | ◐ (fuses 3 sources) | ◐ (fuses) | ● | ● (tier/spread/range) | ● | ● (Sleeper) | ◐ (rival scouting) | ○ (web/PWA) | ○ | n/a (prototype) |

_Note: No competitor in this matrix offers a decision ledger, revealed-vs-stated strategy analysis, manager behavioral dossiers, or an adversarial LLM analyst - the entire right-hand behavioral column is empty across the market._

---

## 4. THE BASKETBALL VALUE-SOURCE VERDICT

**Verdict: Hypothesis REFUTED - a KeepTradeCut-for-NBA does exist (several, in fact), BUT none has KTC-scale liquidity, and the FantasyCalc "real executed trades" model is entirely unoccupied for the NBA.**

**Tier 1 - true KTC-style crowdsourced NBA value sites (these refute the hypothesis):**
- **Court Consensus (courtconsensus.com)** - the clearest KTC-for-NBA. Users "rank them: Best, Mid, or Worst based on general dynasty league settings" (a ternary comparative vote - KTC's mechanic generalized). "Your votes combine with the community to establish player values." Runs an **ELO system** ("Biggest ELO changes over the last 30 days"), has a **Trade Calculator** (players + future picks), Rankings, League Import, and a Trade Database; dynasty-basketball exclusive. Referenced by the "Know Ball Dynasty" podcast and used in r/dynastybball. **Caveat:** the homepage "Data Points Collected" counter rendered as **"0"** on direct fetch - strongly implying low maturity / thin vote volume, not KTC-scale.
- **chooseyourhooper.com** (GitHub: `wkraz/dynasty-basketball`) - an explicit open-source KTC clone: "rankings are fully crowdsourced," with a trade calculator and a "**Keep/Trade/Cut game**." Clearly hobbyist/early (single maintainer, ~0 stars).

**Tier 2 - hybrids with a real crowd-voting component (partial equivalents):**
- **Dynatyze (dynatyze.com/basketball)** - most sophisticated; values "blend **90% expert consensus with 10% crowd ELO**," K-means tiers, daily refresh, league import, and a "Hype Gap" (crowd sentiment vs analytics). Real crowd voting exists but is a minority input. (Direct fetch returned HTTP 502 at time of writing; existence/methodology corroborated via search.)
- **OneNumberHoops (onenumberhoops.com)** - "Expert rankings meet community sentiment - all in one number," with a real-time trade calculator. Methodology not fully disclosed.
- **Hashtag Basketball Dynasty Trade Calculator** - blends its own dynasty rankings with "crowd-sourced trade values" reflecting "actual dynasty league behavior."

**What does NOT exist / does NOT qualify:**
- **FantasyCalc has no NBA product** - football-only. The revealed-preference "values from real executed trades" approach is a **wide-open lane for the NBA**.
- **KeepTradeCut itself appears football-only** - all live URLs are NFL; claims that "KTC added basketball" trace only to low-quality SEO blogs and could not be confirmed on keeptradecut.com. Treat "KTC does NBA" as false/unverified.
- **DynastyProcess, FantasyPros, Basketball Monster, RotoWire, RotoBaller** for basketball are editorial/expert-consensus or projection-model - **not head-to-head crowdsourcing**, so they don't qualify.

**Strategic read:** The category is **not empty, but immature and fragmented, with no entrenched high-liquidity leader** the way KTC dominates dynasty football. Open lanes a new entrant can own: (1) a **real-executed-trades valuation model** (nobody does FantasyCalc-for-NBA); (2) **achieving trustworthy vote/trade liquidity** (every current NBA crowd tool appears thin); (3) deep **league-platform import integrations**; and above all (4) the **behavioral/decision-intelligence layer none of them touch.** Building our own valuation model is still defensible - but we should **treat Court Consensus and Dynatyze as live benchmarks to beat, not as proof of a category we're inventing.** Recommended next step: a hands-on audit of Court Consensus's and Dynatyze's actual value quality and vote volume before finalizing our valuation approach.

_Evidence caveat: most of these are JS SPAs that partially blocked automated fetching, and Reddit was not directly fetchable, so the **scale/maturity** reads are inferred from snippets and secondary references; the **existence and methodology** findings are solid and cross-confirmed by two independent research passes plus direct fetches of Court Consensus and searches surfacing all named tools._

---

## 5. Ranked v1 feature list (what to build first)

Our differentiators are behavioral; table stakes are the price of entry. Sequence table stakes first only far enough to make the differentiators legible, then ship what no one else has.

**Tier 0 - Foundation (must exist before anything, weeks 1-4)**
1. **Sleeper + Fantrax league import & sync** (transaction history is the fuel for every differentiator; Fantrax is where dynasty NBA lives, Sleeper is the UX benchmark). Build/own an **NBA cross-platform player-ID crosswalk** first (steal from DynastyProcess's playbook).
2. **Roster view** - mobile-first, stacked cards (never clipped tables; explicitly avoid Citadel's Rankings mistake).
3. **Asset values + dynasty rankings** - a transparent, tunable baseline value model (start expert/projection-derived with a user elbow of an **elite-vs-depth curve slider**, à la DynastyProcess) so we're not blocked on crowd liquidity. Show tier + range.
4. **Trade evaluator** - Side A/Side B stacked, edit-in-place, with a **consolidation premium** (stars > quantity), mirroring Citadel's grading logic.

**Tier 1 - The differentiators (the reason to exist, weeks 5-12)**
5. **Decision Ledger** - at every transaction (add/drop/trade/hold), capture the user's stated reasoning in-flow (fast, one-tap tags + optional free text). This is the unique data asset; build the capture UX before anything downstream. Trigger it automatically off the league-sync transaction feed.
6. **Adversarial LLM "Analyst"** over the user's full history - the most demoable differentiator and the one that makes the ledger immediately rewarding. Ship read-only Q&A + proactive "your reasoning last month vs. what happened" callouts.
7. **Revealed-vs-Stated Strategy engine** - infer actual behavior (contending vs rebuilding, risk appetite, position bias) from transaction history and contrast it with what the user _says_ in the ledger. Depends on 1 + 5.
8. **Manager Dossiers** - behavioral profiles of leaguemates from public league transaction history (trade cadence, positional tendencies, over/under-pays, contender/rebuilder). Naturally pairs with a **trade-partner matcher** (steal Yahoo's "top-3 partners" + Sleeper's two-way trade block as the UX).

**Tier 2 - Engagement & moat (post-v1)**
9. **Crowdsourced value voting (KTC-style Keep/Trade/Cut → ELO)** with contribute-to-consume - deferred deliberately (see §6): only worth it once we have enough users to reach liquidity Court Consensus lacks. Until then, our values are model-derived.
10. **Rookie/draft-pick board** with present-value discounting for future picks (cheap engagement magnet; steal RotoBaller + DynastyProcess).
11. **Playoff/standings Monte-Carlo simulator** (parity with Dynasty Daddy/Citadel; not a differentiator).

**Non-negotiable UX rules for v1 (lessons from Citadel):** real fixed bottom tab bar with icon + label (Home / Roster / Trade / League / Analyst); **no floating overlays that occlude content**; rankings as stacked cards, never clipped tables; every player card is a trade/ledger entry point (Sleeper pattern).

---

## 6. What we are deliberately NOT building (and why)

1. **Not a league-hosting platform.** Fantrax and Sleeper own hosting/transactions and have a decade head start; we integrate with them, we don't replace them. We're a companion.
2. **Not a crowdsourced value engine at launch.** A crowd vote is worthless without liquidity - Court Consensus shows "0 data points" and every NBA crowd tool is thin. We ship a transparent model-derived value instead, and only add KTC-style voting once our user base can actually reach trustworthy volume. Chasing it early would burn effort on a cold-start we can't win yet.
3. **Not a FantasyCalc-style real-executed-trades model in v1.** It's the most attractive _empty_ lane, but it needs large volumes of ingested completed NBA trades to be credible - a chicken-and-egg we can't solve at launch. Flag it as a v2 moat once league-sync volume exists.
4. **Not projection/DFS/streaming tooling.** Basketball Monster and Hashtag own daily projections, schedule grids, and lineup optimizers. That's a different (redraft/daily) audience and a feature arms race we'd lose. Dynasty decision-making is our lane.
5. **Not editorial content / rankings articles.** RotoWire and RotoBaller own SEO editorial. We are a tool, not a publisher; our "content" is generated from the user's own data by the LLM analyst.
6. **Not a native iOS/Android app in v1.** Mobile-first **PWA** only - faster iteration, one codebase, installable. Native can follow if retention justifies it; Fantrax's dated native app shows native ≠ good.
7. **Not multi-sport at launch.** Hashtag's four-site bundle is a distraction pattern for us. Win dynasty _basketball_ (the underserved, un-consolidated market) before diluting focus.
8. **Not a black-box valuation.** We publish our methodology and expose a tunable value curve (DynastyProcess-style). Transparency is cheap trust and a wedge against opaque competitors - building an unexplainable model would forfeit that.
