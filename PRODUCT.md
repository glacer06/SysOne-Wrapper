# PRODUCT.md

The strategy layer. Who Bandwise is for, what it does, why it exists and how it carries itself. Read this before generating any UI, copy or plan. Decided by Nick through the factory kit on 2026-10-01.

## Register

Default register: `product`.

The console (`apps/console`), the docs (`apps/docs`), CLI output and plugin tool output are product surfaces, so they run quiet and exact. www.bandwise.dev (`apps/web`) and the plugin listing art are brand surfaces. They run bolder, with one display headline per view.

## What this is

Bandwise lets a team ask a small, fast model a structured question and get back an answer with a confidence band, a reason and a receipt for what it cost and saved. Teams write the question once in a versioned spec, set the thresholds, and call it from any app, agent or Claude Code hook.

## Who it's for

- **Primary:** dev teams running AI. That means engineers and platform leads who put AI decisions into apps and coding agents, and who own the bill and the risk.
- **Secondary:** developers who live in Claude Code or Codex all day and want a check on "done" claims and risky commands. They enter through the Bandwise Gate plugin (ADR-021).
- **Not for:** non-technical buyers, no-code builders, or anyone who wants a chat assistant. Bandwise answers structured questions and stays out of chat.

## Why it exists

It knows how sure it is. Every AI decision comes with a band, an action and a receipt. The rest of the market returns a yes or no and a bill. Bandwise sends the sure answers straight through, routes the shaky ones to evidence or a person, and shows the cost of every call to the digit.

## Brand personality

- **Calm:** leads with the state. Bad news gets the same tone as good news.
- **Candid:** puts the cost and the caveat next to the claim, and says "we don't know" when that's the truth.
- **Street-smart:** plain words, a little edge, concrete nouns. A good foreman, not a pitch deck.

## Anti-references

- Inter for everything.
- Purple-to-blue gradients.
- Cards nested inside cards.
- Gray text on colored backgrounds.
- A rounded-square icon tile above every heading.
- **Warm palettes:** cream, tan, clay, coral, orange, rust. That rules out the old amber "survey instrument" look, and it keeps Bandwise away from Anthropic's colors.
- **Enterprise AI suites:** navy, stock handshakes, "trusted AI" slogans.
- **LLM-ops dashboards:** dark neon charts, dense panels, alert red everywhere.
- **Hype startup sites:** gradient blobs, "10x your team" headlines, hero metrics with no source, emoji bullets.
- **Terminal cosplay:** green on black, fake typing animations, ASCII art.

The references we lean toward are typesafe.ai, for its blunt numbers-first copy, and factory.com, for one confident accent on a calm base.

## Design principles

1. **Number first.** If a screen has a band, a score or a cost, it is the first thing the eye lands on, set in mono with its label.
2. **Color never works alone.** A band always has its word and its number. A layout must still make sense in grayscale.
3. **The set decides, not the brand.** Thresholds, model facts and prices come from the spec and the model registry. Design draws them; it never hard-codes them.
4. **One loud thing per region.** One chamfered element, one display headline, one moving thing. Everything around it stays flat and quiet.
5. **Show the receipt.** Any claim of savings shows its digits and its source. If we can't show the number, we don't make the claim.
