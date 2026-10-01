# Claims register for the marketing site

ADR-018 allows only claims we can source. Every number on www.bandwise.dev comes from this file, with its source and the caveat that has to travel with it. Add a row before using a new number, and re-check sources before a launch.

| Claim | Source (checked) | Caveat to keep next to it |
|---|---|---|
| Jev costs $0.042 per million input tokens; output is not billed | TypeSafe docs and pricing, OpenRouter, Vercel and Cloudflare model pages (2026-09-26 and 27) | Price book in our model registry is the live value; the site reads it, never hard-codes it |
| On TypeSafe's 4-workflow benchmark, Jev scored 67.8% at about $0.0004 and 0.4 s per case; GPT-5.6 Terra 67.9% at $0.0304 and 10.1 s, GPT-5.6 Sol 74.1% at $0.0836 and 23.3 s, Claude Opus 5 73.1% at $0.1761 and 37.8 s | DataCamp summary of TypeSafe's benchmark, https://www.datacamp.com/blog/system-one-models-jev (2026-09-27) | Vendor benchmark. The reference answers are the average of two frontier models, not human labels. Jev is a cost and speed play at mid-tier accuracy; never say "as accurate as" |
| Up to 194x faster and 445x cheaper than LLMs on TypeSafe's workflow evaluations | Vercel blog, https://vercel.com/blog/ai-gateway-jev-model-launch (2026-09-27) | Vendor framing; say "TypeSafe reports" |
| About 13% of Vercel AI Gateway paid teams used Jev within 24 hours of launch, 2x the GPT-5.6 family and more than 6x Fable 5.1 | Vercel blog, same URL (2026-09-27) | Adoption, not proof of quality |
| Calibration: higher confidence means higher accuracy | TypeSafe docs describe confidence as the spread of the answer distribution, not the chance of being right | Do not claim "0.8 is right 80% of the time". An independent study found raw calibration error of 0.117 on one sentiment task, cut to 0.008 with isotonic calibration (github.com/AnthusAI/Jev-Calibration). Our pitch: we measure your accuracy on your own labels |
| Calculator comparators: Claude Haiku 4.5 at $1 input and $5 output per million tokens; Claude Fable 5.1 at $10 input and $50 output | Anthropic pricing, https://platform.claude.com/docs/en/about-claude/pricing (2026-09-28) | Base API prices, no caching or batch discount. The calculator reads them from the core price book; update both together |
| TypeSafe accepts pinned versioned model ids (for example `jev-1.13.0`) next to aliases, so thresholds tuned on one version stay on it | TypeSafe docs, https://docs.typesafe.ai/models.md (2026-09-28) | The site's provider table says the direct route has pinned versions for controlled and full rollout; that pairing is our rule (ADR-008), not TypeSafe's |
| OG and social images show "0.71 · $0.00003 · saved ~$0.004" | Brand kit v1 art (`brand/social/`), example values, not measured (Nick, 2026-10-01: fine as examples for now) | Illustrative only. Replace with real dogfood receipt numbers by 2026-10-15, and never quote these numbers in page copy |

## Things the site must not say

- That Jev "never hallucinates". It cannot return a type outside the schema, but it can pick a wrong valid option.
- That anyone should paste an API key into a chat assistant. Keys stay on the server.
- Accuracy numbers for Bandwise templates. They are validated to run, not measured for accuracy.
- Customer names, including Nick's orgs, without written approval.
