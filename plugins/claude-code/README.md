# Bandwise Gate for Claude Code

Bandwise Gate checks whether a coding agent is really done, and whether an action needs a person. Each answer comes with a confidence band and a cost.

The plugin has four parts:

- a **Stop hook** that runs the `done-check` set each time Claude says it is finished;
- a **PreToolUse hook** that runs the `action-risk-gate` set before Bash, Edit, Write, MultiEdit and NotebookEdit;
- the **`bandwise` MCP server** at `https://app.bandwise.dev/mcp`, with the tools `bandwise_check_done`, `bandwise_check_action`, `bandwise_get_savings`, `bandwise_list_review_items`, and `bandwise_resolve_review_item`. A token sees only the tools its scopes allow. `bandwise_report_feedback` appears once the server can record feedback;
- the **`bandwise-gate` skill**, which tells Claude when to call those tools and how to read a band.

It also carries the `find-decisions` skill from the free Bandwise kit, which finds LLM calls in a codebase that could run as Bandwise question sets.

The plugin is private for now. Only members of the Bandwise `internal` org can use it.

## Install

```sh
claude plugin marketplace add glacer06/bandwise
claude plugin install bandwise-gate@bandwise
```

The hooks run `npx -y @bandwise/cli@0.3.0` from this plugin's own folder, so a project you open can never swap in its own copy of the CLI. The machine needs Node 22 or later and npm. The first hook call downloads the CLI; later calls use the npm cache.

## Set the tokens

The hooks and the MCP server read separate variables, so the hooks never run with more than they need.

- `BANDWISE_TOKEN`, for the hooks: a run-only `sa_live_` agent token for the `internal` org (scope `run`, role ceiling `viewer`).
- `BANDWISE_MCP_TOKEN`, for the MCP tools. For the check tools alone it can hold the same run-only token. Add the review scopes (`review:read`, and `review:write` to resolve) only if you want the review tools.

Load both from your password manager or keychain in your shell profile. Never put a token in a file in a repository, and never paste it into a prompt.

Without `BANDWISE_TOKEN` the hooks end silently and change nothing. Without `BANDWISE_MCP_TOKEN` the MCP server is refused and shows no tools.

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
