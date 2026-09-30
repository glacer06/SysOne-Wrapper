# Runbook: dogfood Bandwise on this repo

Phase D of ADR-020. Bandwise runs as Claude Code hooks on this repository, with your own TypeSafe key, before anyone else uses it. Every set starts in `shadow`.

## What you get

Three sets from the agent pack, in `.bandwise/sets/`:

| Set | Hook event | In `controlled`, a high band answer... |
|---|---|---|
| `done-check` | `Stop` | sends the agent back when work is left or a claim is unchecked |
| `action-risk-gate` | `PreToolUse` on Bash, Edit, Write, MultiEdit, NotebookEdit | turns the tool call into a permission prompt |
| `model-tier` | `UserPromptSubmit` | adds advice to hand mechanical work to a cheaper subagent |

In `shadow` none of that happens. The hook runs the set, writes a receipt, and prints nothing.

## D0 status (2026-09-30): done

Nick ran D0 from his own shell on Node 22 with his TypeSafe key (NSI-730).

- `pnpm fixtures:record` recorded 9 of 9 typesafe success fixtures against TypeSafe's openapi.json 0.2.0. `noul-near-half` stays hand-authored: live Jev scored its ticket 0.07, not near 0.5, and the fixture exists to test the band edge. The recorder skips any fixture marked `"source": "hand-authored"`.
- `pnpm smoke` passed all 36 checks. `jev-preview` and `jev-latest` both resolved to `jev-1.13.0`. Each model cost $0.000074 (cap $0.001), so the whole smoke cost about $0.0002.
- `bandwise run --live` on `done-check` answered `unverified` in the high band for the turn that claims success without a check, which is the answer the set wants. System One cost $0.000029 for 681 input tokens, latency 287 ms, and the receipt counted $0.000575 saved against claude-haiku-4-5.
- Earlier, the cloud session could not run the SDK path live: its proxy did not replace the placeholder `Authorization` header and every call came back 401. Live runs belong in a shell that holds the key.

To re-record later, from your shell with `TYPESAFE_API_KEY` set:

```sh
pnpm fixtures:record          # rewrites the recorded success fixtures in packages/system-one-client/fixtures/typesafe
pnpm smoke                    # checks jev-preview, jev-latest and jev-1.13.0; prints cost per model
git diff --stat packages/system-one-client/fixtures
```

## Status (2026-09-30)

The three dogfood hooks are wired in this repo's `.claude/settings.json`, all in `shadow`: `done-check` on Stop, `action-risk-gate` on PreToolUse, and `model-tier` on UserPromptSubmit. The risk gate runs with `--drop content_preview`, so file contents stay on the machine. Nick approved them on 2026-09-30. The week of receipts before any set moves to `controlled` (section 3) starts then.

## 1. Install

You need Node 22, `pnpm install` done in this repo, and your key in the shell Claude Code starts from. On a Mac, keep the key in the Keychain and load it in `~/.zshrc`, so it never sits in a plain file:

```sh
security add-generic-password -a "$USER" -s TYPESAFE_API_KEY -w     # prompts for the key; add -U to replace an old one
```

Then add this line to `~/.zshrc`:

```sh
export TYPESAFE_API_KEY="$(security find-generic-password -a "$USER" -s TYPESAFE_API_KEY -w 2>/dev/null)"
```

Open a new terminal window and run the live check below. If it answers, the key the hooks will see is the right one. If you only need the key for one window, `read -s "TYPESAFE_API_KEY?TypeSafe key: " && export TYPESAFE_API_KEY` loads it without echoing it or writing it to your shell history.

Paste commands without `#` comment lines. zsh does not treat them as comments at an interactive prompt unless `setopt interactivecomments` is on.

Check one set live before wiring any hook:

```sh
pnpm bandwise run --live .bandwise/sets/done-check.json \
  .bandwise/states/done-check/example-2-claims-success-without-a-check.json --receipts
```

Print the hook entries:

```sh
pnpm bandwise hooks install --command 'pnpm -s --dir "$CLAUDE_PROJECT_DIR" bandwise'
```

It prints JSON for `.claude/settings.json` and writes nothing. Read it, then merge the `hooks` block into `.claude/settings.json` yourself. Every command ends in `--rollout shadow`. Start a new Claude Code session so the hooks load.

The command runs the CLI from this repo's source, so the hooks use whatever is on `main` and need no global install. One hook run takes under a second before the System One call. Sessions without the key, such as cloud sessions, run the hooks and get a silent no-op.

To confirm the hooks work, send one prompt in a new session and run:

```sh
pnpm bandwise report --since 1h
```

A `model-tier` row means the `UserPromptSubmit` hook ran live. `done-check` appears after Claude's first reply.

What the hook sends to TypeSafe: only the fields the set's input schema names. For `done-check` that is your last request and Claude's final message, read from the session transcript. For `action-risk-gate` it is the tool name, command, file path, the first 2000 characters of new content, and the description. For `model-tier` it is your prompt. Secret-shaped text is replaced before the call:
- API keys, tokens and private keys
- `Authorization` headers of any scheme
- passwords in URLs such as `postgres://user:pass@host`
- values after a name that says key, token, secret, password or credential, in `NAME=value`, JSON, YAML and `--flag value` form

That redaction is pattern based. It catches the common shapes but cannot promise that every private value is gone, so treat whatever a hook reads as something TypeSafe may see. Add `--drop <field>` to a hook command to never send a field at all. For example, `--drop content_preview` keeps file contents on the machine for the risk gate.

What it never does: block or change anything in `shadow`, print the key, write a prompt or tool input into a receipt, or fail a session. A missing key turns the hook off. Any error or a 3 second timeout exits 0 with no output.

## 2. Read the report

```sh
pnpm bandwise report --since 7d
pnpm bandwise report --since 7d --set action-risk-gate --json
```

Per set it shows runs and failures, decisions, the band mix, how often the set would have acted, how often it did act (0 in shadow), System One spend, counterfactual LLM spend, estimated savings and latency.

Read the savings as estimates. The counterfactual prices one comparator LLM call per decision. In Claude Code the real saving is fewer wasted turns and fewer risky actions, and no receipt can price those exactly. What the receipts can tell you for sure is what System One cost and how often each set would have stepped in.

Receipts live in `~/.bandwise/receipts.jsonl`, one JSON line per run. Delete the file to start over.

## 3. Move a set from shadow to controlled

One set at a time, after about a week of receipts, and only when you say so.

1. Run `pnpm bandwise report --since 7d --set <set>`. Look at "would have acted" and the band mix. A set that would have acted on ordinary work stays in shadow: tighten its thresholds in `.bandwise/sets/<set>.json` first, commit, and give it another week.
2. In `.claude/settings.json`, change that set's hook command from `--rollout shadow` to `--rollout controlled`. Commit it with a message that names the set and the receipts you read.
3. In `controlled`, only a high band answer acts. The next report shows it under "acted".

To step back, change it to `--rollout shadow` again. That is never gated.

## 4. Remove the hooks

Delete the Bandwise entries from `.claude/settings.json` (or the whole `hooks` block if nothing else is in it) and start a new session. Live mode stays opt-in behind `--live` and an environment key, so nothing else runs.

## Checks CI runs

- Every spec in `.bandwise/sets/` validates and runs with status ok under `bandwise run --local` on each example and borderline state in `.bandwise/states/` (`packages/cli/src/local/dogfood-sets.test.ts`).
- Only `packages/cli/src/live/transport.ts` imports the SDK transport, and only `packages/cli/src/live/key.ts` reads a key variable (the boundary lint and `packages/cli/src/live/live.test.ts`).
- `bandwise hooks install` prints every dogfood set in `shadow`.
