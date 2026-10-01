# Runbook: install Bandwise Gate (ADR-021 rollout step 2)

Bandwise Gate is the private Claude Code plugin in `plugins/claude-code`, listed in our own marketplace at `.claude-plugin/marketplace.json`. This runbook gets it validated and installed on Nick's and PJ's machines. The step is done when `claude plugin validate --strict` passes and both of you have it installed.

Steps marked **Nick** are Nick's. The rest either of you can run.

## 0. Before you start

The plugin depends on two things that are not in this repo:

1. **`@bandwise/cli` 0.3 on npm (Nick).** The hooks run `npx -y @bandwise/cli@0.3.0` (pinned, and run from the plugin folder so no project can swap in its own copy), and 0.3.0 is the first release with hosted hook mode (`BANDWISE_TOKEN` set). 0.2.1, the current release, ignores the token and needs a TypeSafe key. Nick cuts the release the usual way: set `KIT_VERSION` to `0.3.0`, regenerate, push and tag, as in [kit-release.md](kit-release.md), section 4. Check it landed:

   ```sh
   npm view @bandwise/cli@0.3.0 version
   ```

   Until 0.3.0 is out, `npx` finds no matching version and each hook ends silently. Nothing breaks, but nothing runs either.

2. **D2e live (Nick).** The hooks call `POST https://app.bandwise.dev/api/v1/sets/<slug>/run`, and the MCP entry points at `https://app.bandwise.dev/mcp`. Both need hosted dogfood turned on, as in [hosted-dogfood.md](hosted-dogfood.md). `/mcp` also needs ADR-021 rollout step 1 (the remote MCP slice) merged and deployed. Before that, the hooks still work once D2e is live, and the MCP tools fail to connect.

You also need Claude Code with `claude plugin validate`, and Node 22 or later.

## 1. Validate

From the repo root:

```sh
claude plugin validate --strict plugins/claude-code
claude plugin validate --strict .
```

Both must end with `Validation passed` and exit 0. The first checks the plugin manifest, the hooks file and the MCP entry. The second checks the marketplace file. Run both again after any change to `plugins/claude-code` or `.claude-plugin/`.

## 2. Token in your shell

The hooks read `BANDWISE_TOKEN` and the MCP server reads `BANDWISE_MCP_TOKEN`, both from the shell that starts Claude Code. For `BANDWISE_TOKEN` use the run-only hook token from [hosted-dogfood.md](hosted-dogfood.md), section 4 (`run` only, role ceiling `viewer`). Load it from the Keychain in `~/.zshrc`, as in section 5 of that runbook. Never paste it into a terminal, a prompt or a file.

- **Nick** already has `BANDWISE_TOKEN` loaded from the Keychain if section 5 of hosted-dogfood.md is done.
- **PJ**: ask Nick to mint a `pj-hooks` token with the same flags as `nick-hooks`, then load it from your own vault the same way.

`BANDWISE_MCP_TOKEN` can hold the same run-only token for the check tools. The review tools (`bandwise_list_review_items`, `bandwise_resolve_review_item`) need a second token with the review scopes; put that one in `BANDWISE_MCP_TOKEN` only. `BANDWISE_TOKEN` stays run-only, so the hooks never hold review scopes.

## 3. Install

Each of you, in a normal shell:

```sh
claude plugin marketplace add glacer06/bandwise
claude plugin install bandwise-gate@bandwise
claude plugin list
```

`claude plugin list` should show `bandwise-gate@bandwise` as enabled. The repo is private, so `marketplace add` uses your own GitHub access.

If you also run this repo's own hooks from `.claude/settings.json`, you get two Stop and two PreToolUse calls per event while you work in this repo. Both are in shadow, so that is fine for a check, but turn the plugin off here (`claude plugin disable --scope local bandwise-gate@bandwise` from this repo) for day-to-day work so the receipts are not doubled.

## 4. Check it runs

Open a new terminal so `BANDWISE_TOKEN` and `BANDWISE_MCP_TOKEN` are loaded, start Claude Code in a scratch repo (not this one), and:

1. Run `/plugin` and check `bandwise-gate` shows its two hooks, the `bandwise` MCP server and the `bandwise-gate` and `find-decisions` skills, with nothing in the **Errors** tab.
2. Ask for something small that ends with Claude saying it is done, for example "add a line to README.md". Then, in another terminal:

   ```sh
   pnpm --dir ~/path/to/bandwise -s bandwise report --since 1h
   ```

   `done-check` and `action-risk-gate` should each show runs marked `provider: bandwise`.
3. **Nick**: `bwa report --remote --since 1h` should show the same runs on the server.
4. Once `/mcp` is live, run `/mcp` in the session and check `bandwise` is connected and lists its tools. Ask Claude to call `bandwise_get_savings`.

Everything stays in `shadow`, so none of this blocks or changes a session.

## 5. Exit

Step 2 of the ADR-021 rollout is done when:

- `claude plugin validate --strict plugins/claude-code` and `claude plugin validate --strict .` both pass;
- Nick and PJ have both installed `bandwise-gate@bandwise` and seen runs from it in their receipts.

**Nick** records the date in `docs/PLAN.md` and starts the internal demo (rollout step 3).

## Rollback

`claude plugin uninstall bandwise-gate@bandwise` removes it from one machine. To pull it for everyone, remove the entry from `.claude-plugin/marketplace.json` and merge. Revoking the hook token in the console stops every hook call at once.
