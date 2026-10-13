# Notices

Portions adapted from Claudia Skills, Copyright (c) 2026 Claudia contributors, MIT.

Claudia Skills is licensed under the MIT License:

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
> documentation files (the "Software"), to deal in the Software without restriction, including without limitation
> the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
> to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions
> of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
> THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
> CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
> IN THE SOFTWARE.

## Skills that adapt Claudia Skills material

All of these were rewritten for Lumen (multi-chain, Lumen tools and commands, no Claudia CLI). Structure, tables
or specific figures were adapted from the Claudia Skills source listed.

| Lumen skill | Adapted from (claudia-skills) | What was adapted |
|---|---|---|
| `rug-check` | `build/rug-check` | threshold-table structure, several thresholds, verdict rules, reply skeleton |
| `portfolio-and-pnl` | `build/portfolio-and-pnl-tracking` | ledger-per-event approach, reconciliation, "quotes are not fills" |
| `tax-ready-ledgers` | `build/portfolio-and-pnl-tracking` | ledger approach and tax-records caution |
| `onchain-alerts-and-watchers` | `build/alerts-and-watchers` | rule-first design, thresholds from data, rate caps, de-dupe, quiet hours |
| `whale-and-smart-money-tracking` | `build/kol-and-smart-money-tracking` | label-before-meaning, confluence, watchlist reviews, copy-trading warnings |
| `prompt-injection-defense` | `build/prompt-injection-defense` | trust map, wrapping, tool allow-lists, human gate, memory quarantine, test set |
| `claudia-ecosystem-overview` | `build/claudia-platform-overview` | platform facts and framing |
| `image-prompting-fundamentals` | `create/image-prompting-fundamentals` | five-block prompt structure, failure-fix table |
| `character-consistency` | `create/character-consistency` | drift-check scoring idea |
| `thumbnails` | `create/thumbnails-and-covers` | canvas and safe-zone table, small-size test, type sizes |
| `storyboarding-shorts` | `create/storyboarding-shorts` | three-act timing table, overshoot and re-roll budget |
| `captions-and-hooks` | `create/captions-and-hooks` | caption style table, 9:16 safe-zone figures |
| `ai-disclosure-and-provenance` | `create/ai-disclosure-and-provenance` | per-platform label controls, C2PA / SynthID / EU AI Act points |
| `sonic-branding` | `create/sonic-branding-and-jingles` | brief → motif → rights → loudness → asset kit flow |
| `mixing-and-mastering` | `create/sonic-branding-and-jingles` | one pitfall (LUFS on very short stings) |
| `sticker-and-emoji-packs` | `create/sticker-and-emoji-packs` | Telegram / Discord size and file limits, legibility check |
| `pfp-sets` | `create/pfp-and-avatar-sets` | circle-first design, small-size test, master size, export sizes |
| `comics` | `create/comics-and-webtoons` | four-panel structure, formats, minimum text size |
| `product-mockups` | `create/product-and-merch-mockups` | DPI maths, print sizes, DPI-tag warning |

Every other skill in `base/` and every template in `chain-templates/` is original to Lumen.
