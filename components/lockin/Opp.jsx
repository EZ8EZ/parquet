import { TeamLogo } from "@/components/TeamLogo";

/** An opponent as crest plus three-letter code (never the crest alone), inline. */
export function Opp({ team, away = null, size = "xs", className = "" }) {
  if (!team) return <span className={className}>{away == null ? "" : away ? "at " : "vs "}unknown</span>;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap align-[-2px] ${className}`}>
      {away != null && <span>{away ? "at" : "vs"}</span>}
      <TeamLogo team={team} size={size} decorative />
      <span>{team}</span>
    </span>
  );
}
