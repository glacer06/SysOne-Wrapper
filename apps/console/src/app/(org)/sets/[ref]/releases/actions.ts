"use server";

// Server Actions for the Releases panel. Each one is a single operation call as the signed-in
// member (server/console-actions/releases.ts); the operation validates the input and checks the
// role. Every page that shows a stage or a version reads fresh data after a change.

import { revalidatePath } from "next/cache";

import {
  changeStage,
  checkPublish,
  checkRollback,
  type DiffSide,
  diffSides,
  publishDraft,
  type PublishArgs,
  rollbackChannel,
  type RollbackArgs,
  type StageArgs,
} from "~/server/console-actions/releases";
import { consoleOperation } from "~/server/console-operation";

import { DEFAULT_STAGE_REASON, PAUSE_REASON } from "./stages";

async function after<T extends { ok: boolean }>(result: Promise<T>): Promise<T> {
  const r = await result;
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export async function checkPublishAction(args: PublishArgs) {
  return checkPublish(consoleOperation, args);
}

export async function publishAction(args: PublishArgs) {
  return after(publishDraft(consoleOperation, args));
}

export async function checkRollbackAction(args: RollbackArgs) {
  return checkRollback(consoleOperation, args);
}

export async function rollbackAction(args: RollbackArgs) {
  return after(rollbackChannel(consoleOperation, args));
}

export async function changeStageAction(args: StageArgs) {
  return after(changeStage(consoleOperation, args, args.stage === "paused" ? PAUSE_REASON : DEFAULT_STAGE_REASON));
}

export async function diffAction(args: { ref: string; from: DiffSide; to: DiffSide }) {
  return diffSides(consoleOperation, args);
}
