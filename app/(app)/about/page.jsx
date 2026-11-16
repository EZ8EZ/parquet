/**
 * THE FRONT DOOR - what a first-time reader needs before any other page makes sense,
 * on one screen.
 *
 * Kept as its own page rather than merged into /methodology, on purpose: this page
 * is static and makes no claim that needs live data, so it loads instantly for a
 * visitor arriving from the team picker whose league has not been fetched yet, while
 * /methodology assembles the whole corpus to print its live counts. Merging would
 * make the front door wait on the heaviest page in the app. So /about says what the
 * app is in one line, links each idea into its section of /methodology, and keeps
 * the product-level explanations (who "you" is, streaks vs superlatives, why no
 * grades, what the numbers refuse to know) behind Disclosures. Their substance is
 * unchanged; the record behind each is in DECISIONS D19/D23/D24/D113.
 */
import { BarChart3, Clock, Gauge, ShieldAlert, Timer, Trophy } from "lucide-react";
import { ButtonLink, Disclosure, List, ListRow, PageHeader, SectionHeader } from "@/components/ui";
import { Onward } from "@/components/Onward";

const IDEAS = [
  { href: "/methodology#formula", icon: BarChart3, title: "How a value is priced", meta: "Market rank, bent by age, injury, role, position" },
  { href: "/methodology#timelines", icon: Clock, title: "TCI, timeline coherence", meta: "Do a roster's assets agree about when? 0-100" },
  { href: "/methodology#fragility", icon: Gauge, title: "RFI, roster fragility", meta: "What breaks if one player goes down. 0-100" },
  { href: "/methodology#picks", icon: Trophy, title: "Pick prices", meta: "By overall slot, spread over the lottery" },
  { href: "/methodology#lockin", icon: Timer, title: "Lock-in numbers", meta: "Expected if held, chance a later game beats it" },
];

export default function AboutPage() {
  return (
    <div>
      <PageHeader
        kicker="Parquet"
        title="A memory, not a stat site"
        subtitle="Your league's record and your reasoning, side by side."
      />
      <ButtonLink href="/teams" block>
        Pick your team
      </ButtonLink>

      <SectionHeader title="The numbers" href="/methodology" cta="Methodology" />
      <List>
        {IDEAS.map(({ href, icon: Icon, title, meta }) => (
          <li key={href}>
            <ListRow
              href={href}
              avatar={<Icon size={20} aria-hidden="true" className="text-accent-text" />}
              title={title}
              meta={meta}
            />
          </li>
        ))}
      </List>

      <SectionHeader title="The ground rules" />
      <div className="rounded-card bg-surface px-4">
        <Disclosure summary="What Parquet is for" bodyClassName="space-y-2 bg-transparent px-0 pt-0 text-body">
          <p>
            Dynasty leagues run for years, and the platform remembers everything except
            the part that matters: <span className="font-semibold text-ink">why</span>.
            Every trade survives forever in the transaction log. The reasoning that felt
            so obvious at the time survives about a month.
          </p>
          <p>
            Parquet keeps both. The record comes from the league itself. The reasoning is
            written down in the decision ledger at the moment of conviction, before memory
            rewrites it, and the app holds the two next to each other and tells you when
            they disagree. It is built for self-knowledge, not for advice: it shows you
            what you actually do. What you change is up to you.
          </p>
        </Disclosure>
        <Disclosure summary={'Who "you" is'} bodyClassName="space-y-2 bg-transparent px-0 pt-0 text-body" className="border-t border-border">
          <p>
            Every page speaks to one manager at a time, and{" "}
            <span className="font-semibold text-ink">&quot;you&quot; means whoever is in the chair</span>.
            Pick a team and the whole app re-reads itself around that manager: their
            roster, their revealed strategy, their read on everyone else. Look through
            your own team and Parquet is a mirror; look through a rival&apos;s and it is a
            scouting report.
          </p>
          <p>
            Switching chairs is public and free, because every number it moves is league
            data anyone can already read. Writing is the one thing it does not hand you:
            if your commissioner has turned on <span className="font-semibold text-ink">seats</span>,
            capturing reasoning in the ledger needs a seat of your own, claimed once from
            a private link, so a note is always signed by whoever wrote it.
          </p>
        </Disclosure>
        <Disclosure summary="Still running vs. settled" bodyClassName="bg-transparent px-0 pt-0 text-body" className="border-t border-border">
          <span className="font-semibold text-ink">Streaks</span> are yours and still
          moving: most get longer with nothing but the passing of a day, and they can be
          alive, at risk, or broken. <span className="font-semibold text-ink">Superlatives</span>{" "}
          are the opposite: one winner each, ranked against the whole league, settled
          until more history happens. That is why a streak prints the moment it was
          counted to and an award does not.
        </Disclosure>
        <Disclosure summary="Why nothing gets a grade" bodyClassName="bg-transparent px-0 pt-0 text-body" className="border-t border-border">
          A grade is a verdict from a model that cannot see your timeline, your
          league&apos;s scoring, or the chair you are sitting in, and it ends the
          conversation where it should start. What you get instead is{" "}
          <span className="font-semibold text-ink">a thesis</span>: what each side is
          betting on, the single assumption that has to hold for your side to be right,
          and what your own history says about this kind of bet.
        </Disclosure>
        <Disclosure
          summary="What the numbers refuse to know"
          icon={<ShieldAlert size={16} className="text-secondary" />}
          bodyClassName="bg-transparent px-0 pt-0 text-body"
          className="border-t border-border"
        >
          <ul className="list-disc space-y-2 pl-5 marker:text-accent-text">
            <li>
              Commissioner-executed trades arrive with no pick record. A version of this
              app inferred those picks; tested against a real league, it attributed six
              unrelated pick moves to one deal, so it was deleted. Those deals are marked
              &quot;no pick record&quot; instead.
            </li>
            <li>
              Trade value added counts players only, because picks are missing from
              exactly those trades. The bias is stated where the number appears: a manager
              who sold picks looks worse than they were, a buyer better.
            </li>
            <li>
              The performance awards are scored with hindsight, at today&apos;s values, and
              each one says so in its own subtitle.
            </li>
            <li>
              No value history is stored, so nothing here charts a trend it would have to
              invent. The one trajectory line is the published age curve projected
              forward, labeled as exactly that.
            </li>
            <li>
              TCI is direction-free and does not judge whether the plan is any good; RFI
              is not a quality score, and the most torn-down rosters get no RFI at all
              rather than a figure read from too little.
            </li>
          </ul>
        </Disclosure>
      </div>
      <Onward from="/about" />
    </div>
  );
}
