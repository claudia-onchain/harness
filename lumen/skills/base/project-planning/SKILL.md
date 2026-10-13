---
name: project-planning
description: "Turns a fuzzy idea into a buildable plan: goal and non-goals, users and success metrics, scope cut to a first shippable slice, milestones with a definition of done, task breakdown into half-day to two-day tasks, risks and spikes, ownership for parallel agents or people, and a weekly re-plan. Use when someone asks \"plan this project\", \"break this down\", \"write a PLAN.md\", \"what should I build first\", \"roadmap\", \"estimate this\" or \"split this between agents\"."
license: MIT
metadata:
  title: "Project planning"
  category: "build"
  level: "beginner"
  tags: "planning, roadmap, scope, milestones, tasks, estimates, risks, definition of done, plan.md"
  version: "1.0.0"
  updated: "2026-10-13"
---

# Project planning

A plan is a tool for deciding what not to build yet. Write down the goal, cut scope to the smallest version
someone can actually use, define "done" so it can be checked, and break work into tasks small enough that
progress is obvious every day. The plan lives in the repo (`docs/PLAN.md`), gets re-read before each work
session, and changes when reality does.

## When to use

- "I want to build X, where do I start?"
- "Break this feature into tasks" or "estimate this".
- Splitting work across several people or parallel agents (`delegate`).
- A project keeps slipping and needs a re-plan.
- Writing a roadmap or milestone plan for others to read.

## Steps

1. **Write the goal in three lines.** Who it is for, the problem, and what changes for them when it ships.
   Then a **non-goals** list: things you will explicitly not do in this version. Non-goals prevent most scope creep.
2. **Define success.** One to three checkable measures: "a new user can add a key and get a price in under
   2 minutes", "export a 3-minute video without crashing", "p95 API latency under 300 ms". Avoid "users love it".
3. **Cut to a first slice.** The thinnest end-to-end path through the whole system (UI to data and back), ugly
   but real. Everything else goes to "Later". If the first slice takes more than 1-2 weeks, cut again.
4. **Find the risks and spike them first.** List unknowns: an API that might not support what you need, a
   performance question, a library you have never used, an approval from someone else. For each, a timeboxed
   spike (2-4 hours) that answers it before you commit the plan around it.
5. **Break into tasks.** Each task is half a day to two days, has a verb and a visible result ("Add
   `/api/prices` endpoint returning cached quotes, with test"), and a clear dependency order. Anything bigger
   gets split; anything vague gets a spike.
6. **Assign ownership and interfaces.** For parallel work, give each person or agent a directory or module
   they own and write the contracts between them first (API shapes, file formats, events) in a shared doc like
   `docs/CONTRACT.md`. Parallel work without a written interface collides at merge time.
7. **Write the definition of done.** Commands that must pass (`npm test`, `npm run build`, lint), what to
   demo, docs to update. A milestone is done when those pass, not when the code is "basically there".
8. **Write it down.** `docs/PLAN.md`:
   ```markdown
   # <Project> — plan
   ## Goal            3 lines
   ## Non-goals       bullets
   ## Success         checkable measures
   ## Milestones      M1 first slice (date) · M2 ... with definition of done each
   ## Tasks           - [ ] task (owner, estimate, depends on)
   ## Risks & spikes  risk → spike → result
   ## Decisions       date: decision, why
   ```
   Save key decisions with `memory_save` so future sessions keep the context.
9. **Re-plan weekly.** Compare done vs planned, move what slipped, cut scope rather than extend dates by
   default, and record why. Estimates get better only when you compare them with actuals.

## Estimating without fooling yourself

| Rule | Why |
|---|---|
| Estimate tasks, not projects | Small tasks are estimable; projects are not |
| Multiply first-time work by 2-3x | Unknown tools and integrations always cost more |
| Add explicit buffer (20-30%) per milestone | Bugs, reviews and surprises are certain, just not where |
| Track actual vs estimate | Your personal multiplier is the most useful number you have |

## Check before you finish

- [ ] Goal, non-goals and 1-3 checkable success measures are written.
- [ ] The first milestone is an end-to-end slice of 1-2 weeks or less.
- [ ] Every task is 0.5-2 days, starts with a verb and has an owner.
- [ ] Top risks have timeboxed spikes scheduled before dependent work.
- [ ] Each milestone has a definition of done with runnable commands.
- [ ] The plan is in the repo and dated; decisions are logged.

## Pitfalls

- **Planning the whole roadmap in detail.** Detail beyond the next milestone is fiction. Keep later work coarse.
- **No non-goals.** Every good idea becomes "while we're at it". Write them down and say no.
- **Horizontal slices.** "Build the whole database layer first" delays the first usable thing for weeks. Go end to end.
- **Hidden dependencies.** Keys, accounts, design assets or someone's approval block tasks. List them as tasks.
- **Plans nobody reads.** If it is not re-read at the start of each session, it is not a plan.
- **Money and launch steps without gates.** Anything that spends funds or goes public needs an explicit
  human sign-off step in the plan.

## Related

- `research-brief` — research the problem before planning the build.
- `codebase-onboarding` — understand an existing codebase before planning changes to it.
- `multi-agent-delegation` — running planned tasks in parallel with sub-agents.
- `docs-writing` — keep the plan and decisions readable.
- `git-workflow` — branches and commits that match the task breakdown.
