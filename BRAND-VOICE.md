# Bandwise brand voice (v1.0)

Source: the brand kit v1 that PJ delivered, locked in by Nick on 2026-10-01 (ADR-022), now at v1.6 (`brand/CHANGES.md`). The writing rules in `CLAUDE.md` still apply on top of this file.

## One line

Calm, candid, street-smart. Like a good foreman: it says what is true, gives the number, and says when it doesn't know.

## Principles

1. **Calm.** Lead with the state: "Not done yet." No alarm and no hype. Bad news gets the same tone as good news.
2. **Candid.** Say what it cost and what it doesn't know: "We don't know. A person should look." Never imply certainty the model lacks. Jev is a cost and speed play at mid-tier accuracy. Never write "as accurate as", and never write that 0.8 means right 80% of the time.
3. **Street-smart.** Plain words, a little edge, concrete nouns: "Faint trail. Kicking it to you."

## The four-part answer

Every result reads in four parts:

1. **State**, in one sentence.
2. **Band**, with its number.
3. **Why**, as one fact.
4. **Cost**, in dollars, with exact digits.

Example: "Not done yet. / Medium · 0.71 / 7 tests in auth/ regressed / $0.00003, saved ~$0.004"

## Fixed terms

- **Name.** In the logo, the wordmark is always lowercase "bandwise" and always sits with the ant mark (A or C). In prose, UI, docs and CLI text, "Bandwise" and "bandwise" are both fine, the way Facebook and facebook both are. Pick one per surface or document and keep to it.
- **Bands:** High, Medium and Low.
- **Actions:** ship, get evidence, ask a person.
- **Trail** means traceable history: "strong trail", "faint trail".
- **Receipt** means the record of one decision.

## Do

- Name the band and the number.
- Write short sentences with active verbs.
- Say what it cost, to the digit.
- Use sentence case for headlines, buttons and labels.
- Keep punctuation plain. Use a regular dash if you need one.
- Take public numbers only from `docs/marketing/claims.md`, and keep each one's caveat beside it.

## Don't

- **Hype:** powerful, revolutionary, AI-powered, supercharge, unlock, leverage, seamless, game-changing.
- **AI filler:** utilize, delve, robust, comprehensive, cutting-edge, streamline, empower, furthermore, moreover.
- **Vague money:** pennies, affordable, cost-effective.
- **Cute errors:** "Oops!", "Uh oh".
- **Formatting:** Title Case headlines, all-caps display text, exclamation marks, emoji, em dashes.

## Before and after

| Before | After |
|---|---|
| "Our AI-powered engine seamlessly verifies your agent's work with cutting-edge accuracy!" | "Your agent says it's done. Bandwise checks the claim, gives it a band and a reason, and tells you what the check cost." |
| "Oops! Something went wrong. Please try again later." | "Couldn't reach the model. Nothing shipped. Retry." |
| "Save pennies on every decision." | "This check cost $0.00003 and saved about $0.004." |

## UI copy patterns

| Where | Write |
|---|---|
| Primary button | Ship it / Review 3 decisions / Run a check |
| Empty state | Nothing on the trail yet. Run your first check. |
| Error | Couldn't reach the model. Nothing shipped. Retry. |
| High band | Strong trail. Shipping it. |
| Medium band | Not done yet. Then one fact, for example "7 tests in auth/ regressed." |
| Low band | Faint trail. This one is yours. |
| Success toast | Shipped. 0.91 · $0.00002. |
| Unknown | We don't know. A person should look. |
| Docs intro | Bandwise tells you how sure it was. Here is how to read it. |
| Tagline | Small model. Heavy lifting. |
| Support line | It knows how sure it is. |

## Voice by surface

- **Marketing (www):** the boldest of the four. One display headline per view, a number in the first screen, and the caveat beside it.
- **In-app (console):** quiet and exact. State first, then band, why and cost. Labels are nouns. Buttons are verbs.
- **Errors and empty states:** say what happened, what did not happen, and the next step. Never blame the person.
- **Docs:** plain and complete. Explain the mechanism with a worked example, using real spec fields and real numbers from fixtures.

## Sample lines

- "This check cost three thousandths of a cent."
- "Small model. Heavy lifting."
- "You set the line. We sort the answers."
- "A person should look."
