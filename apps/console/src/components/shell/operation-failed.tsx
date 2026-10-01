import { InlineAlert } from "../ui";

/** A page body when the operation it reads fails. The message is the operation's own, written for people. */
export function OperationFailed({ message }: { message: string }) {
  return <InlineAlert kind="error" title="This page could not load">{message}</InlineAlert>;
}
