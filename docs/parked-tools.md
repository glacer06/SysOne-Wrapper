# Parked tools

Tools we looked at and chose not to use yet. Each entry says what the tool is, why it is parked, and what would bring it back. Parking is not a decision. Adopting one of these still needs an ADR when it changes the stack (ADR-001).

Check this list before proposing a new vendor. If a trigger below fires, reopen the entry instead of starting from scratch.

## Fly.io

- **What it is:** a host that runs apps as long-lived VMs (Fly Machines) in regions it operates, billed per second. Machines start and stop in under a second. Fly also sells Sprites, persistent Linux sandboxes for agents with checkpoint and restore.
- **Looked at:** 2026-09-30, by Nick.
- **Why it is parked:** ADR-001 hosts on Vercel. ADR-005 chose Inngest so jobs run inside that deployment, with no second compute and no second home for secrets. Fly would add both: another place for `DATABASE_URL`, the KEK reference and the vault code, and another deploy pipeline for the Security reviewer. Long evals already fit as Inngest steps of about 50 cases.
- **Bring it back when:**
  1. We self-host the Inngest server, which is ADR-005's first fallback. That server runs all the time and sees only ids and counts, so it fits Fly without moving secrets.
  2. A workload needs a process that stays up, such as a worker that can't be chunked, a GPU job or long-lived connections, and neither Vercel's function limits nor Vercel Workflows cover it. Check this when the Phase 7 MCP HTTP transport is designed.
  3. Customers ask where to run `standalone` exports (ADR-009). That is their host, not ours, so a docs mention may be all it takes.
- **Recheck before use:** prices, trial terms and products change. Start at https://docs.fly.io/about/pricing/ and https://sprites.dev/.
