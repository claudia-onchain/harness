import { test } from "node:test";
import assert from "node:assert/strict";
import { createTelegram, parseCommand, escapeHtml, chunk, splitArgs, TelegramError } from "../src/channels/telegram.js";
import { fakeTelegram, tick } from "./helpers.js";

test("parseCommand: commands, @bot suffix, quoted args, free text", () => {
  assert.deepEqual(parseCommand("/watch add \"SOL eco\" --handles a,b --every 15m"), { command: "watch", args: ["add", "SOL eco", "--handles", "a,b", "--every", "15m"], text: "/watch add \"SOL eco\" --handles a,b --every 15m", rest: "add \"SOL eco\" --handles a,b --every 15m" });
  assert.equal(parseCommand("/cost").command, "cost");
  assert.deepEqual(parseCommand("/cost").args, []);
  assert.equal(parseCommand("/why@PulseBot al_abc", "pulsebot").command, "why");
  assert.equal(parseCommand("/why@OtherBot al_abc", "pulsebot").foreign, true);
  assert.equal(parseCommand("/WHY x").command, "why");
  const free = parseCommand("what is CT saying about $HYPE?");
  assert.equal(free.command, null);
  assert.equal(free.text, "what is CT saying about $HYPE?");
  assert.deepEqual(splitArgs(`a 'b c' "d e" f`), ["a", "b c", "d e", "f"]);
});

test("escapeHtml and chunk", () => {
  assert.equal(escapeHtml("<b>&\"'"), "&lt;b&gt;&amp;\"'");
  assert.deepEqual(chunk("short"), ["short"]);
  assert.deepEqual(chunk(""), [""]);
  const paras = Array.from({ length: 50 }, (_, i) => `para ${i} ` + "x".repeat(150)).join("\n\n");
  const parts = chunk(paras);
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(p.length <= 4096);
  for (const p of parts) assert.ok(p.startsWith("para "), "splits on paragraph boundaries");
  assert.equal(parts.join("\n\n").replace(/\n\n+/g, "\n\n"), paras);
  const tag = "a".repeat(4090) + "<b>bold</b>";
  const tp = chunk(tag);
  assert.ok(!tp[0].endsWith("<") && !/<b?$/.test(tp[0]), "never cuts inside a tag");
  assert.ok(tp[1].startsWith("<b>"));
  const ent = "a".repeat(4093) + "&amp;zzz";
  assert.ok(chunk(ent)[1].startsWith("&amp;"), "never cuts inside an entity");
  assert.deepEqual(chunk("x".repeat(5000)), ["x".repeat(4096), "x".repeat(904)], "hard split when no breaks");
});

test("polling replays getUpdates fixtures into onMessage/onCallback with offset tracking and chat gating", async () => {
  const fixtures = [
    [
      { update_id: 10, message: { message_id: 1, chat: { id: 42 }, from: { id: 7, username: "tj" }, text: "/watch list" } },
      { update_id: 11, message: { message_id: 2, chat: { id: 999 }, from: { id: 8 }, text: "/cost" } },
      { update_id: 12, callback_query: { id: "cb1", from: { id: 7, username: "tj" }, data: "ap:ap_1:approve", message: { message_id: 5, chat: { id: 42 } } } },
      { update_id: 13, message: { message_id: 3, chat: { id: 42 }, from: { id: 7 }, text: "is SOL pumping?" } },
    ],
  ];
  const tg = fakeTelegram({ getUpdates: (body, i) => fixtures[i] || [], getMe: { username: "PulseBot" } });
  const messages = [], callbacks = [], warned = [];
  const bot = createTelegram({ token: "t", fetch: tg.fetch, onMessage: (m) => messages.push(m), onCallback: (c) => callbacks.push(c), allowChats: [42], log: { info() {}, warn: (m, d) => warned.push(d), error() {}, debug() {} }, idleDelayMs: 5 });
  bot.start();
  await tick(30);
  await bot.stop();
  assert.equal(messages.length, 2);
  assert.equal(messages[0].command, "watch");
  assert.deepEqual(messages[0].args, ["list"]);
  assert.equal(messages[0].chatId, 42);
  assert.equal(messages[0].from.username, "tj");
  assert.equal(messages[0].messageId, 1);
  assert.equal(messages[1].command, null);
  assert.equal(messages[1].text, "is SOL pumping?");
  assert.equal(callbacks.length, 1);
  assert.deepEqual({ id: callbacks[0].id, data: callbacks[0].data, chatId: callbacks[0].chatId, messageId: callbacks[0].messageId }, { id: "cb1", data: "ap:ap_1:approve", chatId: 42, messageId: 5 });
  assert.equal(warned.filter((w) => w?.chatId === 999).length, 1, "foreign chat ignored and logged");
  assert.equal(bot.offset, 14);
  const polls = tg.calls.filter((c) => c.method === "getUpdates");
  assert.equal(polls[0].body.offset, 0);
  assert.equal(polls[0].body.timeout, 25);
  assert.equal(polls[1].body.offset, 14, "acks with the next offset");
  assert.equal(bot.running, false);
});

test("polling backs off on errors and stops on 401", async () => {
  let n = 0;
  const tg = fakeTelegram({ getUpdates: () => { n++; return n < 3 ? { __error: true, code: 500, description: "boom" } : { __error: true, code: 401, description: "Unauthorized" }; } });
  const logs = [];
  const bot = createTelegram({ token: "t", fetch: tg.fetch, backoffMs: 5, log: { info() {}, warn: (m, d) => logs.push([m, d.waitMs]), error: (m) => logs.push([m]), debug() {} } });
  await bot.start(); // the loop promise settles when the 401 stops polling
  assert.deepEqual(logs.slice(0, 2), [["telegram.poll.fail", 5], ["telegram.poll.fail", 10]], "exponential backoff");
  assert.equal(logs.at(-1)[0].startsWith("telegram.unauthorized"), true);
  assert.equal(n, 3);
  assert.equal(bot.running, false);
  await bot.stop();
});

test("sendMessage chunks long text, puts buttons on the last part, HTML by default", async () => {
  const tg = fakeTelegram();
  const bot = createTelegram({ token: "t", fetch: tg.fetch });
  const text = Array.from({ length: 60 }, (_, i) => `line ${i} ` + "y".repeat(100)).join("\n");
  const last = await bot.sendMessage(42, text, { buttons: [[{ text: "Why", data: "why:al_1" }, { text: "Open", url: "https://x.com" }]] });
  const sends = tg.calls.filter((c) => c.method === "sendMessage");
  assert.equal(sends.length, 2);
  assert.equal(sends[0].body.chat_id, 42);
  assert.equal(sends[0].body.parse_mode, "HTML");
  assert.deepEqual(sends[0].body.link_preview_options, { is_disabled: true });
  assert.equal(sends[0].body.reply_markup, undefined);
  assert.deepEqual(sends[1].body.reply_markup, { inline_keyboard: [[{ text: "Why", callback_data: "why:al_1" }, { text: "Open", url: "https://x.com" }]] });
  assert.equal(sends[0].body.text + "\n" + sends[1].body.text, text);
  assert.equal(last.message_id, 2);
  assert.ok(tg.calls[0].url.startsWith("https://api.telegram.org/bott/sendMessage"));
});

test("sendPhoto by URL and by Buffer (multipart), long caption spills into a follow-up with the buttons", async () => {
  const tg = fakeTelegram();
  const bot = createTelegram({ token: "t", fetch: tg.fetch });
  await bot.sendPhoto(42, "https://img/1.png", { caption: "<b>SOL</b> up", buttons: [[{ text: "Why", data: "w" }]] });
  const p1 = tg.calls.at(-1);
  assert.equal(p1.method, "sendPhoto");
  assert.equal(p1.body.photo, "https://img/1.png");
  assert.equal(p1.body.caption, "<b>SOL</b> up");
  assert.ok(p1.body.reply_markup.inline_keyboard);
  await bot.sendPhoto(42, Buffer.from([0x89, 0x50]), { caption: "c".repeat(1500), buttons: [[{ text: "Why", data: "w" }]], filename: "card.png" });
  const p2 = tg.calls.find((c, i) => i > tg.calls.indexOf(p1) && c.method === "sendPhoto");
  assert.ok(p2.init.body instanceof FormData);
  assert.equal(p2.body.chat_id, "42");
  assert.equal(p2.body.caption.length, 1024);
  assert.equal(p2.body.reply_markup, undefined, "buttons move to the tail message");
  assert.ok(p2.body.photo instanceof Blob || typeof p2.body.photo === "object");
  const tail = tg.calls.at(-1);
  assert.equal(tail.method, "sendMessage");
  assert.equal(tail.body.text.length, 476);
  assert.ok(tail.body.reply_markup);
  await bot.sendVideo(42, "https://v/1.mp4", { caption: "brief", duration: 6 });
  assert.equal(tg.calls.at(-1).body.video, "https://v/1.mp4");
  assert.equal(tg.calls.at(-1).body.duration, 6);
});

test("answerCallback, editButtons and API errors", async () => {
  const tg = fakeTelegram({ editMessageReplyMarkup: { __error: true, code: 400, description: "message is not modified" } });
  const bot = createTelegram({ token: "t", fetch: tg.fetch });
  await bot.answerCallback("cb1", "ok");
  assert.deepEqual(tg.calls.at(-1).body, { callback_query_id: "cb1", text: "ok", show_alert: false });
  await assert.rejects(bot.editButtons(42, 5, []), (e) => e instanceof TelegramError && e.code === 400 && /not modified/.test(e.description));
  assert.equal(tg.calls.at(-1).body.reply_markup.inline_keyboard.length, 0);
  assert.throws(() => createTelegram({}), /token/);
});
