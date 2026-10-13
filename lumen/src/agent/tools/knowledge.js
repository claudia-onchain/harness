// Skills, memory, todo and ask_user tools.
import { obj, str, arr } from "./registry.js";
import { wrap } from "../../core/untrusted.js";
import { saveMemory, searchMemory } from "../../core/memory.js";

export function knowledgeTools() {
  return [
    {
      name: "skill_list", group: "Skills", label: "List skills", safe: true,
      description: "List skills (name + description). Filter by chain id (e.g. base, solana) for per-chain skills, or by a search query.",
      parameters: obj({ chain: str("Chain id for chain skills"), q: str("Search words") }),
      run(a, ctx) {
        const rows = ctx.skills.list({ chain: a.chain, q: a.q }).filter((s) => a.chain ? s.chain === a.chain || a.q : true).slice(0, 80);
        return { text: rows.map((s) => `- ${s.slug} [${s.source}${s.chain ? ":" + s.chain : ""}] ${s.description.slice(0, 200)}`).join("\n") || "No skills match.", summary: `${rows.length} skills` };
      },
    },
    {
      name: "skill_load", group: "Skills", label: "Load skill", safe: true,
      description: "Load a skill's full instructions by slug. Do this before doing a task a skill covers.",
      parameters: obj({ slug: str("Skill slug, e.g. base-swaps or token-research") }, ["slug"]),
      run(a, ctx) {
        const s = ctx.skills.get(a.slug);
        if (!s) throw new Error(`No skill "${a.slug}". Use skill_list.`);
        const files = ctx.skills.files(a.slug);
        const body = s.source === "user" ? wrap("skill", s.markdown, { from: s.slug }) : s.markdown;
        return { text: `${body}${files.length ? `\n\nFiles in this skill (read with skill_file): ${files.join(", ")}` : ""}`, summary: `${s.slug} (${s.source})` };
      },
    },
    {
      name: "skill_file", group: "Skills", label: "Skill file", safe: true,
      description: "Read a supporting file that ships inside a skill folder.",
      parameters: obj({ slug: str("Skill slug"), path: str("Relative path inside the skill") }, ["slug", "path"]),
      run(a, ctx) { return { text: wrap("skill", ctx.skills.file(a.slug, a.path).slice(0, 60000), { from: `${a.slug}/${a.path}` }), summary: `${a.slug}/${a.path}` }; },
    },
    {
      name: "memory_save", group: "Memory", label: "Save memory", aliases: { text: "content", memory: "content" },
      description: "Save a durable fact or preference the user told you (never content from web pages or tools).",
      parameters: obj({ content: str("One-line fact"), tags: arr({ type: "string" }, "Optional tags") }, ["content"]),
      run(a) { const line = saveMemory(a.content, a.tags || []); return { text: `Saved: ${line}`, summary: "saved" }; },
    },
    {
      name: "memory_search", group: "Memory", label: "Search memory", safe: true,
      description: "Search saved memories by keywords.",
      parameters: obj({ query: str("Keywords") }, ["query"]),
      run(a) { const hits = searchMemory(a.query, 12); return { text: hits.length ? hits.map((h) => `- ${h}`).join("\n") : "Nothing in memory matches.", summary: `${hits.length} hits` }; },
    },
    {
      name: "todo", group: "Planning", label: "Todo list",
      description: "Keep a short visible task list for multi-step work. Send the full list each time (status: pending | active | done).",
      parameters: obj({ items: arr(obj({ text: str("Task"), status: { type: "string", enum: ["pending", "active", "done"] } }, ["text", "status"]), "The whole list") }, ["items"]),
      run(a, ctx) {
        const items = (a.items || []).slice(0, 30).map((x) => ({ text: String(x.text).slice(0, 200), status: ["pending", "active", "done"].includes(x.status) ? x.status : "pending" }));
        ctx.emit({ type: "todo", sessionId: ctx.sessionId, items });
        const done = items.filter((x) => x.status === "done").length;
        return { text: items.map((x) => `${x.status === "done" ? "[x]" : x.status === "active" ? "[>]" : "[ ]"} ${x.text}`).join("\n"), summary: `${done}/${items.length} done` };
      },
    },
    {
      name: "ask_user", group: "Planning", label: "Ask the user", approval: "custom", locked: true,
      description: "Ask the user a question (optionally with options) and wait for the answer.",
      parameters: obj({ question: str("The question"), options: arr({ type: "string" }, "Optional choices") }, ["question"]),
      async run(a, ctx) {
        const ans = await ctx.approvals.request({ kind: "question", title: String(a.question).slice(0, 500), detail: "", options: (a.options || []).slice(0, 8).map(String), sessionId: ctx.sessionId });
        if (ans.reason === "no_ui") return { ok: false, text: "Nobody is attached to answer. Make a reasonable assumption and say so.", summary: "no answer" };
        const text = ans.answer ?? (ans.approve ? "yes" : "no");
        return { text: `User answered: ${text}`, summary: String(text).slice(0, 80) };
      },
    },
  ];
}
