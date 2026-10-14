// Minimal RFC 6455 WebSocket client (and the server half the mock needs). Node's global WebSocket
// cannot send an Authorization header on the upgrade, and api.x.ai wants a Bearer token there, so
// we do the handshake over node:http(s) ourselves: text/binary frames, fragmentation, ping/pong,
// close. Client→server frames are masked as the RFC requires; server→client frames are not.
import { EventEmitter } from "node:events";
import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import https from "node:https";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
export const OP = { CONT: 0, TEXT: 1, BINARY: 2, CLOSE: 8, PING: 9, PONG: 10 };

export const acceptKey = (key) => createHash("sha1").update(key + GUID).digest("base64");

export function encodeFrame(payload, { opcode = OP.TEXT, mask = false, fin = true } = {}) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload ?? ""), "utf8");
  const len = data.length;
  const ext = len < 126 ? 0 : len < 65536 ? 2 : 8;
  const head = Buffer.alloc(2 + ext + (mask ? 4 : 0));
  head[0] = (fin ? 0x80 : 0) | (opcode & 0x0f);
  head[1] = (mask ? 0x80 : 0) | (ext === 0 ? len : ext === 2 ? 126 : 127);
  if (ext === 2) head.writeUInt16BE(len, 2);
  else if (ext === 8) head.writeBigUInt64BE(BigInt(len), 2);
  if (!mask) return Buffer.concat([head, data]);
  const key = randomBytes(4);
  key.copy(head, 2 + ext);
  const masked = Buffer.allocUnsafe(len);
  for (let i = 0; i < len; i++) masked[i] = data[i] ^ key[i & 3];
  return Buffer.concat([head, masked]);
}

/** Stateful frame decoder: feed(chunk) calls onFrame({opcode, payload}) for each complete message. */
export function frameDecoder(onFrame) {
  let buf = Buffer.alloc(0);
  let pending = null; // { opcode, parts } while a fragmented message is in flight
  return function feed(chunk) {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    for (;;) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0;
      const opcode = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const keyOff = off;
      if (masked) off += 4;
      if (buf.length < off + len) return;
      let payload = buf.subarray(off, off + len);
      if (masked) {
        const out = Buffer.allocUnsafe(len);
        for (let i = 0; i < len; i++) out[i] = payload[i] ^ buf[keyOff + (i & 3)];
        payload = out;
      } else payload = Buffer.from(payload);
      buf = buf.subarray(off + len);
      if (opcode >= 8) { onFrame({ opcode, payload }); continue; } // control frames are never fragmented
      if (opcode === OP.CONT) {
        if (!pending) continue; // stray continuation: drop it rather than crash
        pending.parts.push(payload);
      } else pending = { opcode, parts: [payload] };
      if (fin) { onFrame({ opcode: pending.opcode, payload: Buffer.concat(pending.parts) }); pending = null; }
    }
  };
}

/** Wrap a raw duplex socket (after the handshake) in a tiny WebSocket-ish emitter. */
export function wrapSocket(socket, { mask }) {
  const ws = new EventEmitter();
  let open = true, closing = false, closeTimer = null;
  const finish = (code, reason) => {
    if (!open) return;
    open = false;
    clearTimeout(closeTimer);
    // Let a just-written close frame flush before tearing down, or the peer sees a RST instead of our close.
    if (socket.destroySoon) socket.destroySoon(); else socket.destroy();
    ws.emit("close", { code, reason });
  };
  const write = (frame) => { if (open && socket.writable) socket.write(frame); };
  const feed = frameDecoder(({ opcode, payload }) => {
    if (opcode === OP.TEXT) ws.emit("message", payload.toString("utf8"));
    else if (opcode === OP.BINARY) ws.emit("message", payload);
    else if (opcode === OP.PING) write(encodeFrame(payload, { opcode: OP.PONG, mask }));
    else if (opcode === OP.PONG) ws.emit("pong");
    else if (opcode === OP.CLOSE) {
      const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
      const reason = payload.length > 2 ? payload.subarray(2).toString("utf8") : "";
      if (!closing) write(encodeFrame(payload, { opcode: OP.CLOSE, mask })); // echo the close per RFC
      finish(code, reason);
    }
  });
  socket.on("data", feed);
  // An idle socket that drops (ECONNRESET after the peer went away) must not become an uncaught
  // exception: EventEmitter throws on "error" without listeners, so emit only when someone cares.
  socket.on("error", (e) => { if (open && ws.listenerCount("error")) ws.emit("error", e); finish(1006, e.message); });
  socket.on("close", () => finish(1006, "socket closed"));
  socket.on("end", () => finish(1006, "socket ended"));
  ws.send = (data) => {
    if (!open || closing) throw new Error("WebSocket is not open");
    write(encodeFrame(data, { opcode: Buffer.isBuffer(data) ? OP.BINARY : OP.TEXT, mask }));
  };
  ws.ping = (data = "") => write(encodeFrame(data, { opcode: OP.PING, mask }));
  ws.close = (code = 1000, reason = "") => {
    if (!open || closing) return;
    closing = true;
    const body = Buffer.alloc(2 + Buffer.byteLength(reason));
    body.writeUInt16BE(code, 0);
    body.write(reason, 2);
    write(encodeFrame(body, { opcode: OP.CLOSE, mask }));
    // Peers that never echo the close frame must not keep us hanging.
    closeTimer = setTimeout(() => finish(code, reason), 1000);
    closeTimer.unref?.();
  };
  Object.defineProperty(ws, "open", { get: () => open && !closing });
  return ws;
}

/** Client: open `url` (ws:// or wss://) with extra headers, resolve to a wrapped socket. */
export function openSocket(url, { headers = {}, timeoutMs = 15_000 } = {}) {
  const u = new URL(url);
  const secure = u.protocol === "wss:" || u.protocol === "https:";
  const key = randomBytes(16).toString("base64");
  const mod = secure ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request({
      host: u.hostname,
      port: u.port || (secure ? 443 : 80),
      path: u.pathname + u.search,
      method: "GET",
      headers: {
        host: u.host,
        connection: "Upgrade",
        upgrade: "websocket",
        "sec-websocket-version": "13",
        "sec-websocket-key": key,
        ...headers,
      },
      timeout: timeoutMs,
    });
    req.on("timeout", () => { req.destroy(new Error(`WebSocket handshake timed out after ${timeoutMs} ms`)); });
    req.on("error", reject);
    req.on("response", (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => reject(Object.assign(new Error(`WebSocket upgrade refused: ${res.statusCode} ${body.slice(0, 300)}`), { status: res.statusCode, body })));
    });
    req.on("upgrade", (res, socket, head) => {
      if (res.headers["sec-websocket-accept"] !== acceptKey(key)) {
        socket.destroy();
        reject(new Error("WebSocket handshake failed: bad Sec-WebSocket-Accept"));
        return;
      }
      socket.setNoDelay(true);
      const ws = wrapSocket(socket, { mask: true });
      if (head?.length) socket.emit("data", head);
      resolve(ws);
    });
    req.end();
  });
}

/** Server: complete the upgrade for an `upgrade` event and return the wrapped socket. */
export function acceptUpgrade(req, socket, head) {
  const key = req.headers["sec-websocket-key"];
  if (!key || String(req.headers.upgrade).toLowerCase() !== "websocket") {
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    return null;
  }
  socket.write(["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Accept: ${acceptKey(key)}`, "", ""].join("\r\n"));
  const ws = wrapSocket(socket, { mask: false });
  if (head?.length) socket.emit("data", head);
  return ws;
}
