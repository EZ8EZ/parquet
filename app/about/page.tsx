/**
 * THE FRONT DOOR - what a first-time reader needs before any other page makes sense.
 *
 * This app was built by one manager for his own league, and its strongest surfaces
 * assume the reader already knows what a "revealed strategy" is and what a TCI of 62
 * means. This page is where that assumption gets paid off for everyone else: what the
 * app is FOR, who "you" refers to, what the two proprietary indexes measure and
 * refuse to measure, and why nothing here carries a grade.
 *
 * Deliberately static: it makes no claims that need live data, so it should load
 * instantly and identically for a visitor whose league hasn't even been fetched yet.
 * The honesty caveats are the pitch, not the fine print - "a torn-down roster scores
 * mid-pack because there is nothing left to fail" earns more trust than any
 * confident number would (see DECISIONS D19/D23/D24 for the record behind each one).
 */
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader, Card, SectionHeader } from "@/components/ui";

export default function AboutPage() {
  return (
    <div>
      <PageHeader
        kicker="Parquet"
        title="A memory, not a stat site"
        subtitle="What this app is for, what its two indexes measure, what they refuse to measure, and why nothing here gets a grade."
      />

      <Card>
        <p className="text-sm leading-relaxed text-ink">
          Dynasty leagues run for years, and the platform remembers everything
          except the part that matters: <span className="font-semibold">why</span>.
          Every trade survives forever in the transaction log. The reasoning that
          felt so obvious at the time survives about a month.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Parquet keeps both. The record comes from the league itself. The
          reasoning is written down in the decision ledger at the moment of
          conviction, before memory rewrites it. The app&apos;s one real trick is
          holding the two next to each other and telling you when they disagree.
          It is built for self-knowledge, not for advice: most tools tell you
          what to do next, this one shows you what you actually do. Who you
          overpay. How long you really hold players. Whether your trades match
          your stated plan. What you change is up to you.
        </p>
      </Card>

      <SectionHeader title={'Who "you" is'} />
      <Card>
        <p className="text-sm leading-relaxed text-muted">
          Every page speaks to one manager at a time, and{" "}
          <span className="font-semibold text-ink">
            &quot;you&quot; means whoever is in the chair
          </span>
          . Pick a team on the Teams page and the whole app re-reads itself around
          that manager: their roster, their revealed strategy, their read on
          everyone else. Look through your own team and Parquet is a mirror. Look
          through a rival&apos;s and it is a scouting report. A headline like
          &quot;You said win-now. You sold.&quot; is aimed at the chair, not at
          whoever happens to be holding the phone.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Switching chairs is public and free, because every number it moves is
          league data anyone can already read. Writing is the one thing it does not
          hand you: if your commissioner has turned on{" "}
          <span className="font-semibold text-ink">seats</span>, capturing reasoning
          in the decision ledger needs a seat of your own, claimed once from a
          private link, so a note is always signed by whoever actually wrote it.
        </p>
        <Link
          href="/teams"
          className="mt-1 inline-flex min-h-11 items-center gap-0.5 text-xs font-semibold text-accent"
        >
          Pick your team
          <ChevronRight size={13} aria-hidden="true" />
        </Link>
      </Card>

      <SectionHeader title="The two numbers you haven't seen before" />
      <Card>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
          TCI · Timeline Coherence Index{" "}
          <span className="font-mono normal-case tracking-normal text-faint">
            (0-100)
          </span>
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Every asset on a dynasty roster is a claim on production at some point
          in time: a 21-year-old pays off later, a 33-year-old pays off now, a
          far-out first pays off after that. TCI measures whether a roster&apos;s
          assets <span className="font-semibold text-ink">agree about when</span>.
          High means the roster is one plan. Low means it is two teams sharing a
          logo.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          <span className="font-semibold text-ink">
            What it deliberately does not measure:
          </span>{" "}
          whether the plan is any good. TCI is direction-free. A committed rebuild
          and a committed title push both score high, because the index measures
          whether you have a plan, not whether we approve of it. The only reading
          it calls bad is straddling: a win-now star next to a stack of far-out
          firsts, where neither timeline is being served.
        </p>
      </Card>

      <Card className="mt-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
          RFI · Roster Fragility Index{" "}
          <span className="font-mono normal-case tracking-normal text-faint">
            (0-100, higher is more fragile)
          </span>
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          If your most load-bearing player&apos;s knee went on a Tuesday night,
          how much of your season goes with it? RFI deletes each player, re-solves
          the best legal lineup out of who is left, and measures what broke. Add
          how concentrated the roster&apos;s value is and how much of it sits in
          bodies that miss games, and you have the index.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          <span className="font-semibold text-ink">
            What it deliberately does not measure:
          </span>{" "}
          quality. Low fragility is not the same as good. A torn-down roster with
          nothing to lose scores mid-pack, because there is nothing left to fail.
          Uniformly weak is robustly weak, and the index says so rather than
          pretending otherwise. Picks are excluded too: a future first cannot fill
          a lineup slot tonight, so it cannot make this season less fragile.
        </p>
      </Card>

      <p className="mt-2 text-[11px] leading-relaxed text-faint">
        Both numbers are built from one roster&apos;s own assets, so neither moves
        when somebody else trades, and both read the roster as it stands tonight.
        The words beside them are the league-relative part:
        &quot;brittle&quot; and &quot;contending&quot; come from where a roster sits
        against the other thirteen on your schedule.
      </p>

      <SectionHeader title="Why nothing gets a grade" />
      <Card>
        <p className="text-sm leading-relaxed text-muted">
          Every trade tool on the market will stamp your deal with a letter.
          Parquet refuses, on purpose. A grade is a verdict handed down by a model
          that cannot see your timeline, your league&apos;s scoring, or the chair
          you are sitting in, and it ends the conversation exactly where it should
          start. What you get instead is{" "}
          <span className="font-semibold text-ink">a thesis</span>: what each side
          is betting on, the single assumption that has to hold for your side to
          be right, and what your own history says about this kind of bet. If the
          assumption reads wrong to you, the trade is wrong for you, whatever any
          letter would have said.
        </p>
      </Card>

      <SectionHeader title="What the numbers refuse to know" />
      <Card>
        <p className="text-sm leading-relaxed text-muted">
          The fastest way to lose your trust would be one invented number, so the
          gaps are named instead of filled:
        </p>
        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-muted">
          <Refusal>
            Commissioner-executed trades arrive from the platform with no pick
            record. A version of this app inferred those picks; tested against a
            real league, it attributed six unrelated pick moves to one deal, so it
            was deleted. Anything still inferred is labeled &quot;(inferred)&quot;.
          </Refusal>
          <Refusal>
            Trade value added counts players only, because picks are missing from
            exactly those trades. The bias is stated where the number appears: a
            manager who sold picks looks worse than they were, a buyer better.
          </Refusal>
          <Refusal>
            The performance awards are scored with hindsight, at today&apos;s
            values rather than what was knowable at the time, and each one says so
            in its own subtitle.
          </Refusal>
          <Refusal>
            No value history is stored, so nothing here charts a trend it would
            have to invent. The one trajectory line in the app is the published
            age curve projected forward, labeled as exactly that.
          </Refusal>
        </ul>
      </Card>

      <p className="mt-5 text-center text-[11px] leading-relaxed text-faint">
        The math behind every value, every curve, every constant is public on the{" "}
        <Link
          href="/methodology"
          className="font-semibold text-muted underline-offset-2 hover:text-accent hover:underline"
        >
          methodology page
        </Link>
        . If a number in this app cannot explain itself, that is a bug.
      </p>
    </div>
  );
}

function Refusal({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span
        aria-hidden="true"
        className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
      />
      <span>{children}</span>
    </li>
  );
}
