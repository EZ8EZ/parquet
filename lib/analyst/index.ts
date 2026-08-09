/**
 * The Analyst — a well-constructed adversarial prompt over the user's text corpus.
 * NOT fine-tuning, NOT a vector DB (DECISIONS.md D7): 3+ seasons of annotated
 * transactions fit in one context window.
 *
 * Provider-agnostic: talks to ANY OpenAI-compatible chat-completions endpoint via
 * plain fetch — a free hosted open model (Groq, OpenRouter, Together) OR a local
 * open-source model (Ollama, LM Studio). Configured with LLM_BASE_URL / LLM_API_KEY
 * / LLM_MODEL. With nothing configured it degrades to a deterministic, rules-based
 * audit — so the app works with zero keys and deploys free on Vercel. No paid
 * dependency, no vendor lock-in (DECISIONS.md D17).
 */
import { myAnnotation, type LeagueHistory } from "../history";
import { getStrategyReport } from "../strategy";
import { getAllDossiers } from "../dossier";
import { getPrincipals, type PrincipalIndex } from "../principals";
import { describeTransaction, describeTradeForRoster } from "../derive/describe";
import { valuePlayer } from "../valuation";
import { leagueTierLabel } from "../rankings/leagueTiers";
import { ADVERSARIAL_REMINDER, ANALYST_SYSTEM_PROMPT } from "./system-prompt";
import { traceLLMRun } from "../observability/trace";

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
export function buildCorpus(h: LeagueHistory, principals: PrincipalIndex): string {
  const report = getStrategyReport(h, principals);
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

  // ONLY the viewer's own annotations. This corpus is fed straight into an LLM
  // prompt (or the deterministic fallback), so a trade partner's private captured
  // reasoning leaking in here is not just a wrong attribution - it is that
  // partner's own words handed to the viewer without their knowledge. Never widen
  // this to `h.annotations.has(t.transactionId)` (any author) again.
  lines.push(`## YOUR ANNOTATED DECISIONS (your own recorded reasoning)`);
  const annotated = h.transactions
    .filter((t) => myAnnotation(h, t.transactionId) != null)
    .sort((a, b) => a.created - b.created);
  if (annotated.length === 0) {
    lines.push(`(none yet - the user has annotated no decisions)`);
  } else {
    for (const t of annotated) {
      const ann = myAnnotation(h, t.transactionId)!;
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
      lines.push(`- [${t.season} wk${t.week}] you ${describeTradeForRoster(h, t, rosterId!)}${myAnnotation(h, t.transactionId) ? "" : "  (UNANNOTATED)"}`);
    }
    lines.push("");
  }

  // Current roster top assets.
  if (rosterId != null) {
    const roster = h.rostersById.get(rosterId);
    if (roster) {
      const scoring = h.currentLeague.scoringSettings;
      // Same league-derived tiers every surface shows, so an export never disagrees
      // with the page it was exported from.
      const tierFor = leagueTierLabel(h);
      const valued = roster.players
        .map((pid) => {
          const pl = h.players.get(pid);
          if (!pl) return null;
          const v = valuePlayer(pl, scoring);
          return { name: pl.fullName, age: pl.age, value: v.value, tier: tierFor(v.value) };
        })
        .filter(Boolean)
        .sort((a, b) => b!.value - a!.value) as { name: string; age: number | null; value: number; tier: string }[];
      lines.push(`## YOUR CURRENT ROSTER (by value)`);
      for (const v of valued.slice(0, 12))
        lines.push(`- ${v.name} (age ${v.age ?? "?"}) - ${v.value} [${v.tier}]`);
      lines.push("");
    }
  }

  // Leaguemate dossiers (compact).
  lines.push(`## LEAGUEMATE DOSSIERS (behavioral)`);
  for (const d of getAllDossiers(h, principals)) {
    lines.push(`- ${d.profile.displayName}${d.profile.teamName ? ` (${d.profile.teamName})` : ""}: ${d.tags.join(", ") || "no strong tell"}. ${d.read}`);
  }

  return lines.join("\n");
}

export async function runAnalyst(
  h: LeagueHistory,
  question: string,
  prior: AnalystMessage[] = [],
): Promise<AnalystResult> {
  const principals = await getPrincipals(h);
  const corpus = buildCorpus(h, principals);
  const baseUrl = process.env.LLM_BASE_URL; // OpenAI-compatible base, e.g. https://api.groq.com/openai/v1
  if (!baseUrl) {
    // No LLM configured — the deterministic audit IS the product here, not a stub.
    return { text: rulesFallback(h, question, principals), mode: "rules" };
  }
  const apiKey = process.env.LLM_API_KEY; // optional (local Ollama needs none)
  const model = process.env.LLM_MODEL || "llama-3.3-70b-versatile";
  // Hoisted out of the try so the failure trace can carry the exact messages too -
  // a traced error without its prompt is the half that can't be debugged.
  const messages = [
    { role: "system", content: ANALYST_SYSTEM_PROMPT },
    {
      role: "system",
      content: `The user's dynasty history corpus follows. Ground every answer in it; cite specific transactions and seasons.\n\n<corpus>\n${corpus}\n</corpus>`,
    },
    ...prior.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: `${question}\n\n(${ADVERSARIAL_REMINDER})` },
  ];
  const params = { max_tokens: 1024, temperature: 0.4 };
  const startedAt = new Date();
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ model, messages, ...params }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content?.trim() ?? "";
    await traceLLMRun(
      { name: "analyst", model, messages, params },
      { text },
      { startedAt, endedAt: new Date() },
    );
    return { text: text || rulesFallback(h, question, principals), mode: "llm", model };
  } catch (err) {
    await traceLLMRun(
      { name: "analyst", model, messages, params },
      { error: String(err) },
      { startedAt, endedAt: new Date() },
    );
    // Never error the UI — degrade to rules with a note.
    return {
      text:
        `(Live analyst unavailable - showing the deterministic audit instead.)\n\n` +
        rulesFallback(h, question, principals),
      mode: "rules",
    };
  }
}

/**
 * Deterministic, still-adversarial audit used when no API key is set. Answers the
 * common questions from the derived strategy report and dossiers.
 */
export function rulesFallback(
  h: LeagueHistory,
  question: string,
  principals: PrincipalIndex,
): string {
  const q = question.toLowerCase();
  const report = getStrategyReport(h, principals);
  const dossiers = getAllDossiers(h, principals);

  // Ask about a specific manager?
  const named = dossiers.find(
    (d) =>
      q.includes(d.profile.displayName.toLowerCase()) ||
      (d.profile.teamName && q.includes(d.profile.teamName.toLowerCase())),
  );
  if (named) {
    return [
      `${named.profile.displayName} - read:`,
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
    // Count only the viewer's OWN annotations that match a transaction in THIS
    // corpus - the raw table can hold rows from other providers (fixture seeds) and
    // other authors (a trade partner's own note on a shared transactionId), and
    // quoting a number the ledger page contradicts would undermine the audit's
    // authority.
    const annotatedCount = h.transactions.filter(
      (t) => myAnnotation(h, t.transactionId) != null,
    ).length;
    out.push(
      `No stated-vs-revealed contradiction yet - but that's partly because you've annotated ${annotatedCount === 0 ? "nothing" : `only ${annotatedCount} decision${annotatedCount === 1 ? "" : "s"}`}. Annotate more and I can hold you to your own words.`,
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
    "(This is the deterministic audit. Point LLM_BASE_URL at any OpenAI-compatible endpoint - a free hosted open model or a local Ollama - for the conversational analyst that reasons about specific hypotheticals.)",
  );
  return out.join("\n");
}
