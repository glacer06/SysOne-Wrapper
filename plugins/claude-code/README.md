# Bandwise Gate for Claude Code

Bandwise Gate checks whether a coding agent is really done, and whether an action needs a person. Each answer comes with a confidence band, a reason and a cost.

The plugin has four parts:

- a **Stop hook** that runs the `done-check` set each time Claude says it is finished;
- a **PreToolUse hook** that runs the `action-risk-gate` set before Bash, Edit, Write, MultiEdit and NotebookEdit;
- the **`bandwise` MCP server** at `https://app.bandwise.dev/mcp`, with the tools `bandwise_check_done`, `bandwise_check_action`, `bandwise_get_savings`, `bandwise_list_review_items`, `bandwise_resolve_review_item` and `bandwise_report_feedback`;
- the **`bandwise-gate` skill**, which tells Claude when to call those tools and how to read a band.

It also carries the `find-decisions` skill from the free Bandwise kit, which finds LLM calls in a codebase that could run as Bandwise question sets.

The plugin is private for now. Only members of the Bandwise `internal` org can use it.

## Install

```sh
claude plugin marketplace add glacer06/bandwise
claude plugin install bandwise-gate@bandwise
```

The hooks run `npx -y @bandwise/cli@0.3`, so the machine needs Node 22 or later and npm. The first hook call downloads the CLI; later calls use the npm cache.

## Set BANDWISE_TOKEN

Both the hooks and the MCP server read `BANDWISE_TOKEN` from the environment of the shell that starts Claude Code.

- For the hooks and the check tools, use a run-only `sa_live_` agent token for the `internal` org (scope `run`, role ceiling `viewer`).
- The review tools need a second token with the review scopes (`review:read`, and `review:write` to resolve). Use it only in a session where you want them.

Load the token from your password manager or keychain in your shell profile. Never put it in a file in a repository, and never paste it into a prompt.

Without `BANDWISE_TOKEN` the hooks end silently and change nothing. The MCP server cannot connect without it.

## What leaves your machine

The hooks send only the fields that the set's input schema names. The schemas are in `sets/done-check.json` and `sets/action-risk-gate.json` in this plugin. The PreToolUse hook also drops `content_preview`, so file contents from Edit and Write are not sent. Fields are cut to the length the schema allows, and secret-shaped text (known token prefixes, `KEY=` and `TOKEN=` style assignments, bearer headers, private key blocks) is replaced before anything is sent. Pattern redaction is best effort, which is why file contents are dropped outright. Bandwise sends them to TypeSafe's System One models to answer the check. See https://www.bandwise.dev/privacy.

Each hook writes a local receipt to `~/.bandwise/receipts.jsonl` with the band, the cost and the savings. Receipts never hold the token.

## Shadow first

Every set is in `shadow` for now. In shadow a check is advice only: the hooks never block a tool call or stop Claude from finishing. An owner moves a set to `controlled` or `full` in the Bandwise console when the shadow numbers support it. The plugin needs no change when that happens, because the server's rollout stage decides.

## Files

- `.claude-plugin/plugin.json`: the manifest.
- `.mcp.json`: the remote MCP server entry.
- `hooks/hooks.json`: the Stop and PreToolUse hooks.
- `sets/`: copies of the `done-check` and `action-risk-gate` specs. The hooks read their input schemas; the set slug on the server is the file name.
- `skills/bandwise-gate/`: when to call the tools and how to read a band.
- `skills/find-decisions/`: find LLM calls that are really decisions.
