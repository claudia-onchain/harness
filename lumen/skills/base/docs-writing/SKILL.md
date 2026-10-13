---
name: docs-writing
description: "Writes technical documentation people actually use: READMEs, quickstarts, how-to guides, reference pages, ADRs, changelogs and code comments, matched to the reader's task and verified by running every command. Use when someone asks to \"write a README\", \"document this\", \"write docs for the API\", \"add a quickstart\", \"write an ADR\", \"update the changelog\", or \"explain this for new contributors\"."
license: MIT
metadata:
  title: "Docs writing"
  category: "build"
  level: "beginner"
  tags: "documentation, readme, quickstart, how-to, reference, adr, changelog, technical writing, diataxis"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Docs writing

Good docs answer the reader's next question before they have to ask it. Decide who is reading and what they are
trying to do, pick the matching doc type, and test every command you print. The one idea that matters: a doc with
a broken first command loses the reader's trust for the rest of the page.

## When to use

- "Write a README / quickstart / setup guide"
- "Document this module / API / CLI"
- Recording a design decision (ADR) or a release (changelog)
- Docs drifted from the code and need a refresh
- Comments in code that explain the wrong thing (what instead of why)

## Steps

1. **Name the reader and their task.** "A Node dev who just cloned the repo and wants it running in 5 minutes"
   is a quickstart. "An integrator looking up the `limit` param" is reference. One doc, one reader, one task.
2. **Pick the doc type.**

   | Type | Reader's question | Shape |
   |---|---|---|
   | Quickstart / tutorial | "How do I get started?" | Linear steps to one working result, no options |
   | How-to guide | "How do I do X?" | Goal, prerequisites, numbered steps, verification |
   | Reference | "What does this flag/field do?" | Exhaustive, consistent, tables, generated where possible |
   | Explanation | "Why is it like this?" | Prose, diagrams, trade-offs, history |
   | ADR | "Why did we choose this?" | Context, decision, alternatives, consequences, date |
   | Changelog | "What changed and does it break me?" | Added / Changed / Fixed / Removed / Breaking per version |

3. **Gather facts from the source, not memory.** `read_file` package.json scripts, CLI `--help` output, env
   var lookups (`rg -n 'process\.env\.[A-Z_]+' -o --no-filename | sort -u`), route tables, config defaults.
   Every flag, env var and default in the doc must match the code.
4. **Draft the README skeleton.**
   ```markdown
   # name — one line saying what it does and for whom
   ## Quickstart        (copy-paste block that works on a clean machine)
   ## Usage             (3–5 most common tasks, with real output)
   ## Configuration     (table: env var / config key, default, meaning)
   ## How it works      (short; link to deeper docs)
   ## Development       (install, test, build, release)
   ## Troubleshooting   (top 3 errors and their fixes)
   ## License
   ```
5. **Write tight.** Lead with the action. Second person, present tense, active voice. One idea per sentence.
   Show the command, then the expected output. Use real values (`lumen price ETH --chain base`), not
   `foo`/`bar`. Use placeholders like `<your-api-key>` for secrets, never real-looking keys.
6. **Test every command.** Run each block from a clean state (fresh clone or temp dir) via `bash` with approval.
   Paste actual output, trimmed. If a step needs a key or a paid service, say so before the step.
7. **Comment code for why.** Comments explain intent, constraints and non-obvious choices ("Etherscan V2 needs
   `chainid` even for mainnet"), not what the next line does. Doc comments on public functions: params, return,
   throws, one example.
8. **Make it findable and keep it fresh.** Link docs from the README, put reference next to the code it
   describes, and add a docs check to CI where possible (link checker, `node --check` on code blocks extracted
   to files, `--help` snapshot test).

## Check before you finish

- [ ] The intended reader and task are obvious from the first two lines
- [ ] Every command was run and its shown output is real
- [ ] Every flag, env var and default matches the current code
- [ ] Prerequisites (versions, keys, accounts, costs) appear before the step that needs them
- [ ] No real secrets, internal hostnames or personal data in examples
- [ ] Headings scan: a reader can find their task in under 10 seconds

## Pitfalls

- **Documenting the ideal, not the actual.** Write what the code does today; file issues for the rest.
- **Mixing types.** A tutorial that stops to list every option loses beginners; link to reference instead.
- **Wall of prose.** Use numbered steps, tables and code blocks for anything a reader will act on.
- **Unstated assumptions.** "Just run the server" — which command, which port, which env vars?
- **Screenshots of text.** Unsearchable, uncopyable and stale fast; use text blocks.
- **Changelogs written from commit titles.** Write for users: what changed for them and what to do.

## Related

- `codebase-onboarding` — gathering the facts the docs describe
- `write-a-cli` — help text is documentation too
- `research-brief` — for explanation docs that compare options
- `project-planning` — ADRs and plans that feed the docs
- `code-review` — reviewing doc changes alongside code
