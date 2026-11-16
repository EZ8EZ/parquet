import { AlertTriangle, Check, Inbox, Info, TrendingUp, X } from "lucide-react";
import {
  BarList,
  Button,
  ButtonLink,
  Card,
  Chip,
  Disclosure,
  EmptyState,
  List,
  ListRow,
  PageHeader,
  SectionHeader,
  Segmented,
  Sheet,
  RankStrip,
  SkeletonHeader,
  SkeletonRows,
  SkeletonStat,
  SkeletonStats,
  SkeletonTabs,
  StatTile,
  Tabs,
} from "@/components/ui";
import { Onward } from "@/components/Onward";

export const metadata = { title: "Design system - Parquet" };

const SWATCHES = [
  ["bg", "bg-bg"],
  ["surface", "bg-surface"],
  ["surface-2", "bg-surface-2"],
  ["elevated", "bg-elevated"],
  ["accent", "bg-accent"],
  ["positive", "bg-positive"],
  ["negative", "bg-negative"],
  ["info", "bg-info"],
  ["warn", "bg-warn"],
];

const TYPE = [
  ["hero 44", "text-hero font-bold", "26,641"],
  ["display 28", "text-display font-bold", "Page title"],
  ["lede 17", "text-lede font-semibold", "Section title"],
  ["body 14", "text-body", "Body copy and row titles"],
  ["note 13", "text-note text-muted", "Secondary lines and disclosures"],
  ["meta 12", "text-meta text-secondary", "Labels and captions"],
  ["micro 11", "text-micro text-secondary", "Tab labels and axis ticks only"],
];

function Avatar({ initials }) {
  return (
    <span className="flex size-9 items-center justify-center rounded-full bg-elevated text-meta font-bold text-muted">
      {initials}
    </span>
  );
}

export default function DesignPage() {
  return (
    <div>
      <PageHeader kicker="Menu" title="Design system" subtitle="Every primitive, in every variant. Spec: DESIGN.md." />

      <Tabs
        label="Design system"
        items={[
          { id: "found", label: "Foundations", content: (
            <>
      <SectionHeader className="mt-2" title="Colour" />
      <div className="grid grid-cols-3 gap-2">
        {SWATCHES.map(([name, cls]) => (
          <div key={name} className="rounded-control bg-surface p-2">
            <span className={`block h-8 rounded-sm ${cls}`} />
            <span className="mt-1 block text-meta text-secondary">{name}</span>
          </div>
        ))}
      </div>

      <SectionHeader title="Type" />
      <Card className="space-y-2">
        {TYPE.map(([name, cls, sample]) => (
          <div key={name} className="flex items-baseline justify-between gap-3">
            <span className={`min-w-0 figure ${cls}`}>{sample}</span>
            <span className="shrink-0 text-meta text-secondary">{name}</span>
          </div>
        ))}
      </Card>

      <SectionHeader title="Cards" />
      <div className="grid grid-cols-2 gap-2">
        <Card>default</Card>
        <Card tone="raised">raised</Card>
        <Card tone="accent">accent (yours)</Card>
        <Card tone="sunken">sunken</Card>
      </div>

            </>
          ) },
          { id: "data", label: "Data", content: (
            <>
      <SectionHeader className="mt-2" title="Stat tiles" />
      <StatTile label="Total value" value="26,641" sub="9th of 14 rosters" size="hero" tone="accent" />
      <div className="mt-2 grid grid-cols-3 gap-2">
        <StatTile label="Record" value="1-2" sub="9th of 14" />
        <StatTile label="Core age" value="28.4" delta={1.2} sub="veteran core" />
        <StatTile label="Picks" value="7" href="/design" sub="tile as link" />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <StatTile size="sm" label="size sm" value="12.4" sub="secondary figure" />
        <StatTile size="sm" label="Value rank" value="9th" visual={<RankStrip rank={9} of={14} />} />
        <StatTile size="sm" label="Points" value="566" delta={-14} deltaTone="negative" />
      </div>

      <SectionHeader title="Chips" />
      <div className="flex flex-wrap gap-2">
        <Chip>Neutral</Chip>
        <Chip tone="accent">You</Chip>
        <Chip tone="positive" icon={Check}>Healthy</Chip>
        <Chip tone="negative" icon={X}>Out</Chip>
        <Chip tone="warn" icon={AlertTriangle}>Questionable</Chip>
        <Chip tone="info" icon={Info}>Field</Chip>
        <Chip tone="accent" size="sm">small</Chip>
      </div>

      <SectionHeader title="List rows" href="/design" cta="See all" />
      <List>
        <li>
          <ListRow href="/design" leading="1" avatar={<Avatar initials="FC" />} title="Flick the Clint" meta="3-0 · 626 PF" value="3-0" valueSub="1st" />
        </li>
        <li>
          <ListRow href="/design" leading="9" highlight avatar={<Avatar initials="MJ" />} title="mjrooney20" badge={<Chip tone="accent" size="sm">You</Chip>} meta="1-2 · 566 PF" value="1-2" valueSub="9th" />
        </li>
        <li>
          <ListRow avatar={<Avatar initials="PF" />} title="PF / C" meta="no trailing value, no link" />
        </li>
        <li>
          <ListRow dense leading="12" title="A dense row with a trailing chip, no avatar" trailing={<Chip tone="warn" size="sm" icon={AlertTriangle}>Thin</Chip>} />
        </li>
        <li>
          <Sheet
            triggerLabel="Karl-Anthony Towns, value 4,120. Show details"
            title="Karl-Anthony Towns"
            subtitle="C · NYK · 30"
            leading={<Avatar initials="KT" />}
            actions={
              <>
                <ButtonLink href="/design" className="flex-1">Open in Trade</ButtonLink>
                <ButtonLink href="/design" variant="secondary" className="flex-1">Values</ButtonLink>
              </>
            }
            trigger={<ListRow as="span" chevron avatar={<Avatar initials="KT" />} title="Karl-Anthony Towns" meta="C · NYK · 30" value="4,120" valueSub="Starter" />}
          >
            <div className="grid grid-cols-2 gap-2">
              <StatTile label="Value" value="4,120" className="bg-surface-2" />
              <StatTile label="Consensus" value="#41" className="bg-surface-2" />
            </div>
            <p className="mt-3 text-body text-muted">A row that opens a bottom sheet. Escape, the close button or a tap on the backdrop dismisses it.</p>
          </Sheet>
        </li>
      </List>

      <SectionHeader title="Chart: bar list" />
      <Card>
        <BarList
          label="Value by position"
          items={[
            { label: "PG", value: 9200 },
            { label: "C", value: 7400, highlight: true, sub: "largest share" },
            { label: "SF", value: 5100 },
            { label: "PF", value: 3300 },
          ]}
          format={(n) => n.toLocaleString("en-US")}
        />
      </Card>

            </>
          ) },
          { id: "controls", label: "Controls", content: (
            <>
      <SectionHeader className="mt-2" title="Tabs and segmented control" />
      <Tabs
        label="Example tabs"
        items={[
          { id: "a", label: "Players", count: 17, content: <p className="text-body text-muted">Panel one.</p> },
          { id: "b", label: "Picks", count: 7, content: <p className="text-body text-muted">Panel two.</p> },
          { id: "c", label: "Shape", content: <p className="text-body text-muted">Panel three.</p> },
        ]}
      />
      <Tabs
        className="mt-4"
        variant="segmented"
        label="Example segmented tabs"
        items={[
          { id: "s", label: "Standings", content: <p className="text-body text-muted">Segmented tabs switch whole panels.</p> },
          { id: "v", label: "Value", content: <p className="text-body text-muted">Second panel.</p> },
        ]}
      />
      <Segmented
        className="mt-4"
        label="Example segmented control"
        options={[
          { value: "all", label: "All" },
          { value: "mine", label: "Mine" },
          { value: "field", label: "Field" },
        ]}
      />
      <p className="mt-4 text-note text-secondary">
        Four or five options with counts: the rail scrolls sideways, fades the hidden edge
        and keeps the active option in view.
      </p>
      <Tabs
        className="mt-2"
        variant="segmented"
        label="Four segmented tabs with counts"
        defaultId="t3"
        items={[
          { id: "t1", label: "Targets", count: 12, content: <p className="text-body text-muted">Four tabs, the third active on load.</p> },
          { id: "t2", label: "Sellers", count: 7, content: <p className="text-body text-muted">Panel two.</p> },
          { id: "t3", label: "Fits", count: 23, content: <p className="text-body text-muted">Panel three.</p> },
          { id: "t4", label: "Watching", count: 4, content: <p className="text-body text-muted">Panel four.</p> },
        ]}
      />
      <Tabs
        className="mt-4"
        variant="segmented"
        label="Five segmented tabs with counts"
        defaultId="f5"
        items={[
          { id: "f1", label: "All", count: 210, content: <p className="text-body text-muted">Five tabs, the last active on load.</p> },
          { id: "f2", label: "Guards", count: 74, content: <p className="text-body text-muted">Panel two.</p> },
          { id: "f3", label: "Wings", count: 61, content: <p className="text-body text-muted">Panel three.</p> },
          { id: "f4", label: "Bigs", count: 48, content: <p className="text-body text-muted">Panel four.</p> },
          { id: "f5", label: "Rookies", count: 27, content: <p className="text-body text-muted">Panel five.</p> },
        ]}
      />
      <Segmented
        className="mt-4"
        label="Five-option segmented control"
        options={[
          { value: "value", label: "Value" },
          { value: "age", label: "Age" },
          { value: "duration", label: "Duration" },
          { value: "consensus", label: "Consensus" },
          { value: "production", label: "Production" },
        ]}
      />

      <SectionHeader title="Disclosure" />
      <Disclosure summary="How this is measured">
        Explanation lives here, one tap away, collapsed by default.
      </Disclosure>

      <SectionHeader title="Buttons" />
      <div className="flex flex-wrap gap-2">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <ButtonLink href="/design" size="sm" variant="secondary">
          <TrendingUp size={14} aria-hidden="true" /> Small link
        </ButtonLink>
      </div>

            </>
          ) },
          { id: "states", label: "States", content: (
            <>
      <SectionHeader className="mt-2" title="Empty state" />
      <EmptyState icon={<Inbox size={28} aria-hidden="true" />} title="Nothing captured yet" cta={{ href: "/design", label: "Capture a move" }}>
        Your first decision shows up here.
      </EmptyState>

      <EmptyState
        className="mt-2"
        tone="negative"
        icon={<AlertTriangle size={28} aria-hidden="true" />}
        title="Could not load this"
        action={
          <>
            <Button>Try again</Button>
            <ButtonLink href="/design" variant="secondary">Home</ButtonLink>
          </>
        }
      >
        With an action node instead of a single link.
      </EmptyState>

      <SectionHeader title="Skeletons" />
      <SkeletonHeader />
      <SkeletonStat size="hero" />
      <SkeletonStats className="mt-2" />
      <SkeletonTabs className="mt-3" />
      <SkeletonRows rows={3} className="mt-2" />
      <SkeletonRows rows={2} avatar={false} className="mt-2" />

            </>
          ) },
        ]}
      />

      <Onward from="/design" />
    </div>
  );
}
