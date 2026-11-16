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
  SkeletonRows,
  SkeletonStats,
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

      <SectionHeader title="Colour" />
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

      <SectionHeader title="Stat tiles" />
      <StatTile label="Total value" value="26,641" sub="9th of 14 rosters" size="hero" tone="accent" />
      <div className="mt-2 grid grid-cols-3 gap-2">
        <StatTile label="Record" value="1-2" sub="9th of 14" />
        <StatTile label="Core age" value="28.4" delta={1.2} sub="veteran core" />
        <StatTile label="Picks" value="7" href="/design" sub="tile as link" />
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
          <Sheet
            triggerLabel="Karl-Anthony Towns, value 4,120. Show details"
            title="Karl-Anthony Towns"
            subtitle="C · NYK · 30"
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

      <SectionHeader title="Tabs and segmented control" />
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

      <SectionHeader title="Disclosure" />
      <Disclosure summary="How this is measured">
        Explanation lives here, one tap away, collapsed by default.
      </Disclosure>

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

      <SectionHeader title="Buttons" />
      <div className="flex flex-wrap gap-2">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <ButtonLink href="/design" size="sm" variant="secondary">
          <TrendingUp size={14} aria-hidden="true" /> Small link
        </ButtonLink>
      </div>

      <SectionHeader title="Empty state" />
      <EmptyState icon={<Inbox size={28} aria-hidden="true" />} title="Nothing captured yet" cta={{ href: "/design", label: "Capture a move" }}>
        Your first decision shows up here.
      </EmptyState>

      <SectionHeader title="Skeletons" />
      <SkeletonStats />
      <SkeletonRows rows={3} className="mt-2" />

      <SectionHeader title="Cards" />
      <div className="grid grid-cols-2 gap-2">
        <Card>default</Card>
        <Card tone="raised">raised</Card>
        <Card tone="accent">accent (yours)</Card>
        <Card tone="sunken">sunken</Card>
      </div>

      <Onward from="/design" />
    </div>
  );
}
