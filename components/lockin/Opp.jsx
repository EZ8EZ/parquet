import { TeamLogo } from "@/components/TeamLogo";

/**
 * An opponent as crest plus three-letter code (never the crest alone). Plain inline
 * text with the crest set on the baseline, so punctuation that follows sits where it
 * should.
 */
export function Opp({ team, away = null, size = "xs", className = "" }) {
  const pre = away == null ? "" : away ? "at " : "vs ";
  if (!team) return <span className={className}>{pre}unknown</span>;
  return (
    <span className={`whitespace-nowrap ${className}`}>
      {pre}
      <TeamLogo team={team} size={size} decorative className="mr-0.5 inline-block align-[-2px]" />
      {team}
    </span>
  );
}
