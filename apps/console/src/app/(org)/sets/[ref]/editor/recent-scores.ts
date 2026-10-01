// The recent scores each question's ruler plots. They come from run.get answers, the same data
// the Runs page shows, so the histogram is real runs and never a sample.

import type { QuestionDef } from "@bandwise/core";

/** One answer's place on its policy's scale: the noul, or the confidence. `option` is a choice's pick. */
export interface RecentScore {
  score: number;
  option?: string;
}

export type RecentScores = Record<string, RecentScore[]>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Scores per question id from a list of run answers (`RunDetail.answers`, newest first). Only
 * answers whose type matches the question in the draft count, so a question that changed type
 * since an older run does not plot that run. Anything malformed is skipped.
 */
export function collectScores(answersPerRun: readonly unknown[], questions: ReadonlyArray<{ id: string; question: QuestionDef }>): RecentScores {
  const out: RecentScores = {};
  for (const { id } of questions) out[id] = [];
  for (const answers of answersPerRun) {
    if (!isRecord(answers)) continue;
    for (const { id, question } of questions) {
      const a = answers[id];
      if (!isRecord(a) || a.type !== question.type) continue;
      const raw = a.type === "noul" ? a.noul : a.confidence;
      if (typeof raw !== "number" || !(raw >= 0 && raw <= 1)) continue;
      const entry: RecentScore = { score: raw };
      if (a.type === "choice" && typeof a.choice === "string") entry.option = a.choice;
      out[id]?.push(entry);
    }
  }
  return out;
}

/**
 * The scores a choice ruler plots: the shared bar gets every pick without its own stricter bar,
 * and an option's own bar gets only that option's picks.
 */
export function scoresFor(entries: readonly RecentScore[], option: string | null, ownBars: readonly string[]): number[] {
  if (option !== null) return entries.filter((e) => e.option === option).map((e) => e.score);
  return entries.filter((e) => e.option === undefined || !ownBars.includes(e.option)).map((e) => e.score);
}
