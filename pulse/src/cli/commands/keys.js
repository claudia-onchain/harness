// pulse keys [list | set <id> <value> | rm <id>]
import { getKeys, KEY_FIELDS, resolveKeyId } from "../../core/config.js";
import { say, fail, ok, table, C } from "../out.js";

export async function runKeys(args, flags) {
  const keys = getKeys();
  const [sub = "list", id, ...valueParts] = args;
  switch (sub) {
    case "list": case "ls": {
      const rows = keys.list();
      if (flags.json) return say(JSON.stringify(rows.map(({ id, set, masked, source, env }) => ({ id, set, masked, source, env })), null, 2));
      table(rows.map((r) => [r.id, r.set ? C.green(r.masked) : C.dim("not set"), r.source ? C.dim(r.source === "env" ? `env ${r.env}` : "keys.json") : C.dim(`set with: pulse keys set ${r.id} <value>`), r.label]), ["id", "value", "source", "what"]);
      return;
    }
    case "set": {
      const value = valueParts.join(" ").trim();
      if (!id || !value) return fail("Usage: pulse keys set <xai|telegram|http> <value>");
      const k = resolveKeyId(id);
      if (!KEY_FIELDS[k]) fail(`"${id}" is not a known key id (xai, telegram, http); storing it anyway`, 0);
      keys.set(k, value);
      return ok(`${k} saved to ${C.dim(keys.file)} (mode 0600)`);
    }
    case "rm": case "remove": case "delete": case "unset": {
      if (!id) return fail("Usage: pulse keys rm <id>");
      const k = resolveKeyId(id);
      return keys.delete(k) ? ok(`${k} removed`) : fail(`${k} was not set in keys.json${process.env[KEY_FIELDS[k]?.env] ? ` (still provided by ${KEY_FIELDS[k].env})` : ""}`);
    }
    default: return fail(`Unknown keys subcommand "${sub}" (list | set | rm)`);
  }
}
