"use server";

// approval.decide is session only: these actions are the one way a person approves or denies an
// agent's request. An approved request runs as the agent's token right after the decision.

import { revalidatePath } from "next/cache";

import { decideApproval } from "~/server/console-actions/releases";
import { consoleOperation } from "~/server/console-operation";

export async function decideAction(args: { id: string; decision: "approved" | "rejected"; note: string }) {
  const r = await decideApproval(consoleOperation, args);
  // The set's stage or version may have moved even when the run after approval failed.
  revalidatePath("/", "layout");
  return r;
}
