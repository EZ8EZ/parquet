/**
 * LLM call tracing to LangSmith - hand-rolled, zero-dependency, env-gated.
 *
 * Why not the langsmith SDK: the analyst's own LLM client is a raw fetch against
 * an OpenAI-compatible endpoint, and one traced call site does not justify a
 * dependency. This posts a single completed run to LangSmith's runs API after the
 * call finishes - no run tree, no PATCH cycle, one request.
 *
 * The contract that matters: tracing can never degrade the product. No key means
 * a clean no-op, and a LangSmith failure (down, slow, rejected payload) is
 * swallowed after a short cap. The cap is an await rather than fire-and-forget
 * because serverless runtimes reclaim the instance once the response returns -
 * a dangling promise here would silently drop most traces in production.
 */

const LANGSMITH_URL = "https://api.smith.langchain.com/runs";
const POST_CAP_MS = 3_000;

export interface LLMTraceInput {
  /** Run name as it appears in the LangSmith project, e.g. "analyst". */
  name: string;
  model: string;
  /** The exact messages sent - the whole point is seeing the assembled context. */
  messages: Array<{ role: string; content: string }>;
  params?: Record<string, unknown>;
}

export interface LLMTraceOutcome {
  /** Model text on success. */
  text?: string;
  /** Error description on failure - traced runs with errors are the useful ones. */
  error?: string;
}

export function tracingEnabled(): boolean {
  return Boolean(process.env.LANGSMITH_API_KEY);
}

/**
 * Record one completed LLM call. Call it after the call resolves either way;
 * it never throws and resolves within POST_CAP_MS.
 */
export async function traceLLMRun(
  input: LLMTraceInput,
  outcome: LLMTraceOutcome,
  timing: { startedAt: Date; endedAt: Date },
): Promise<void> {
  const apiKey = process.env.LANGSMITH_API_KEY;
  if (!apiKey) return;

  const id = crypto.randomUUID();
  // Dotted order wants microsecond precision; Date carries millis, so pad.
  const dotted =
    timing.startedAt.toISOString().replace(/[-:.]/g, "").replace("Z", "000Z") + id;

  const body = {
    id,
    trace_id: id,
    dotted_order: dotted,
    name: input.name,
    run_type: "llm",
    start_time: timing.startedAt.toISOString(),
    end_time: timing.endedAt.toISOString(),
    inputs: { model: input.model, messages: input.messages, ...input.params },
    outputs: outcome.text != null ? { text: outcome.text } : undefined,
    error: outcome.error,
    session_name: process.env.LANGSMITH_PROJECT || "default",
  };

  try {
    await fetch(LANGSMITH_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(POST_CAP_MS),
    });
  } catch {
    // Tracing is an observer, never a participant - failure here is not news
    // the user can act on, and the analyst already returned its answer.
  }
}
