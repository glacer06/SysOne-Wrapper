# Design research log

The forge-design Research step (operator-kit `kit/skills/forge-design/references/research.md`) for Bandwise. Links and notes only, no third-party screenshots. Borrow the pattern, never the pixels. Direction seeds feed Generate; Nick picks per surface.

Sources for the 2026-10-01 round: Mobbin (MCP). Refero unavailable.

## 2026-10-01: www home hero and top nav, web (desktop and mobile)

Job: www home hero and top nav, web: make a skeptical engineer see one real receipt (band, reason, cost) and the way in, within the first screen.

Scene: A platform lead on a 14-inch laptop between standups in a bright open office, or on a phone in the evening after a teammate posted the link, arms folded, scanning for the catch.

Sources: Mobbin (MCP). Refero unavailable. Nick's refs: factory.com, typesafe.ai.

### Ref 1: Hermes Agent, home hero (https://mobbin.com/sites/sections/e9c68c38-072b-403d-8888-26042d246b35)
Pattern: Under the headline sit two stacked install blocks, each with a tiny mono uppercase label ("INSTALL VIA TERMINAL"), and the terminal block has OS tabs plus a copy button. A mono kicker above the headline states license facts, not hype.
Fits our scene because: The engineer wants to know how to try it before reading claims. Tabs map to our three doors: the Gate plugin for Claude Code, `npx @bandwise/cli`, and `/api/v1`.
Not taking: The saturated blue flood, all-caps serif headline, etched illustration, centered spaced-out nav.

### Ref 2: Bird, top nav (https://mobbin.com/sites/sections/3369b81d-787c-4970-b49e-165e0393bc43)
Outside category (business messaging).
Pattern: The nav is a row of hairline-bounded cells. The logo sits in its own square block at the far left, and the primary CTA is a solid block at the far right; links are plain words in between.
Fits our scene because: It reads like a stamped label strip on a tool crib, flat with 1px hairlines, which is exactly our surface rule. It gives the chamfered primary button one clear home.
Not taking: The black logo block (no pure black in our palette), the blurred gradient image below, the logo wall.

### Ref 3: Origin, product hero (https://mobbin.com/sites/sections/7617d355-486e-4c61-88d3-2f42998f3e18)
Outside category (personal finance).
Pattern: Headline and one line of support at left; at right, one product card set on a tinted plate, so the card reads as an exhibit rather than a screenshot. Below the fold edge, a three-column row with mono uppercase labels and one sentence each. Nav links are mono uppercase.
Fits our scene because: "Number first": a single decision card on a plate puts the band, score and cost where the eye lands, with no browser chrome or fake app frame.
Not taking: Serif display, the purple area chart, pill buttons, the floating chat bubble.

### Ref 4: factory.com, home (Nick's reference; https://factory.com/)
Pattern (per Nick): small mark plus wordmark at top left, mono uppercase CTAs, a terminal install line under the hero, one confident accent on a calm base. Fetched as an agent, it also serves a plain "Start here" page with a documentation index for agents and an OpenAPI link.
Fits our scene because: Same buyer, same skepticism. One accent on a calm base is our teal-on-ink rule. The agent-facing page is a reminder that our headless parity is a selling point worth a link in the nav or hero foot.
Not taking: Their copy, their accent color, "Droids" naming, any of their layout proportions.

### Ref 5: Tesla, app menu sheet (https://mobbin.com/screens/d109fe47-250f-4493-a7fe-c334958d9878)
Outside category (automotive), used for the mobile nav.
Pattern: A full-height menu of plain rows with chevrons, grouped by hairlines, and a footer row with the app version in muted text, then legal links underlined.
Fits our scene because: On a phone the menu should be a quiet list of nouns with one primary button, and a version stamp at the foot reads like a load rating on a hook (calm, exact, a little street-smart).
Not taking: The photo thumbnails, the dark-only treatment, back-arrow header.

### Direction seeds

**A. Exhibit on a plate.** Lockup C (horizontal) at left in a Bird-style hairline cell, three nav nouns (Docs, Pricing, Gate plugin) in Schibsted 14px, "Sign in" as ghost, "Get early access" as the one chamfered primary. Hero splits 5/7: the display headline "Small model. Heavy lifting." with the support line beneath, then a code block labeled `INSTALL` holding `npx @bandwise/cli` with a copy button. The right 7 columns hold one decision card from `heroReceipt` on a `--bw-bg` plate inside a 1px frame (Origin). The card runs the fixed order: state, BAND (badge + score), WHY, COST, then a small ruler with the set's thresholds. On load, the ant walks the ruler once and stops at the score; reduced motion shows the end state. Mobile: headline, card, install block, in that order; the menu is a full sheet of rows with the version stamp at the foot (Tesla). Traces Refs 2, 3, 4, 5.

**B. Three doors.** The hero is headline-led and full width, with the receipt reduced to one mono line under the support copy (band, score, cost, set ID). Under it sits a tabbed install block (Hermes): `Claude Code` (Gate plugin install), `CLI` (`npx @bandwise/cli`), `API` (`POST /api/v1/sets/{ref}/run`). The tab label is mono 12px uppercase; the active tab carries a 2px teal underline, not a fill. The nav adds a mono "llms.txt" link at the far right before the CTA (factory's agent page). Mobile: tabs become a select-style segmented control above one code block. Traces Refs 1, 4.

**C. The ruler as horizon.** A full-width confidence ruler runs across the hero at about 60% height, drawn at a real dogfood set's thresholds, with the ant mark A standing on the trail at the left. The headline sits above the ruler. Below it, three short mono annotations hang from the thresholds: "LOW: a person looks", "MEDIUM: get evidence", "HIGH: ship". Under the marker, the four-part receipt reads in one mono line. The nav is the Bird cell strip with mono uppercase labels (Origin). Watch: violet and red must stay under 10% of the screen, so the ruler is thin (6px) and the segments carry their words. Traces Refs 2, 3 and typesafe.ai's number-first copy.

Directions this fed: A from Bird, Origin, factory, Tesla. B from Hermes, factory. C from Bird, Origin, typesafe.ai.

---

## 2026-10-01: www "how it works" and receipt sections, web

Job: www how-it-works and receipt sections, web: show a skeptical engineer exactly what a band, a reason and a cost mean on one real decision, and where the line between them comes from.

Scene: The same engineer has scrolled past the hero on a desktop monitor, coffee in hand, now reading slowly with a second tab open to the docs, looking for the mechanism and the fine print.

Sources: Mobbin (MCP). Refero unavailable. Nick's ref: typesafe.ai.

### Ref 1: Heron AI, "Built to work the way you do" (https://mobbin.com/sites/sections/b9316f64-5154-4826-ba08-759cb29bbf75)
Outside category (AI for building design, not a dev tool).
Pattern: A drawing on a measured grid with small corner crosses; a single callout tag is pinned to one exact spot by a thin leader line, and the step name runs in a labeled bar ("OBSERVE") beside the drawing.
Fits our scene because: Annotating one receipt with leader lines to each row (BAND, WHY, COST) explains the mechanism on the real object instead of on icons. The grid and crosses fit the tool-crib, spec-plate feel.
Not taking: The red-orange accent, the all-caps display headline, the architecture drawing.

### Ref 2: Firecrawl, CLI section (https://mobbin.com/sites/sections/363363b9-a122-4092-8c41-962f962e6a46)
In category (dev tool).
Pattern: Steps listed at left as selectable rows (title plus one line), each swapping the right pane, which shows the exact command and its JSON output. A mono step counter "[ 03 / 09 ]" marks progress through the page.
Fits our scene because: The engineer trusts output more than copy. Showing `npx @bandwise/cli run --local spec.json state.json` and the `RunResult` envelope it returns proves the band and cost are fields, not marketing.
Not taking: The orange highlight words in the headline, the window-control dots, the dashed outer grid.

### Ref 3: Upwork, cost breakdown sidebar (https://mobbin.com/sites/sections/22ac9cef-b082-4eb7-a5ae-1f598c3cabc2)
Outside category (freelance marketplace).
Pattern: A sticky right column titled "Cost breakdown" lists line items with right-aligned amounts, a hairline, then a bold Total row.
Fits our scene because: "Show the receipt": the cost row can expand into its parts (input tokens, price per million from the registry, this check's cost, the escalation it avoided, saved) with exact digits, right-aligned in tabular mono.
Not taking: The input boxes, the green, the category tiles.

### Ref 4: mymind, invoice feature card (https://mobbin.com/sites/sections/4441237a-2e84-4fd8-a4dd-683a3c21c5d9)
Outside category (consumer bookmarking).
Pattern: A real invoice document used as the feature image: issuer block, date, a description and subtotal row, then a "TOTAL PAID" label with the amount, everything right-aligned and labeled in small caps.
Fits our scene because: Our receipt is literally a document. Treating it as a paper-like record (white surface on cool bg, hairline rows, labeled amounts) makes "receipt" concrete without metaphor art.
Not taking: The orange gradient plate, the serif, the bordered sticker.

### Ref 5: typesafe.ai, numbers sections (Nick's reference; https://typesafe.ai)
In category.
Pattern: Blunt figures as headlines ("193.6x Faster, 444.6x Cheaper", "$42 Per Billion input tokens") paired with a proof link ("Watch the real video").
Fits our scene because: Number first with the source one click away. Every figure we show comes from `docs/marketing/claims.md` with its caveat in the same block.
Not taking: Their figures as our claims, the "x faster" framing (TypeSafe's benchmark is vendor framing; we say "TypeSafe reports").

### Direction seeds

**A. One receipt, annotated.** A single decision card, centered and large (about 560px wide), on a measured hairline grid with corner crosses (Heron). Thin leader lines run from each row to a plain-language note in the margin: STATE "What happened, in one sentence"; BAND "Medium · 0.71. Where the score fell against this set's lines"; WHY "One fact the model used"; COST "What this check cost, to the digit." A three-way switch above the card (High, Medium, Low) swaps in a real fixture decision for each band, and the action line changes: ship, get evidence, ask a person. The cost row expands into the Upwork-style breakdown. One chamfered element: the card. Traces Refs 1, 3, 4.

**B. Command, then receipt.** Firecrawl's split. Left: three step rows, "Write the question" (a spec excerpt), "Set the line" (thresholds in the spec), "Read the receipt" (the output). A mono counter "[ 2 / 3 ]" sits above. Right: one code block that shows the spec fields or the command and its `RunResult` envelope, with the `band`, `reason` and cost fields lit by a 1px teal outline (not text color, to keep teal off light text). Below, a claims strip: Jev's price and the benchmark line, each with its caveat and a source link (typesafe.ai's proof-link move). Traces Refs 2, 5.

**C. Ledger.** The section is a ledger, not cards: one ruler drawn once across the top at a dogfood set's thresholds, with three markers at three real scores. Each marker drops a hairline to its row below. Each row reads state, band badge, why, action, and a right-aligned cost in tabular mono. The last row is a Total: three checks, their summed cost, and the spend avoided, with "illustrative" or the dogfood source beside it. This avoids an identical card grid by making the three decisions rows of one record. Traces Refs 3, 5, and Heron's leader lines (Ref 1).

Directions this fed: A from Heron, Upwork, mymind. B from Firecrawl, typesafe.ai. C from Upwork, typesafe.ai, Heron.

---

## 2026-10-01: www brand moment and footer, web

Job: www brand moment and footer, web: end the page on one confident lockup that people remember, with the links and legal row an engineer actually needs.

Scene: Someone has read to the bottom on a desktop at night in dark mode, mostly convinced, deciding whether to bookmark the docs or close the tab.

Sources: Mobbin (MCP). Refero unavailable. Nick's ref: typesafe.ai.

### Ref 1: typesafe.ai, footer brand moment (Nick's reference; https://typesafe.ai)
In category.
Pattern (per Nick): a large mark plus wordmark over a dashed pixel wireframe of the mark, corner brackets framing it, a mono encoded string (base64 per the fetch) as a quiet easter egg.
Fits our scene because: Ending on the mark, framed like a spec drawing, gives the page a signature without adding claims. The encoded string rewards the engineer who looks closely.
Not taking: The wireframe of the mark as drawn by us (DESIGN.md rule 5 forbids redrawing the ant or B; needs a PJ asset), their string, their proportions.

### Ref 2: Zellerfeld, footer (https://mobbin.com/sites/sections/18df6730-6569-49da-9c23-3bee32fbe638)
Outside category (3D-printed footwear).
Pattern: Mark plus wordmark lockup spans the full content width at the bottom of a dark footer. Above it, four short link columns with tiny mono uppercase headers (COMPANY, LEGAL, SOCIAL), and an address block at left.
Fits our scene because: The lockup is the brand moment and the footer at once, so there is no extra section to scroll. Mono uppercase headers are our label style exactly.
Not taking: The white-on-near-black lockup proportions, their blob shape, the shoe-category column.

### Ref 3: Wispr Flow, footer (https://mobbin.com/sites/sections/d2b17651-2709-4db5-99f2-d14af9dd09b2)
Adjacent category (AI dictation, not dev tools).
Pattern: Three link columns with small headings at top, then mark and wordmark at very large size, then a single legal row (copyright, Terms, Privacy) with social icons right-aligned.
Fits our scene because: Clear order: links, lockup, legal. It proves the large lockup can sit between functional rows without crowding them.
Not taking: The cream background (warm palettes are banned), the serif column headings.

### Ref 4: Structured, footer (https://mobbin.com/sites/sections/cf954a98-4f2e-41d3-b2a1-168e4ba0108d)
Outside category.
Pattern: The wordmark runs nearly edge to edge; nav links stack in small mono caps at the top right; the legal row hugs the bottom edge in the same small caps.
Fits our scene because: Shows how little else a footer needs when the lockup carries it. The stacked top-right list suits a short link set (Docs, Gate plugin, Status, llms.txt, GitHub).
Not taking: A standalone wordmark (ours always sits with the ant), the serif.

### Ref 5: Strava, monthly share card (https://mobbin.com/screens/02cd5c88-9922-4d47-8da3-bba089b6eecf)
Outside category (fitness).
Pattern: A stamped strip along the card's bottom edge repeats the brand name and the period ("STRAVA MAY 2026") like tape.
Fits our scene because: A static stamped strip reads like a load label on a hook. It can carry the tagline and a real fact ("SMALL MODEL. HEAVY LIFTING. · RECEIPTS SINCE 2026-09-30").
Not taking: The marquee scroll (no idle loops), the glow, the orange.

### Direction seeds

**A. Load-rating plate.** The stacked lockup A sits centered in a 1px frame with corner brackets (typesafe), sized well above its 96px minimum. Mono 12px dimension labels sit on the frame like a spec plate: "CLEAR SPACE 0.5B", "MIN 96PX", and "LOAD: 1 DECISION · $0.00003" (illustrative, from claims.md). Under the plate, one mono line carries a real receipt ID from dogfood in place of typesafe's encoded string. The link columns and legal row sit below in the Zellerfeld arrangement. No wireframe until PJ supplies one. Traces Refs 1, 2.

**B. Full-width lockup.** Link columns first (Wispr), headed in mono 12px uppercase: PRODUCT, DOCS, AGENTS (llms.txt, openapi.json, MCP), COMPANY. Then the horizontal lockup C spanning the 1200px content width as the brand moment (Zellerfeld, Structured). Then the legal row with a version stamp at the right in muted mono. Dark footer on `--bw-bg` dark values even in light theme is tempting; check it against theme rules before choosing. Traces Refs 2, 3, 4.

**C. Trail to the edge.** A trail divider (`.bw-trail`) runs the width of the footer's top edge, its dots growing toward one teal node directly above the ant in lockup A. Below the lockup, one static stamped strip (Strava) in mono uppercase carries the tagline and the receipts start date. Links stack top right in small mono caps (Structured). Traces Refs 4, 5, and the brand's own trail motif.

Directions this fed: A from typesafe.ai, Zellerfeld. B from Wispr Flow, Zellerfeld, Structured. C from Structured, Strava.

---

## 2026-10-01: docs home (docs.bandwise.dev), web

Job: docs home, web: get a developer (or their agent) from landing to their first real check in one click, and teach them to read a receipt.

Scene: A developer at a desk with the editor on one monitor and the docs on the other, mid-task in daylight, wanting the one command and the one page, and an agent in their terminal fetching the same docs as text.

Sources: Mobbin (MCP). Refero unavailable. Nick's ref: factory.com (agent-facing page).

### Ref 1: Typeform, help home (https://mobbin.com/sites/sections/e19ebb17-0f66-4bb7-82c5-ae30af0fcc19)
Outside category (forms).
Pattern: One question as the headline ("What do you need help with?") and a search field drawn as an underline only, with a lot of empty space around it.
Fits our scene because: The product register is quiet. A single plain question and an unboxed search keeps the first screen calm and puts the developer's intent first.
Not taking: Their sans, the centered "Trending Topics" card row below.

### Ref 2: Sketch, documentation home (https://mobbin.com/sites/sections/8ab0580d-f853-4c0c-91f4-e70bbb530465)
Outside category (design tool).
Pattern: Search with a "Popular pages:" row of small chips directly under it, then "Explore all topics" as plain rows with a trailing arrow.
Fits our scene because: Chips can name the three things people actually come for ("Read a receipt", "Set thresholds", "Install the Gate plugin"), and rows with arrows avoid an icon-tile grid.
Not taking: The red-orange gradient-like display word, the floating document icons.

### Ref 3: ElevenLabs, developer overview (https://mobbin.com/screens/fff7b2c5-a015-4027-ab22-901ef51647f2)
In category.
Pattern: A "Developer quickstart" panel: short text and one button at left, a real code block with line numbers and a language switcher at right. Below, "Quick Links" as a 3x2 set of plain bordered rows.
Fits our scene because: The developer wants the first call now. A code block with CLI, TypeScript and curl tabs, fed by real fixture output, is the fastest path.
Not taking: The promo banner, the nested rounded panels (cards inside cards are banned).

### Ref 4: GitHub Docs, home (https://mobbin.com/sites/sections/d81325dc-13fe-4211-9ba6-a26c6842835a)
Outside category (dev platform, not AI).
Pattern: A version selector in the header, then link groups in columns under small headings, plain text links, no cards.
Fits our scene because: Specs are versioned and published versions are immutable; a version selector is honest. Link columns scale as the docs grow without becoming a card grid.
Not taking: The mascot illustration, the blue links.

### Ref 5: factory.com, as served to an agent (https://factory.com/)
In category.
Pattern: A "Start here" list that names a documentation index for agents, the public API, the OpenAPI specification and a sitemap, each as a plain link.
Fits our scene because: Headless parity is a rule here. The docs home should give agents a first-class door (`llms.txt`, `openapi.json`, the MCP server) next to the human one.
Not taking: Their copy and naming.

### Direction seeds

**A. Read a receipt first.** Headline from the voice guide: "Bandwise tells you how sure it was. Here is how to read it." Below, one worked receipt from the typesafe fixtures, each row (STATE, BAND, WHY, COST) linking to its concept page. Then GitHub-style link columns: Start (Install, First check, Gate plugin), Concepts (Bands, Thresholds, Receipts, Rollout), Reference (CLI, `/api/v1`, MCP), For agents (`llms.txt`, `openapi.json`). Search lives in the header with a version selector beside it. Traces Refs 4, 5.

**B. One question, three doors.** Typeform-quiet top: "What are you checking?" with an underline search and Sketch-style chips beneath. Below, three full-width rows, not cards, each with its first command in mono: Claude Code (Gate plugin install), CLI (`npx @bandwise/cli`), App (`POST /api/v1/sets/{ref}/run`). A final muted line: "For agents: llms.txt · openapi.json · MCP". Traces Refs 1, 2, 5.

**C. Quickstart bench.** ElevenLabs split, flattened: left, three numbered steps in body text; right, one code block with tabs (CLI, TypeScript, curl) and the real fixture `RunResult` printed beneath it, the band badge rendered beside the JSON. Quick links follow as plain rows with arrows (Sketch). One chamfered element: the "Run a check" primary. Traces Refs 2, 3.

Directions this fed: A from GitHub Docs, factory.com. B from Typeform, Sketch, factory.com. C from ElevenLabs, Sketch.

---

## 2026-10-01: Bandwise Gate plugin listing art and OG image (1200x630), web and social

Job: Gate listing art and OG image, social and marketplace: show one decision receipt so clearly that it reads at feed size and says what Bandwise does without a caption.

Scene: An engineer scrolling a busy feed or a plugin marketplace on a phone, the card about 500px wide among photos and screenshots, giving it a second at most.

Sources: Mobbin (MCP). Refero unavailable. Internal baseline: `brand/social/bandwise-social-og-dark.png`.

### Ref 1: pushr, workout share card (https://mobbin.com/screens/aa55ae53-75dd-425e-beee-6656a8e3649a)
Outside category (fitness).
Pattern: One enormous number with its unit set beside it and a timestamp under the unit, then a row of three small labeled stats in caps.
Fits our scene because: At feed size only one thing reads. A huge score ("0.71") with the band word beside it, then WHY and COST as small labeled stats, survives a 500px render.
Not taking: Their type, the blurred backdrop, the share icons.

### Ref 2: Brink, share card (https://mobbin.com/screens/030d8444-998f-4263-aa6a-9ed1a7d3c072)
Outside category (podcasts).
Pattern: Brand mark top right, a small caps label top left, one big stat, a hairline, two small stats, an itemized list, and a tiny footnote ("Made on Brink").
Fits our scene because: It is already a receipt layout. The footnote slot is where the claims caveat goes ("Example values").
Not taking: The pale violet gradient, the rounded card on card.

### Ref 3: Beli, share card (https://mobbin.com/screens/b90ece28-8ba8-4718-a7c3-3b010ab774e5)
Outside category (restaurants).
Pattern: A tinted card on a solid field: a "LAST 30 DAYS" caps label, a one-line title, two stats with small icons, one comparison sentence, the logo centered at the bottom.
Fits our scene because: Title as one sentence maps to our STATE line ("Not done yet."). The period label suits a savings variant ("LAST 7 DAYS · 412 CHECKS").
Not taking: Navy on lavender, centered logo (our lockup has fixed placements), icons beside stats.

### Ref 4: Strava, monthly share card (https://mobbin.com/screens/02cd5c88-9922-4d47-8da3-bba089b6eecf)
Outside category (fitness).
Pattern: A stamped repeating strip across the bottom edge with brand and date.
Fits our scene because: A stamped strip ("BANDWISE GATE · RECEIPT · 2026-10-01") brands the card at any crop, which helps the square listing variant.
Not taking: Glow, orange, the glass card.

### Ref 5: Bandwise, current OG (internal; `brand/social/bandwise-social-og-dark.png`)
Pattern: Lowercase wordmark top left, the tagline as a four-line display headline, a muted support line, the receipt as one teal mono line at the bottom, and the ant mark A carrying the B up the trail at right.
Fits our scene because: It is on brand and approved art. What it lacks for this brief: the receipt is a footnote, not the subject.
Not taking: The structure as-is; Generate should invert it so the receipt leads.

### Direction seeds

**A. The receipt is the card.** A decision card fills the left two thirds, chamfered top-right and bottom-left, rows set large enough for feed size (state 44px Archivo, labels 18px mono, values 32px mono): STATE "Not done yet.", BAND MEDIUM badge with 0.71, WHY "7 tests in auth/ regressed", COST "$0.00003, saved ~$0.004". Mark C sits at right on the trail; the footnote line (Brink) reads "Example values". Square listing variant: the card alone with the B monogram top right. Traces Refs 2, 3, 5.

**B. Big score.** "0.71" set in Archivo Expanded 800 at about 220px, with the MEDIUM badge beside it (pushr). A thin ruler below at a dogfood set's thresholds, the marker at 0.71, and the ant mark A standing at the marker on the trail. WHY and COST run as two small labeled mono stats under the ruler. Lockup C small at top left. Violet stays under 10%: only the badge and the ruler's medium segment. Traces Refs 1, 5.

**C. Stamped ticket.** The card is a tool tag: a white (light) or `--bw-surface` (dark) ticket on the ink field, rows in the fixed order with hairlines, and a static stamped strip across the bottom edge (Strava) reading "BANDWISE GATE · CHECKED A DONE CLAIM · $0.00003". The Gate listing art uses the same ticket cropped square with the strip intact. Traces Refs 2, 4.

Open questions for Nick: the Claude Code plugin marketplace's listing image sizes (not found in the repo; the Gate plugin lives in `plugins/claude-code/`), and whether the OG may switch to real dogfood numbers before the 2026-10-15 deadline in claims.md.

Directions this fed: A from Brink, Beli, current OG. B from pushr, current OG. C from Brink, Strava.

## 2026-10-01: Runs list and run detail, desktop web and phone

Job: Runs list and run detail, desktop and phone: tell an engineer what one run decided, how sure it was, why, and what it cost, before they read anything else.

Scene: A platform engineer at a standing desk mid-afternoon, an incident thread open in the other window, clicking through from a Slack link to one run to find out why the agent hook blocked a merge; daylight office, focused and a little impatient.

Sources: Mobbin (MCP). Refero unavailable.

### Ref 1: Stripe, payment detail (https://mobbin.com/screens/464dcf70-a0d4-4ba9-b23d-ca6ba18e60f5)
Pattern: The amount is the page title, with a status badge set right beside it. Under it, a "Payment breakdown" is a plain two-column ledger (amount, fees, refunded, net) with hairlines and right-aligned figures, and a right rail holds IDs and metadata. A risk evaluation shows a number with a word ("4, Normal").
Fits our scene because: our run detail needs the same "the number is the headline" move. The decision card's COST row and a per-stage cost ledger map directly onto the breakdown, and the score-plus-word risk line is our band rule (word and number together) already working in finance.
Not taking: Stripe's purple, the full timeline column on the left (our stages are a table, not events), the right rail at phone width.

### Ref 2: Whop, payment detail with fee breakdown (https://mobbin.com/screens/007a67c6-3c72-4910-9d5c-9552de96dc35)
Pattern: A single centered column with the amount and a status chip on top, a full-width notice with the one thing you must do next, then an itemized breakdown that ends in a bold net line, then an activity list. Two short checkmarked lines state what was screened and passed.
Fits our scene because: it proves a one-column, number-first detail reads well and collapses to phone width without rework. The "net amount" closing row is our "spent $0.00003, saved ~$0.004" line, and the checkmarked facts are a model for the WHY row.
Not taking: the yellow warning banner, the side cards, any orange.

### Ref 3: OpenAI Platform, log detail (https://mobbin.com/screens/1571dd77-4cb7-4496-9723-d33135937cc5)
Pattern: Breadcrumb ("Logs / Responses"), then input and output blocks in mono, with a right "Properties" rail of created, ID, model, tokens and configuration as label-value rows.
Fits our scene because: our "What the run saw" input and "Raw answers from System One" are the same content. It shows the depth layer: raw JSON belongs below the fold, in mono, after the decision card.
Not taking: leading with the prompt. OpenAI opens on the input; we open on the verdict. Also not taking the AI-console visual family.

### Ref 4: Vercel, deployments list (https://mobbin.com/screens/d1dee152-f0ee-4fde-95b2-ff5dacc05125)
Pattern: Dense rows where a colored dot plus a word ("Ready", "Error") and a duration sit in one cell, the commit message and branch in mono in another, author and relative time on the right. A filter bar of dropdowns (date range, environment, status) sits above, and a small "Rolled back" tag marks exceptions inline.
Fits our scene because: the runs list is a scan for the one bad row. Dot plus word plus mono number is our band badge, and inline exception tags fit `shadow`, `fallback` or `escalated` without extra columns.
Not taking: the date-picker popover covering the list, the avatars, the Vercel black-and-white identity.

### Ref 5: Wise, transaction details (https://mobbin.com/screens/ea2fde3e-8b3e-4ef8-92d9-ea5dc9e51fda)
Pattern: A small card with the amount and a one-line state, then a vertical step list ("You set up your transfer", "We received", "We paid out") in plain sentences, the last step bold, with "Updates" and "Details" tabs.
Fits our scene because: outside our category, and it writes state as a sentence, which is exactly the decision card's title ("Not done yet."). The Updates and Details split is a calm way to hold the decisions table and the raw answers on phone.
Not taking: the green, the rounded pill buttons, the step list as the main layout.

Directions this fed:
- **A. Receipt column.** One centered column at 720px max, like Whop and Wise. The chamfered decision card is the only loud thing: state sentence in Schibsted 24, then BAND, WHY, COST rows on hairlines, the cost in mono with exact digits and the saved figure on the same row. Below it, the decisions table (question, band badge with score, action, cost) and a stage cost ledger that ends in a bold total, like Stripe's net line. Raw input and answers sit in collapsed mono blocks at the bottom. Phone is the same page, no reflow needed. Traces to Refs 1, 2, 5.
- **B. Verdict plus rail.** Desktop splits 8 and 4 columns, like Stripe and OpenAI. Left: decision card, then decisions table, then "What the run saw". Right rail: run ID, set and version, stage at run, model asked for and model that answered, latency, tokens, all as mono label-value rows with 12px uppercase labels. On phone the rail folds under the card as a "Details" disclosure. The runs list uses Vercel's cell grouping: band badge plus score in the first cell, set slug and version in mono, cost right-aligned, relative time last, exception tags inline. Traces to Refs 1, 3, 4.
- **C. Ruler first.** The run detail opens on the confidence ruler at full width, the set's own thresholds drawn as segments, one marker per counted decision and a heavier marker at the run band. The decision card sits under it. The motion beat (the ant walks to the lowest score, the band lights) plays once on load and shows the end state under reduced motion. The list shows a tiny inline ruler per row instead of a dot. Traces to Ref 1 (score with word) and Ref 4 (scan for the one bad row); the ruler itself is ours.

---

## 2026-10-01: Review queue and review item, desktop web and phone

Job: Review queue and review item, desktop and phone: let one reviewer clear low-band decisions fast, one key per decision, without losing the reason each one is there.

Scene: An on-call engineer at 8:40am with coffee, clearing yesterday's twelve Low decisions before standup, laptop on a kitchen table in daylight, then the last three on the phone on the train; wants to be done, not to browse.

Sources: Mobbin (MCP). Refero unavailable.

### Ref 1: Linear, inbox with detail and undo toast (https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338, https://mobbin.com/screens/14cbb61d-2120-46fa-b29c-b7678e4b85cc)
Pattern: A narrow list on the left (title, one-line reason, relative age), the selected item opens on the right with properties in a side column. Acting on an item removes it and shows a small toast with "Undo" at the bottom right. Empty selection shows a count, not a blank pane.
Fits our scene because: the reviewer's loop is select, decide, next. Undo instead of a confirm dialog keeps one-key resolve safe, which matters when the action executes a policy handler (`execute: true`).
Not taking: the avatar column, the notification framing, Linear's purple.

### Ref 2: Plain, keyboard shortcuts panel on a support queue (https://mobbin.com/screens/9ff26374-0540-4196-be39-6f54bef334cf)
Pattern: A side sheet lists shortcuts grouped "Everywhere" and "On a thread", each a plain verb with a key cap: R reply, E mark done, Z pause, J/K next and previous. The queue on the left is grouped by state with counts ("Needs first response 1").
Fits our scene because: it is the cleanest model for our key map (J/K move, 1 to 3 pick a value, D dismiss, U undo, ? shows the map), and the grouping by state with counts maps onto our reasons (near threshold, audit, challenger diff).
Not taking: the colored icon per status, the long sidebar of views.

### Ref 3: YNAB, approve or categorize new transactions (https://mobbin.com/screens/6be05d9b-ece8-49a8-ba40-238e42e53695)
Pattern: On phone, selected items show a check, and a fixed bottom bar holds the verbs: Cancel, Approve, Categorize, Clear, More. Approve is the default, Categorize is the correction.
Fits our scene because: outside our category, and it is the exact phone shape of our two outcomes: accept the model's answer, or set a different value. A thumb bar at the bottom works on the train.
Not taking: the cream background (banned warm tone), the side-stripe selection accent (banned), the iOS blue.

### Ref 4: Commons, "You have 14 purchases to review" (https://mobbin.com/screens/66a41e49-66c8-4873-b0c7-cea1bdef1702)
Pattern: A bordered block at the top of the list states the count and why review helps in one sentence, shows two items, then "+12 more" and "Review all".
Fits our scene because: the runs page or set page can carry the same block ("12 decisions need a person. Review 12 decisions."), which is our UI copy pattern for the primary button. It keeps the queue reachable from where the engineer already is.
Not taking: the all-caps display type, the round icon tiles.

### Ref 5: Lemni, approve-or-decline on an agent's drafted email (https://mobbin.com/screens/31c9c03a-dff3-4ab4-9710-b2990d13adbe)
Pattern: Three panes: queue, the agent's proposed output in the middle with Decline and Approve directly under it, details on the right (status, priority, assignee, summary). "Waiting for approval" sits as a chip under the item.
Fits our scene because: our review item is also "the model proposed this, a person decides". Putting the buttons directly under the evidence, not in a page header, keeps the eye on what is being judged.
Not taking: the chat-thread framing, the three-pane layout at tablet width, the black primary button.

Directions this fed:
- **A. Split queue.** Linear's two panes. Left list rows: band badge with score, set slug in mono, the reason as one fact, due time. Right pane: the decision card (state, band, why, cost) with the confidence ruler under it, the input the decision saw, then the resolve controls. Keys: J/K move, 1 to 9 pick a value from the question's options, Enter confirms, D dismisses, F opens failure class, ? shows the map (Plain). Resolve advances to the next item and shows an undo toast for 6 seconds. On phone, the list is the page and tapping opens the item full screen with a YNAB-style bottom bar. Traces to Refs 1, 2, 3.
- **B. One at a time.** A focused review mode: one item fills a 720px column, a counter at top ("4 of 12, oldest due in 2h"), the evidence, then a large value picker where the model's answer is preselected with its band badge, and two buttons: "Keep" (chamfered primary) and "Change". Next item slides in from the right on transform only. The list exists but you rarely need it. The entry point is a Commons-style block on the runs and set pages. Traces to Refs 3, 4, 5.
- **C. Table with inline resolve.** For label-kind items in bulk: a dense table, one row per decision, with a value cell you can change in place and a row action to confirm, plus multi-select and a sticky bar "Confirm 8 as answered". Built for audit samples where most answers are right. Phone falls back to Direction A's single-item view. Traces to Refs 2, 3; the in-place value cell is our addition.

---

## 2026-10-01: Savings and reports, desktop web and phone

Job: Savings and reports, desktop and phone: show what each set cost and saved over a period, number first, with the receipt for every figure.

Scene: An engineering lead on a Monday morning in a bright meeting room, laptop on the projector, about to tell the team whether the review and shadow sets are paying for themselves; wants one honest number they can defend, then the per-set breakdown when someone asks.

Sources: Mobbin (MCP). Refero unavailable.

### Ref 1: Tesla, charge stats with petrol savings (https://mobbin.com/screens/f332f73c-408f-46ec-9201-de21fdd6cfb2)
Pattern: "$119 Saved" as the number, with "$115 Total spent" and "$234 Petrol equivalent" beside it, so the saving is shown as the gap between what you paid and what the alternative would have cost. An info icon marks the values as estimates.
Fits our scene because: this is exactly our claim (System One spend versus the LLM estimate for the same calls) and it shows its own receipt. The "estimated" marker is our candid caveat in a single glyph.
Not taking: the dark theme as default, the stacked segment graphic, the blue bars.

### Ref 2: Vercel, usage with consumption breakdown (https://mobbin.com/screens/51ef7780-7659-4dae-a7fe-039d26fb20b7)
Pattern: Period and filter controls in one row (period, products, projects, group by), a daily, weekly or monthly toggle and a "Cumulative" checkbox on a bar chart, then a grouped table: product, a sparkline of usage, usage amount, charge.
Fits our scene because: our per-set table wants this exact row: set slug, a sparkline of decisions per day, spend in mono, savings in mono. The cumulative toggle answers "are we ahead this month" without a second chart.
Not taking: the filled orange bar, the multicolor dots per product, the dropdown-heavy filter row on phone.

### Ref 3: Cofounder, usage with billing receipt (https://mobbin.com/screens/e9c05b3d-54e8-44db-9995-15ab9a95078a)
Pattern: A "Billing Receipt" block lists allowance, then usage charges per item with a share of period usage under each ("92.9% of period usage"), right-aligned signed amounts with more decimals than usual ("-$0.5057").
Fits our scene because: our costs are fractions of a cent, and this shows a ledger that is comfortable with four or five decimals. "Show the receipt" is one of our design principles; this is the receipt shape.
Not taking: the warm cream panels (banned), the card pair above the receipt (hero-metric adjacent).

### Ref 4: Copilot Money, category detail (https://mobbin.com/screens/7eed96d4-5f9a-4e3a-97ba-6c2e8bbdfe09)
Pattern: One spent figure with "left" under it, a twelve-month bar strip with a budget line drawn across, then "Key metrics" as two label-value rows (total this year, average per month), then the transactions that make up the number.
Fits our scene because: outside our category. The per-set view can follow the same order: one figure, one strip, two metrics, then the runs behind the number, which is the drill-through from savings to runs.
Not taking: the orange title, the green and red bar coding (color alone), the emoji-like category icon.

### Ref 5: Revolut, spent over 6 months with categories (https://mobbin.com/screens/00858497-3c29-4b4c-a931-2ce62727360f)
Pattern: On phone, "Spent $15" as the headline, an average line under it, a simple bar chart with a period switch (1W, 1M, 6M, 1Y), then "By category" rows with amount and share.
Fits our scene because: this is the phone composition for our savings page, period switch included. Shares beside amounts help the lead say "the hook sets are 80% of the savings".
Not taking: black background, white pill switch, rounded icon tiles on each row.

Directions this fed:
- **A. The gap.** Tesla's framing made literal. One Archivo number for the period: saved, in exact dollars, with "estimated" and a link to how it is computed. Under it a single mono line: "Spent $0.41 on System One. The same calls on the LLM would have cost about $6.92." Then a paired bar per day (spend, LLM estimate) with the gap as the read, and the per-set table below in Vercel's row shape. Avoids the hero-metric template: one number, a sentence, no stat row. Traces to Refs 1, 2.
- **B. Ledger.** No chart above the fold. The page is a receipt: period selector, then a table grouped by set, each set's rows (decisions, LLM calls avoided, System One spend, estimated savings) in mono with four or five decimals where needed, a share column, and a bold total row at the bottom like Cofounder's receipt. A sparkline per set carries the time shape. "Show the numbers by day" expands into a day table. Prints and projects well. Traces to Refs 2, 3.
- **C. Set first.** The savings index is a short list of sets, each one line: slug, saved this period, spend, a 30-day strip. Selecting a set opens the Copilot-style detail: one figure, a 12-period strip, two key metrics, then the runs behind the number with links into run detail. On phone this is the natural shape, a list then a page (Revolut). Traces to Refs 4, 5.

---

## 2026-10-01: Approvals, desktop web and phone

Job: Approvals, desktop and phone: let an owner see exactly what an agent wants to change, how risky it is, and approve or deny it in one place, with moves toward safety never blocked.

Scene: An org owner on a phone between meetings in a hallway, a push notification says an agent wants to widen the High band on the `done-claims` set; they need to see the old and new threshold and the risk in ten seconds and decide, or flag it for the desk later.

Sources: Mobbin (MCP). Refero unavailable.

### Ref 1: Mistral AI, review changes before saving an agent version (https://mobbin.com/screens/782f5257-54b5-44df-aac7-4ffd42aa1d3c)
Pattern: "Current version: v0" and "New version: v1" labels above a side-by-side diff with line numbers and added lines tinted, split into tabs (Instructions, Configuration), and a short version note field before the save button.
Fits our scene because: our approval is a spec version diff. Version labels in mono above each side and a tab per spec area (questions, thresholds, policy) map one to one.
Not taking: the modal, the hatched empty column, the black button.

### Ref 2: Neon, compare schemas (https://mobbin.com/screens/9cb22cfd-3f04-4161-94b9-729266bc97b0)
Pattern: A unified-style diff where removed and added lines carry minus and plus signs as well as tint, with a hunk header, and one plain action "Proceed to restore" next to Cancel.
Fits our scene because: the plus and minus glyphs mean the diff still reads in grayscale (our rule: color never works alone). One verb on the action, not a generic "Confirm".
Not taking: the red and green saturation, the modal frame, raw SQL density as the first view.

### Ref 3: Whop, app permissions request (https://mobbin.com/screens/94196777-bfa5-4a69-97a6-b5795d6d797e)
Pattern: The requester (an app) and the target are named at the top, then a checklist of exactly what it will be able to do ("Delete plans", "Transfer funds"), with the riskier scopes visible in the same list, and a line saying it can be revoked later.
Fits our scene because: an agent token proposing a change is a requester asking for a capability. Naming the agent, the operation and the scope in plain verbs, and saying it can be rolled back, is the candid framing we want.
Not taking: the gradient header, the modal over the page, the blue approve button.

### Ref 4: Airwallex, report details pending your approval (https://mobbin.com/screens/a21ef4c4-38e3-475e-b8b0-2618f40df869)
Pattern: A "Pending your approval" tag beside the title, the amount and submitter on one line, an activity trail showing who submitted, the current step and who can approve ("Anyone from the list"), and Approve plus "Request resubmission" fixed in the footer.
Fits our scene because: outside our category. Our approvals need the same trail (proposed by which agent token, at what time, waiting on which role) and a second verb that is not "deny", for "send back with a note".
Not taking: the three-column layout, the violet fill on the primary button (violet is our Medium band color, not an action).

### Ref 5: Monzo, review a payment request on phone (https://mobbin.com/screens/e2656aac-ce1d-4527-b326-088341b94986)
Pattern: The amount large on the right, who is asking above it, the linked context in a row, then two stacked full-width buttons at the bottom: "Review payment" and "Decline request" in the danger color.
Fits our scene because: the hallway phone case. The thing being changed (old to new threshold) can take the amount's place, and two stacked thumb-sized buttons are the decision.
Not taking: the pale green gradient, the round avatar, the tab bar.

Directions this fed:
- **A. Change sentence plus diff.** The page opens on one sentence of what will change, in plain words ("Raise the High line on done-claims from 0.70 to 0.80."), a risk badge beside it (word, never color alone: "High risk"), and the proposer and time in mono. Under it, a field-level diff from `SpecDiff`: one row per op with a plus, minus or arrow glyph, path in mono, old value and new value. Full JSON diff behind a "Show the spec diff" disclosure (Neon style). Approve is the chamfered primary, Deny is secondary, "Send back" is ghost. On phone the buttons stack at the bottom, Monzo style. Traces to Refs 1, 2, 5.
- **B. Ruler diff.** When the change touches thresholds, draw two confidence rulers stacked, current and proposed, with the same score scale, so the moved line is visible at a glance. Under them, a short impact line from recent runs ("Of the last 214 decisions, 31 would move from Medium to High."). Non-threshold changes fall back to Direction A's field diff. Traces to Ref 1 (old and new versions side by side) and Ref 4 (context before decision); the ruler pair is ours.
- **C. Request card and trail.** Framed like Whop and Airwallex: a request card naming the agent token, the operation and its scope as plain verbs, the risk level with the reason it is high, a note that a published version can be rolled back, then an activity trail (proposed, waiting on owner or admin, decided). Safety moves (risk `safety`) never show here and say so in the empty state ("Moves toward safety apply right away. Nothing waits on you."). Traces to Refs 3, 4.

---

## Summary

- Surfaces covered: runs list and run detail; review queue and review item; savings and reports; approvals.
- Sources used: Mobbin MCP (web and iOS screens); Refero unavailable; no free catalog source needed. 20 references across Stripe, Whop, OpenAI Platform, Vercel, Wise, Linear, Plain, YNAB, Commons, Lemni, Tesla, Cofounder, Copilot Money, Revolut, Mistral AI, Neon, Airwallex, Monzo. Every surface has at least two finance or consumer references from outside AI dev tools.
- Strongest pattern, runs: Stripe's amount-as-title with a net-line ledger, so the decision card and cost read before anything else.
- Strongest pattern, review: Linear's act-then-undo toast with Plain's verb key map, so one key resolves and nothing needs a confirm dialog.
- Strongest pattern, savings: Tesla's "saved, spent, the alternative would have cost" trio, which states our claim and its receipt in one glance.
- Strongest pattern, approvals: Mistral's versioned side-by-side diff, reduced to a field-level change sentence with plus and minus glyphs (Neon) and stacked thumb buttons on phone (Monzo).

## 2026-10-01: Sign-in, two-factor and enrollment
Job: Sign-in and two-factor, web: get a known member in, or enrolled in TOTP, without a single moment of doubt about where they are or what happens next.
Scene: Nick or a teammate at a desk in the morning, laptop on a normal office monitor, phone in the other hand for the authenticator, a little impatient, wanting it over in under twenty seconds and wanting to trust it.
Sources: Mobbin (MCP). Refero unavailable.

### Ref 1: Retool, required 2FA enrollment (https://mobbin.com/screens/10ba52e8-8d80-4ba9-aefe-2067ee4bec99)
Pattern: When an admin requires 2FA, the enrollment page is the sign-in page's twin: same narrow column, small mark top-left of the column, one line that says why ("your admin has turned this on and requires you to set it up before you can proceed"), QR, one code field, one button. No app chrome.
Fits our scene because: Bandwise requires TOTP before any page. The person did not choose this step, so saying who required it and why, in one plain sentence, removes the "is this phishing" flinch.
Not taking: Retool's soft blue button, the floating chat bubble, the wide empty page with the form floating in it unanchored.

### Ref 2: PayPal, authenticator setup (https://mobbin.com/screens/2441afa8-3c5b-4785-9fa1-8fae380990e7) (outside category: banking)
Pattern: Two numbered steps on one screen ("Step 1: scan or type the key", "Step 2: enter the 6-digit code"), the manual secret printed right under the QR in grouped blocks of four, a hairline between steps.
Fits our scene because: Grouped secret blocks are a data string, which is exactly what our mono face is for. Two numbered steps on one screen beats a wizard for a 20-second job.
Not taking: PayPal's navy header, the modal over the account page, the large centered serif-ish heading.

### Ref 3: Mixpanel and Surfshark, recovery codes (https://mobbin.com/screens/f3d41a5f-dc10-435f-a818-8163f9c6f78a, https://mobbin.com/screens/00264337-9099-41db-968c-63af37b9334a) (Surfshark is outside category: security consumer app)
Pattern: Mixpanel puts the codes in a mono grid with Copy and Download side by side and an "I have saved my recovery codes" checkbox that unlocks the continue button. Surfshark numbers each code ("Code #1" to "#10") in a hairline list and says plainly "we will not show you these codes again".
Fits our scene because: It is the one irreversible moment in the flow. A numbered mono list reads like a stamped tag on a hook (the tool-crib brief), and the acknowledgement gate fits "agents propose, humans approve" in spirit: the person confirms the risky step themselves.
Not taking: Mixpanel's purple gradient wash at the bottom, Surfshark's teal-filled primary with white text (our rule: teal fills carry ink text).

### Ref 4: Zapier, 2FA setup with a step rail (https://mobbin.com/screens/e1db9e52-110b-49b4-9d0a-1fcd881c19b3)
Pattern: A left rail lists the whole enrollment (get app, verify code, save recovery codes, verify recovery codes) with a thin progress bar on top, and the right pane holds only the current step.
Fits our scene because: Enrollment is three steps for us (scan, verify, save codes). A visible list of what is left lowers anxiety, and the progress bar maps to the brand's trail divider (dots growing toward one teal node).
Not taking: the bordered card-in-page container, the orange Create button and app sidebar visible during enrollment, the selected-row blue fill.

### Ref 5: Sora (ChatGPT) password step with locked email (https://mobbin.com/screens/ddd50c98-e790-4047-bd4a-a6f9352fd6b7)
Pattern: The email from step one stays visible as a read-only field with an inline "Edit" link while the person types the password. Tiny brand wordmark top-left, nothing else on the page.
Fits our scene because: It shows the person exactly which account is signing in, which matters on a closed, members-only console, and it keeps the page empty enough to feel calm.
Not taking: the pill-shaped inputs and buttons (our radius is 0 to 8, pills only for chips and toggles), the "or log in with one-time code" alternative we do not offer.

Directions this fed:

- **A. Two-step ledger (Refs 2, 3, 5).** One narrow column, left-aligned, small horizontal lockup top-left of the viewport as on typesafe.ai. Each screen is a short numbered ledger: `01 SCAN`, `02 CONFIRM`, `03 KEEP THESE` as mono labels with hairlines between. The TOTP secret and recovery codes are mono, grouped in fours, numbered. The only chamfered element is the primary button. The account in use sits read-only above the password with an Edit link. Copy in voice: "Two-factor is required for every member of this org." and "We will not show these again."
- **B. Rail and pane (Ref 4, Ref 1).** On wide screens, a left rail lists the whole sign-in path (password, two-factor, recovery codes) as a dotted trail; the current step's node is the one teal node. The right pane holds only that step. On phones the rail collapses to the trail divider above the heading. Good when a person lands mid-flow from a reset link, because they see where they are.
- **C. The quiet gate (Ref 1, factory.com reference).** A full-height split: left half is the form, right half is a flat brand moment in `--bw-surface` with the Ascent mark at size, a dashed hairline grid, and one mono line that states the security facts ("TOTP required · sessions 12h · sign-up closed"). No illustration, no gradient. Calm because it says the rules out loud. Risk: it can drift toward a marketing hero; keep the right side to one mark and one line.

---

## 2026-10-01: Sets list
Job: Sets list, web: let a team lead see in one pass which question sets are live, at what stage, whether each is healthy, and which one needs them now.
Scene: A platform lead on a 27-inch monitor mid-afternoon, coffee going cold, checking whether last night's change to `done-check` held before standup, wanting the answer in one glance and a click.
Sources: Mobbin (MCP). Refero unavailable.

### Ref 1: Render, services grouped by environment (https://mobbin.com/screens/3e106d4a-c875-45d5-be51-387a519355f8)
Pattern: The list is split into Production and Staging sections, each a quiet table with a count tab, a status pill with a word and a tick ("Available", "Canceled deploy"), and a relative "deployed" time that sorts.
Fits our scene because: Bandwise has production and staging channels with a stage on each. Showing both channels per set (or grouping by channel) answers "what is live" before anything else.
Not taking: Render's purple link color, the toast in the corner, the double search box per section.

### Ref 2: Linear, projects with a Health column and a health filter panel (https://mobbin.com/screens/fb06f720-0dcd-423f-bba9-83b54701bc4c)
Pattern: Health is its own narrow column with an icon state (on track, update missing, no update expected), and a side panel counts sets per health state so you can filter to the bad ones in one click.
Fits our scene because: "Which one needs me" is the real job. A count per health state ("2 need review, 1 no runs in 24h") is the number-first answer, and "no update expected" maps to sets in `inactive`.
Not taking: Linear's icon-only health glyphs (our rule: color and icon never work alone, always a word), its priority bars, its density.

### Ref 3: Todoist, team projects with Health and Progress (https://mobbin.com/screens/b68b6b5c-a715-444d-9ce3-975c562fee24) (outside category: personal and team productivity)
Pattern: Health is a small labeled chip with an icon and a word ("Excellent", "Critical"), progress is a short bar plus a percent, and rows nest under a folder with a "1 project" count.
Fits our scene because: Sets could group by app (the app that calls them), the same way Todoist nests projects under a team folder. A labeled health word plus a short bar is a direct match for "band always labeled".
Not taking: the warm cream sidebar tint (banned warm palette), the red progress fill, the avatar column.

### Ref 4: Customer.io, workspace health summary over a services list (https://mobbin.com/screens/b9743841-5a29-4454-bc39-133d7b0d7d9c)
Pattern: A summary block states one overall state in a sentence ("Healthy. Everything is running smoothly.") with "last updated" under it, then a plain list where each row carries a status word ("Normal").
Fits our scene because: It is the brand's four-part answer at page level: state first, then the details. A one-line state above the table ("4 sets. 3 in shadow, 1 controlled. 1 needs review.") gives the lead the answer before the scan.
Not taking: the big green check badge, the cards-beside-table layout, "Everything is running smoothly" style copy (we would say the number).

Directions this fed:

- **A. Stage lanes (Ref 1).** Group rows by stage in pipeline order: `FULL`, `CONTROLLED`, `SHADOW`, `INACTIVE`, with `PAUSED` pinned on top when anything is paused. Each lane is a mono label with a count and a hairline. Rows: set name and slug, current version (`v7`, mono), health word plus dot, last run as relative time plus the band of that run ("HIGH 0.84 · 12m ago"), runs and spend in 24h (mono, exact digits). Reads like a tool crib with labeled shelves.
- **B. One sentence, then the table (Refs 2, 4).** A state line in body type over a flat table: "4 sets. 1 needs review. Last run 3 minutes ago." The table has a Stage column that draws the four stages as four small trail dots, filled up to the current stage (teal node on the current one), with the stage word beside it so it reads in grayscale. A health filter with counts sits above as chips. The only chamfer on the page is the "New set" button.
- **C. Grouped by app (Ref 3).** Sets nest under the app or hook that calls them (for the dogfood: "Claude Code hooks" with `action-risk-gate`, `done-check`, `model-tier`, `launch-profile`). Each group header shows that app's 24h spend and savings in mono. Best once orgs have several apps; may be too much structure for the four dogfood sets, so it can wait behind a "Group by" toggle.

---

## 2026-10-01: Draft editor with threshold sliders
Job: Draft editor, web: let a person move where High, Medium and Low fall for each question and see, before saving, how real past runs would land and what that would cost.
Scene: An engineer on a laptop at a kitchen table at night, tuning `done-check` after a day of too many Medium calls, relaxed but careful, dragging one handle a little, watching the counts move, trying again.
Sources: Mobbin (MCP). Refero unavailable.

### Ref 1: Upwork, budget range over a distribution (https://mobbin.com/screens/61f7ddbe-8da3-42ab-b199-862b4a9e4136) (outside category: hiring marketplace)
Pattern: Two number fields (From, To) sit above a histogram of what similar jobs charge. The bars inside the chosen range turn solid, the bars outside stay pale, and one sentence under it names the typical range in plain numbers.
Fits our scene because: This is the core move for the editor. Draw past runs' scores as a histogram on the 0 to 1 confidence ruler, and color the bars by which band they would fall in under the draft thresholds (teal High, violet Medium, red Low, each also labeled). Typed fields beside the handles give exact control and keyboard access.
Not taking: the green fill, the hourly-rate framing, the wizard footer.

### Ref 2: Zillow, Turo and Kayak, histogram range sliders with a live result count (https://mobbin.com/screens/2ea5a996-a059-41a7-af36-1ab4b1853773, https://mobbin.com/screens/46c40880-c0f3-40c2-b9a3-d818df578c92, https://mobbin.com/screens/c1da0082-eb29-4119-911f-f6ea1b1bbded) (outside category: real estate and travel)
Pattern: Dual handles ride directly on the histogram's baseline, min and max fields mirror the handles, and the apply button carries the live count ("View 200+ results"). Reset sits beside apply.
Fits our scene because: Our two thresholds are two handles on one ruler (Medium floor, High floor). Putting the live consequence on the button ("Save draft · 61 High, 22 Medium, 17 Low") keeps the number first and makes the save feel earned.
Not taking: the map, the red pins, Turo's purple, the filters-in-a-popover container (our editor is a page, not a popover).

### Ref 3: Amplitude, usage slider driving a live cost summary (https://mobbin.com/screens/ddb6e909-526f-418f-b998-21e2a3dd97f8)
Pattern: A single large slider with the chosen value as a big number above it, a sentence of context under it ("You've tracked 4 users this month. Select at least 1k to avoid overages."), and a separate summary column whose dollar lines update as you drag.
Fits our scene because: ADR-015 makes escalation spend the number owners tune. Moving High down sends more answers straight through and fewer to evidence or a person. A summary column that says "Escalations per 100 runs: 39 to 22" and "Est. escalation spend per 1,000 runs: $X to $Y" is that number, live.
Not taking: the blue fill and blue banner, the upsell checklist, the plan language.

### Ref 4: Squarespace and Telegram, adjust panel beside a live preview (https://mobbin.com/screens/bfb0f1b2-c1e3-4398-bbb0-b2701772d1fe, https://mobbin.com/screens/13087df5-e5d4-45cc-8d93-018664fa19d5) (outside category: photo editing)
Pattern: The preview owns most of the screen; a right-hand column stacks labeled sliders, each with its current value as a number at the right end of its label row; Save and Cancel live top-left, undo and redo beside them, and a quiet Reset at the bottom of the panel.
Fits our scene because: A set has several questions, each with its own thresholds. A stacked column of per-question rulers (label, value in mono on the right) with undo and reset is the familiar photo-editor contract: try, look, undo. Reset should restore the published version's thresholds, not zero.
Not taking: Telegram's dark full-bleed and blue handles, the icon tool tabs, slider-per-property without context (each of ours shows its histogram).

### Ref 5: Stripe, experiment traffic allocation (https://mobbin.com/screens/bf246853-3c43-44ef-9f5c-4d3d2ce468c0)
Pattern: One slider with the percent echoed in a number field, then each arm restated below with its share as a small tag ("75% of sessions", "25% of sessions") and what is in it.
Fits our scene because: It shows how to restate a slider's result as plain labeled groups. Under the ruler, three rows (HIGH, MEDIUM, LOW), each with its share of past runs and its action from the spec ("ship", "get evidence", "ask a person"), make the effect readable without the chart.
Not taking: the side sheet over the page, the purple accent, the "demo" chip.

Directions this fed:

- **A. Ruler over the trail (Refs 1, 2, 5).** Each question gets a full-width confidence ruler with a histogram of the last N runs' scores drawn above it as thin bars, colored by the band they fall in under the draft. Two handles (Medium floor, High floor) sit on the ruler with mono fields beside them (`0.35`, `0.60`). Under the ruler, three hairline rows: HIGH / MEDIUM / LOW, each with count, share, action, and the delta from the published version ("+9"). The published thresholds show as faint ticks so the person sees how far they moved. One ruler per question, stacked; the question text sits above as a sentence.
- **B. Panel and preview (Refs 4, 3).** Photo-editor layout. The main area is a live preview table of real recent runs (input summary, score, band badge, action), re-sorted into High, Medium and Low groups as thresholds move; rows that changed band get a 1px marker and a "was MEDIUM" note, no animation beyond a quick fade. The right column stacks one compact ruler per question with values in mono, plus a summary block at the bottom: escalations per 100 runs and estimated escalation spend, before and after. Undo, redo and "Reset to v7" sit in the column header.
- **C. Before and after receipt (Ref 3, deliberately plainer).** No histogram. A single ruler per question and a two-column receipt beside it: PUBLISHED v7 vs DRAFT, rows for High share, Medium share, Low share, escalations per 100, estimated spend. Numbers change as you drag; differences are marked with a sign and a word, never color alone. Cheapest to build and the most legible on a phone, where the ruler becomes a vertical stack with the receipt under it.

Notes for all three: thresholds and the published values come from the spec, never hard-coded; the preview must say where its runs come from ("last 200 shadow runs, 1 Oct to 7 Oct") and say "Not enough runs to preview" when the sample is small, per the candid voice. One moving thing: only the marker or the counts animate, never both.

---

## 2026-10-01: Releases and rollout
Job: Releases and rollout, web: show where each version stands on each channel and let a person move it one stage at a time, with the gate stated and the way back always one click away.
Scene: Nick at his desk after lunch with the review queue in another tab, about to move `action-risk-gate` from shadow to controlled on production, steady but aware that this one changes what his agent is allowed to do.
Sources: Mobbin (MCP). Refero unavailable.

### Ref 1: Vercel, production deployment with Instant Rollback (https://mobbin.com/screens/c7fc1aa9-5a08-4993-a979-66c3e729527c)
Pattern: The current production deployment gets its own block at the top (what, status word with dot, when, who, source commit), and "Instant Rollback" sits beside it as a plain secondary button, always visible, not hidden in a menu.
Fits our scene because: Moves toward safety are never gated in Bandwise. A rollback that is always on screen, next to what is live, makes that rule visible.
Not taking: the dark theme default, the screenshot thumbnail, the checklist and analytics cards below.

### Ref 2: Cloudflare Workers, active deployment with traffic and version history (https://mobbin.com/screens/2dfb1cd3-26ac-4e63-9866-f293a0306177)
Pattern: An "Active deployment" strip states the version ID in mono, deployed time, and "Traffic %" as a number with a bar, then a plain version history list below with ID, message, source, who and when, each row with an overflow menu for promote or rollback.
Fits our scene because: Versions are immutable and mono IDs are our habit. A stage strip per channel ("production: v7 · CONTROLLED · since 2 Oct") over an immutable version list is the right skeleton.
Not taking: the blue left accent bar on the active row (side-stripe ban), the orange header, the overflow menu as the only route to rollback.

### Ref 3: Shopify, rollout with launch reach and roll-back date (https://mobbin.com/screens/ec3bc76f-7f80-4bde-8a23-2f108149f0e0) (outside category: commerce)
Pattern: A rollout reads as a sentence with editable chips: "Changes will launch to 67% of visitors on [date]" and "Changes will roll back to 0% on [date]". The reach chip opens a small slider with the number and the human effect ("~16 visitors per month").
Fits our scene because: Writing the stage move as a sentence ("Move v8 on production from SHADOW to CONTROLLED") and stating its effect in people's terms ("about 140 runs a day will act on this answer") is the calm, candid way to show a risky move. The paired roll-back line shows the exit at the same weight as the entrance.
Not taking: the scheduled dates (our moves are immediate or approved), the dark top bar, the draft badge style.

### Ref 4: PlanetScale, deploy request with a timed revert window (https://mobbin.com/screens/3b7a8079-825b-4f07-a482-fe90df998984)
Pattern: After a deploy completes, a block under it asks "Need to revert these changes?" with a plain explanation, a countdown bar ("Time remaining to revert: 29:31"), a "Revert changes" button, and "No thanks, I won't need to revert".
Fits our scene because: Right after a move up, the person's next thought is "can I undo this". Answering it in place, under the move, with one action, is the rollback path the brief asks for. Ours has no time limit, so we keep the block and drop the clock.
Not taking: the countdown, the purple-ringed timeline nodes, the comment box in the same column.

### Ref 5: Urban Outfitters and Apple, order tracking stage line (https://mobbin.com/screens/640f7618-77c5-44f4-abdb-2f7f3e413fad, https://mobbin.com/screens/56dbb1a0-5db6-410b-9277-94799de12045) (outside category: retail)
Pattern: A horizontal line of named stops (Shipped, On its way, Out for delivery, Delivered) with the current stop marked, a big state sentence above it, and a dated "latest update" log on the side.
Fits our scene because: It is the trail motif in someone else's clothes. Four stops (INACTIVE, SHADOW, CONTROLLED, FULL) on a dotted trail, the current one as the teal node, with a dated log of moves (who, when, approved by) beside it, is the most legible way to show a stage to a non-specialist approver.
Not taking: Apple's green progress fill and product photo, the SMS reminder form, the carrier logos.

Directions this fed:

- **A. The trail per channel (Refs 5, 1).** For each channel, one row: the four stages as stops on a dotted trail, current stop as the single teal node with the version in mono under it (`v8`). To the right, the next move as one chamfered primary button ("Move to controlled") with the gate stated under it in plain words ("Needs approval from an owner. Agents can ask, a person decides."), and "Pause" and "Roll back to v7" as secondary buttons that are never gated and say so ("No approval needed"). Below, a dated move log: who, from, to, approved by.
- **B. Release sentence (Refs 3, 4).** The page leads with a sentence for each channel: "Production runs v7 in CONTROLLED since 2 Oct." The move is composed as a sentence with chips: "Move [v8] on [production] to [controlled]", then a preview line of its effect from recent traffic, then the gate. After a move, an in-place block: "Changed your mind? Roll back to v7. No approval needed." Strong for approvals, since the approver reads one sentence.
- **C. Version ledger (Ref 2).** A strip per channel at top (version, stage, since, runs in 24h, share of runs that acted, mono), then the immutable version list as a ledger: version, published by, published on, model ID pinned (required before controlled, per the golden rule), and per row "Promote" or "Roll back to this". The model-pin requirement shows as a blocking line in the row ("Pin a model ID before controlled") rather than a disabled button with no reason.

---

## 2026-10-01: Empty states and first run
Job: Empty states, web: tell a new member what is missing, what will appear here, and the one next step, in the brand's voice ("Nothing on the trail yet").
Scene: A teammate signing in for the first time on a Monday morning, the console bare because the org has no runs yet, mildly curious, wanting to know whether this is broken or just new.
Sources: Mobbin (MCP). Refero unavailable.

### Ref 1: Mercury, transactions not yet (https://mobbin.com/screens/dc52d8c6-76a8-49f7-a3ce-66c4b7b35500) (outside category: banking)
Pattern: The real table header and two pale skeleton rows stay on screen, then a short state line ("No transactions yet"), one sentence naming what will appear and when ("will appear here once your account has funds"), and one primary action. The summary figures above read "$0.00" rather than vanishing.
Fits our scene because: Keeping the real columns visible tells the person exactly what a run row will hold (score, band, cost). Showing `$0.00000` spend and `0` runs in mono is candid and number first, instead of hiding the numbers.
Not taking: the purple pill button, the floating help bubble, skeleton bars that look like loading (ours must not be confused with a loading state; use hairline rows with mono dashes instead).

### Ref 2: Render, empty Blueprints (https://mobbin.com/screens/99029495-1f2f-4860-ba15-949046dd0b40)
Pattern: A left-aligned heading in plain words ("You haven't created any Blueprint instances yet."), one paragraph naming the file that drives it in inline code (`render.yaml`), a docs link, and one outlined button. No illustration.
Fits our scene because: Bandwise is headless first. The honest first step is often a CLI line, not a button: `pnpm bandwise publish` or `bandwise hooks install`. Inline code in the empty state, plus a copy button, respects the person who lives in the terminal (factory.com's install line under the hero is the same move).
Not taking: the purple links, centering the block in a large empty pane with no anchor.

### Ref 3: Webflow, empty collection with sample items (https://mobbin.com/screens/7929daa6-f7ba-409e-822c-3e96b9cced25)
Pattern: "You have 0 Projects in your Collection." then "Create sample items" with three sized buttons (add 5, 10, 20) and a quieter link to make a real one.
Fits our scene because: The draft editor's preview is empty without runs. Offering to replay the recorded fixtures as a sample ("Preview with 40 sample runs from fixtures, marked as sample") lets a person feel the threshold sliders on day one, while staying honest that they are not their runs.
Not taking: the dark panel, the three-button choice (one option is enough), the tutorial video card.

### Ref 4: fal, getting-started checklist with live zero metrics (https://mobbin.com/screens/bc40aa20-1047-4fb8-b421-4afef1106e3f)
Pattern: A first-run block with a short checklist where done steps are struck through with a tick (create account, generate first output) and open steps carry an inline action button, next to real metrics showing 0 with empty charts and a "Don't show this" dismiss.
Fits our scene because: First run for an org has a short, real sequence: install the hooks, get a first run in shadow, look at the first receipt. A checklist whose done steps tick themselves from real data (the first receipt arrives) is better than a tour.
Not taking: the three-column card grid, the model-gallery upsell, the dashed red and blue chart baselines.

Directions this fed:

- **A. The bare trail (Refs 1, 2).** Every empty table keeps its real header and shows three hairline rows holding a mono `·` or `0` in each cell (never an em dash), under a state line and one next step: "Nothing on the trail yet. Run your first check." plus the exact CLI line in a code block with Copy. The trail divider runs under the heading with no teal node yet; the first run lights the node. No illustration, no ant: marks are for logo use, not for decoration.
- **B. First-run checklist (Ref 4).** On the sets list and the home page for an org with no runs: three steps as a dotted trail, each a sentence with an action: "Install the hooks · `bandwise hooks install`", "Get a first run in shadow", "Read the first receipt". Steps tick from real events, the last one links to the run. Dismissible once all three are done, never before.
- **C. Sample, clearly labeled (Ref 3).** In the draft editor only: when there are fewer runs than the preview needs, offer "Preview with fixture runs" and render them with a SAMPLE label on every row and on the summary, so no sample number can be read as a real one. Pairs with A or B elsewhere.

Copy to carry into every empty state, from `BRAND-VOICE.md`: say what happened, what did not happen, and the next step. Examples: "Nothing on the trail yet. Run your first check." / "No sets yet. Publish one with `bandwise publish`." / "No runs in the last 7 days. The hook may be off." / "Nothing waiting for review."

---

## Cross-surface notes for Generate

- Strongest borrowed patterns: the grouped mono secret and numbered recovery codes (sign-in), stage lanes or stage dots with a labeled health word (sets list), the histogram range slider colored by band with a live consequence on the save button (editor), the always-visible rollback beside what is live plus the release sentence (rollout), and the real-header empty table with the CLI line (empty states).
- Outside-category references used: PayPal, Surfshark (sign-in); Todoist (sets list); Upwork, Zillow, Turo, Kayak, Squarespace, Telegram (editor); Shopify, Urban Outfitters, Apple (rollout); Mercury, Webflow (empty states).
- Things to refuse in every direction: side-stripe accents on active rows (Cloudflare, Zapier), pill buttons, purple or blue accents, warm tints, illustrations in empty states, any number that hard-codes 0.55 or 0.80.

