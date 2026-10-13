// `lumen keys …`: list | set <field> <value> | unset <field> | test <provider> | import <file> | lock | unlock
import { getKeys, FIELDS, resolveField } from "../../core/keys.js";
import { providerStatus, testProvider, PROVIDERS } from "../../core/providers.js";
import { theme, say, fail, heading, prompt, spin } from "../out.js";
import { P } from "../../core/paths.js";
import { pad } from "../../tui/ansi.js";

export async function runKeys(pos, flags) {
  const T = theme(flags);
  const keys = getKeys();
  const sub = pos[0] || "list";
  if (keys.locked && sub !== "unlock" && sub !== "list") {
    const pass = await prompt("keys.json is encrypted. Passphrase: ", { hidden: true });
    if (!pass) return fail("Locked.");
    try { keys.unlock(pass); } catch (e) { return fail(e.message); }
  }
  switch (sub) {
    case "list": {
      heading("Keys", `${P.keys}${keys.encrypted ? " · encrypted" : ""}${keys.locked ? " · locked (set LUMEN_PASSPHRASE)" : ""}`);
      const st = providerStatus(keys);
      for (const kind of ["llm", "chain", "data", "media", "social"]) {
        say(`\n  ${T.bold(T.accent(kind.toUpperCase()))}`);
        for (const p of st.filter((x) => x.kind === kind)) {
          const mark = p.comingSoon ? T.muted("…") : p.configured ? T.ok(T.sym.check) : T.muted(T.sym.ring);
          const fields = p.fields.map((f) => f.id).join(", ");
          say(`  ${mark} ${pad(p.name, 18)} ${p.comingSoon ? T.muted("coming later") : p.configured ? T.text(p.masked || (p.keyless ? "no key needed" : p.local ? "local" : "set")) : T.muted(fields ? `lumen keys set ${fields.split(", ")[0]} …` : p.local ? "start it locally" : "")}  ${T.muted(p.summary || "")}`);
        }
      }
      say(`\n  ${T.muted("Fields:")} ${T.muted(Object.keys(FIELDS).join(", "))}`);
      say(`  ${T.muted("Env vars override the file (e.g. ANTHROPIC_API_KEY). Keys are never printed in full.")}`);
      return;
    }
    case "set": {
      const [field, value] = [resolveField(pos[1]), pos[2]];
      if (!field) return fail("Usage: lumen keys set <field> <value>   (fields: " + Object.keys(FIELDS).join(", ") + ")");
      if (!FIELDS[field]) return fail(`Unknown field "${field}". Fields: ${Object.keys(FIELDS).join(", ")} (aliases: wallet, wallet-solana, 0x, google, grok)`);
      const v = value ?? (await prompt(`${FIELDS[field].label}: `, { hidden: FIELDS[field].secret !== false }));
      if (!v) return fail("No value given.");
      keys.set(field, v);
      say(`${T.ok(T.sym.check)} Saved ${field} ${T.muted(keys.list().find((k) => k.id === field).masked)}${keys.envName(field) ? T.warn(` (note: ${keys.envName(field)} in your env overrides it)`) : ""}`);
      const p = PROVIDERS.find((x) => x.fields.some((f) => f.id === field));
      if (p && !flags.offline && !p.comingSoon) { const r = await spin(`testing ${p.name}`, testProvider(p.id, keys)); say(`${r.ok ? T.ok(T.sym.check) : T.warn(T.sym.warn)} ${p.name}: ${r.message}`); }
      return;
    }
    case "unset": case "rm": case "delete": {
      if (!pos[1]) return fail("Usage: lumen keys unset <field>");
      pos[1] = resolveField(pos[1]);
      keys.unset(pos[1]);
      say(`${T.ok(T.sym.check)} Removed ${pos[1]}${keys.envName(pos[1]) ? T.warn(` (still set via ${keys.envName(pos[1])})`) : ""}`);
      return;
    }
    case "test": {
      const ids = pos[1] ? [pos[1]] : providerStatus(keys).filter((p) => p.configured && !p.keyless && !p.local).map((p) => p.id);
      if (!ids.length) return say(T.muted("No keys to test. Add one with lumen keys set <field> <value>."));
      for (const id of ids) { const r = await spin(`testing ${id}`, testProvider(id, keys)); say(`${r.ok ? T.ok(T.sym.check) : T.bad(T.sym.cross)} ${pad(id, 14)} ${r.message}`); if (!r.ok) process.exitCode = 1; }
      return;
    }
    case "import": {
      if (!pos[1]) return fail("Usage: lumen keys import <path/to/.env>");
      const got = keys.importEnv(pos[1]);
      say(got.length ? `${T.ok(T.sym.check)} Imported ${got.join(", ")}` : T.muted("No known keys found in that file."));
      return;
    }
    case "lock": {
      const p1 = await prompt("New passphrase (8+ chars): ", { hidden: true });
      const p2 = await prompt("Repeat: ", { hidden: true });
      if (!p1 || p1 !== p2) return fail("Passphrases didn't match.");
      try { keys.lock(p1); } catch (e) { return fail(e.message); }
      say(`${T.ok(T.sym.check)} keys.json is now encrypted (scrypt + AES-256-GCM). Set LUMEN_PASSPHRASE or enter it when asked.`);
      return;
    }
    case "unlock": {
      if (!keys.encrypted) return say(T.muted("keys.json is not encrypted."));
      const pass = process.env.LUMEN_PASSPHRASE || (await prompt("Passphrase: ", { hidden: true }));
      try { keys.decrypt(pass); } catch (e) { return fail(e.message); }
      say(`${T.ok(T.sym.check)} Encryption removed (file stays mode 0600).`);
      return;
    }
    default:
      return fail(`Unknown keys command "${sub}". Try list, set, unset, test, import, lock, unlock.`);
  }
}

