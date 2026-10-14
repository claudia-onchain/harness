// Server-Sent Events parser over a fetch body, any async iterable of chunks, or a string.
// Yields { event, data, id }; comment lines are skipped, multi-line data joined, CRLF tolerated.

async function* chunks(source) {
  if (typeof source === "string") { yield source; return; }
  if (source?.getReader) {
    const reader = source.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      try { reader.releaseLock(); } catch { /* already released */ }
    }
    return;
  }
  for await (const c of source) yield c;
}

export async function* parseSSE(source) {
  const dec = new TextDecoder();
  let buf = "";
  let event = "", data = [], lastId = "";
  const dispatch = function* () {
    if (data.length) yield { event: event || "message", data: data.join("\n"), id: lastId };
    event = ""; data = [];
  };
  for await (const chunk of chunks(source)) {
    buf += typeof chunk === "string" ? chunk : dec.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.search(/\r\n|\r|\n/)) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + (buf[nl] === "\r" && buf[nl + 1] === "\n" ? 2 : 1));
      if (line === "") { yield* dispatch(); continue; }
      if (line.startsWith(":")) continue;
      const c = line.indexOf(":");
      const field = c < 0 ? line : line.slice(0, c);
      let value = c < 0 ? "" : line.slice(c + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "data") data.push(value);
      else if (field === "event") event = value;
      else if (field === "id") lastId = value;
    }
  }
  // A final event without its trailing blank line still counts.
  if (buf.trim()) {
    const c = buf.indexOf(":");
    if (c > 0 && buf.slice(0, c) === "data") data.push(buf.slice(c + 1).replace(/^ /, ""));
  }
  yield* dispatch();
}

/** Same, with each event's data parsed as JSON; "[DONE]" and unparseable payloads are skipped. */
export async function* parseSSEJson(source) {
  for await (const ev of parseSSE(source)) {
    if (!ev.data || ev.data === "[DONE]") continue;
    try { yield { event: ev.event, json: JSON.parse(ev.data) }; } catch { /* skip */ }
  }
}
