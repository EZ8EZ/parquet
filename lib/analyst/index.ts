/**
 * The Analyst — a well-constructed adversarial prompt over the user's text corpus.
 * NOT fine-tuning, NOT a vector DB (DECISIONS.md D7): 3+ seasons of annotated
 * transactions fit in one context window.
 *
 * Degrades gracefully: with no ANTHROPIC_API_KEY it returns a deterministic,
 * rules-based audit instead of erroring. The rest of the app needs no key.
 */
import type { LeagueHistory } from "../history";
import { getStrategyReport } from "../strategy";
import { getAllDossiers } from "../dossier";
import { describeTransaction, describeTradeForRoster } from "../derive/describe";
import { valuePlayer, tierOf } from "../valuation";
import { ADVERSARIAL_REMINDER, ANALYST_SYSTEM_PROMPT } from "./system-prompt";

export interface AnalystMessage {
  role: "user" | "assistant";
  content: string;
}
export interface AnalystResult {
  text: string;
  mode: "llm" | "rules";
  model?: string;
}

/** Build the compact text corpus injected into the analyst prompt. */
export function buildCorpus(h: LeagueHistory): string {
  const report = getStrategyReport(h);
  const p = report.profile;
  const rosterId = h.me.rosterId;
  const lines: string[] = [];

  lines.push(`# YOU: ${h.me.teamName ?? h.me.displayName} (${h.me.displayName})`);
  lines.push(`League: ${h.currentLeague.name}, ${h.chain.length} seasons (${h.chain.map((c) => c.season).join(", ")}), ${h.currentLeague.totalRosters} teams.`);
  lines.push("");

  lines.push(`## REVEALED STRATEGY (derived from your transactions)`);
  lines.push(`Trades: ${p.trades} (${p.tradesInitiated} you initiated). Waivers/FA: ${p.waivers + p.freeAgents}.`);
  lines.push(`Pick capital: net ${p.picks.net} (firsts: +${p.picks.firstsAcquired}/-${p.picks.firstsSpent}).`);
  if (p.acquisitions.avgAge != null)
    lines.push(`Avg acquisition age: ${p.acquisitions.avgAge}. Age trend by season: ${p.acquisitions.ageBySeason.map((a) => `${a.season}:${a.avgAge}`).join(", ")}.`);
  lines.push(`Revealed posture by season: ${p.postureBySeason.map((x) => `${x.season}:${x.posture}`).join(", ")}.`);
  if (p.afterLoss) lines.push(`Self-initiated trades after a loss: ${p.afterLoss.afterLoss}/${p.afterLoss.total}.`);
  for (const f of report.findings) lines.push(`- ${f}`);
  lines.push("");

  if (report.contradictions.length) {
    lines.push(`## STATED vs REVEALED CONTRADICTIONS (surface these first)`);
    for (const c of report.contradictions) lines.push(`- ${c.narrative}`);
    lines.push("");
  }

  lines.push(`## YOUR ANNOTATED DECISIONS (your own recorded reasoning)`);
  const annotated = h.transactions
    .filter((t) => h.annotations.has(t.transactionId))
    .sort((a, b) => a.created - b.created);
  if (annotated.length === 0) {
    lines.push(`(none yet — the user has annotated no decisions)`);
  } else {
    for (const t of annotated) {
      const ann = h.annotations.get(t.transactionId)!;
      const desc = rosterId != null && t.type === "trade"
        ? `you ${describeTradeForRoster(h, t, rosterId)}`
        : describeTransaction(h, t);
      lines.push(`- [${t.season}] ${desc}`);
      lines.push(`  Your reasoning: "${ann.reasoning}"${ann.posture ? ` (posture: ${ann.posture})` : ""}`);
    }
  }
  lines.push("");

  // Your trade history (compact), for grounding.
  const myTrades = rosterId != null
    ? h.transactions.filter((t) => t.type === "trade" && t.rosterIds.includes(rosterId))
    : [];
  if (myTrades.length) {
    lines.push(`## YOUR TRADE LOG`);
    for (const t of myTrades.slice(-25)) {
      lines.push(`- [${t.season} wk${t.week}] you ${describeTradeForRoster(h, t, rosterId!)}${h.annotations.has(t.transactionId) ? "" : "  (UNANNOTATED)"}`);
    }
    lines.push("");
  }

  // Current roster top assets.
  if (rosterId != null) {
    const roster = h.rostersById.get(rosterId);
    if (roster) {
      const scoring = h.currentLeague.scoringSettings;
      const valued = roster.players
        .map((pid) => {
          const pl = h.players.get(pid);
          if (!pl) return null;
          const v = valuePlayer(pl, scoring);
          return { name: pl.fullName, age: pl.age, value: v.value, tier: tierOf(v.value) };
        })
        .filter(Boolean)
        .sort((a, b) => b!.value - a!.value) as { name: string; age: number | null; value: number; tier: string }[];
      lines.push(`## YOUR CURRENT ROSTER (by value)`);
      for (const v of valued.slice(0, 12))
        lines.push(`- ${v.name} (age ${v.age ?? "?"}) — ${v.value} [${v.tier}]`);
      lines.push("");
    }
  }

  // Leaguemate dossiers (compact).
  lines.push(`## LEAGUEMATE DOSSIERS (behavioral)`);
  for (const d of getAllDossiers(h)) {
    lines.push(`- ${d.profile.displayName}${d.profile.teamName ? ` (${d.profile.teamName})` : ""}: ${d.tags.join(", ") || "no strong tell"}. ${d.read}`);
  }

  return lines.join("\n");
}

export async function runAnalyst(
  h: LeagueHistory,
  question: string,
  prior: AnalystMessage[] = [],
): Promise<AnalystResult> {
  const corpus = buildCorpus(h);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { text: rulesFallback(h, question), mode: "rules" };
  }
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });
    const model = process.env.ANALYST_MODEL || "claude-sonnet-5";
    const messages = [
      {
        role: "user" as const,
        content: `Here is my dynasty history corpus. Use it to ground every answer.\n\n<corpus>\n${corpus}\n</corpus>`,
      },
      {
        role: "assistant" as const,
        content: "Understood. I have your corpus. I'll lead with the disconfirming evidence and cite your own moves. What do you want audited?",
      },
      ...prior.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: `${question}\n\n(${ADVERSARIAL_REMINDER})` },
    ];
    const res = await client.messages.create({
      model,
      max_tokens: 1024,
      system: ANALYST_SYSTEM_PROMPT,
      messages,
    });
    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n")
      .trim();
    return { text: text || rulesFallback(h, question), mode: "llm", model };
  } catch {
    // Never error the UI — degrade to rules with a note.
    return {
      text:
        `(Analyst API unavailable — showing the deterministic audit instead.)\n\n` +
        rulesFallback(h, question),
      mode: "rules",
    };
  }
}

/**
 * Deterministic, still-adversarial audit used when no API key is set. Answers the
 * common questions from the derived strategy report and dossiers.
 */
export function rulesFallback(h: LeagueHistory, question: string): string {
  const q = question.toLowerCase();
  const report = getStrategyReport(h);
  const dossiers = getAllDossiers(h);

  // Ask about a specific manager?
  const named = dossiers.find(
    (d) =>
      q.includes(d.profile.displayName.toLowerCase()) ||
      (d.profile.teamName && q.includes(d.profile.teamName.toLowerCase())),
  );
  if (named) {
    return [
      `${named.profile.displayName} — read:`,
      named.read,
      "",
      "How to approach:",
      ...named.approachTips.map((t) => `• ${t}`),
    ].join("\n");
  }

  const out: string[] = [];
  // Lead with the disconfirming case.
  if (report.contradictions.length) {
    out.push(`First, the uncomfortable part: ${report.contradictions[0].narrative}`);
    out.push("");
  } else {
    out.push(
      `No stated-vs-revealed contradiction yet — but that's partly because you've annotated ${h.annotations.size} decision(s). Annotate more and I can hold you to your own words.`,
    );
    out.push("");
  }

  if (q.includes("strategy") || q.includes("am i") || q.includes("rebuild") || q.includes("contend") || q.includes("plan")) {
    const post = report.profile.postureBySeason;
    out.push(`Your revealed posture by season: ${post.map((p) => `${p.season}=${p.posture}`).join(", ") || "insufficient data"}.`);
  }
  out.push("What your record actually shows:");
  for (const f of report.findings) out.push(`• ${f}`);
  if (!report.findings.length) out.push("• Not enough transaction history yet to draw firm patterns.");

  out.push("");
  out.push(
    "(This is the deterministic audit. Set ANTHROPIC_API_KEY for the conversational analyst that can reason about specific hypotheticals.)",
  );
  return out.join("\n");
}
