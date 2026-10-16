# Webhooks

Every change to your account is an **event**. Webhooks push events to your server as they happen, signed so you
can prove they came from Paylink. The same events are available to pull from the [Events API](#the-events-api).

## Set up an endpoint

Create an endpoint with a public `https` URL and the event types it wants, or `["*"]` for all of them. You can do
this in the dashboard (**Developers → Webhooks**) or with the API:

```bash
curl https://paylink.useclaudia.xyz/v1/webhook_endpoints \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"url":"https://shop.example.com/webhooks",
       "enabled_events":["payment_intent.succeeded","payment_intent.requires_review","refund.created"]}'
```

The response includes the signing `secret` (`whsec_…`), shown **once**. Store it, for example as
`PAYLINK_WEBHOOK_SECRET`. Roll it with `POST /v1/webhook_endpoints/:id/roll_secret`; the new secret takes effect
immediately.

- Endpoints belong to one mode: test events go to test endpoints, live events to live endpoints.
- URLs must be `https` and resolve to a public address. Private, loopback, link-local, CGNAT and cloud-metadata
  addresses are refused, the connection is pinned to the checked address, and redirects are never followed.
- Check your handler with `POST /v1/webhook_endpoints/:id/test` (optionally `{"type":"invoice.paid"}`). The sample
  is sent to that endpoint only and its object carries `test_event: true`.

## The request

```http
POST /webhooks HTTP/1.1
Content-Type: application/json
User-Agent: Paylink-Webhooks/1.0
Paylink-Signature: t=1790239828,v1=5f0c9b7e2a1d4c8f…
Paylink-Event: payment_intent.succeeded
Paylink-Event-Id: evt_7QvK2mZr9XbN4sLwT1cYpD8e
```

| Header | Meaning |
|---|---|
| `Paylink-Signature` | `t=<unix seconds>,v1=<hex HMAC-SHA256>`. See [Verifying signatures](#verifying-signatures). |
| `Paylink-Event` | The event type. |
| `Paylink-Event-Id` | The event id, for de-duplication. |

The body is the **event object**. `data.object` is the object as it was when the event happened, in the same
shape the REST API returns.

```json
{
  "id": "evt_7QvK2mZr9XbN4sLwT1cYpD8e",
  "object": "event",
  "type": "payment_intent.succeeded",
  "api_version": "2026-09-01",
  "data": {
    "object": {
      "id": "pi_3HnV8sKq2LmZ9xWc4TbR7yPe",
      "object": "payment_intent",
      "amount": "48.00",
      "currency": "USD",
      "status": "succeeded",
      "description": "Order 1042",
      "customer_email": "ada@example.com",
      "metadata": { "order_id": "1042" },
      "hosted_url": "https://paylink.useclaudia.xyz/pay/pi_3HnV8sKq2LmZ9xWc4TbR7yPe",
      "source": "api",
      "amount_received_usd": "48.00",
      "amount_refunded": "0",
      "client_secret": null,
      "latest_attempt": {
        "id": "pa_4kTq9WmZ2rXb7NcLp0YvHs3D",
        "object": "payment_attempt",
        "status": "paid",
        "asset": "usdc.base",
        "network": "base",
        "amount_expected": "48.00",
        "amount_confirmed": "48.00",
        "amount_settled": "48.00",
        "tx_hash": "0x8e2d…b41c",
        "payer": "0x2b7e0c9d4a1f6e3b8c5d7a0f9e2c4b6d8a1f3e5c",
        "confirmed_at": 1790239828,
        "…": "…"
      },
      "succeeded_at": 1790239828,
      "created": 1790239607,
      "livemode": true,
      "…": "…"
    }
  },
  "request": "req_9f2c1a7b3e5d4c6a8b0e",
  "created": 1790239828,
  "livemode": true
}
```

`request` is the id of the API request that caused the event, or `null` when the event came from the background
worker (settlement, reminders, renewals).

## Event types

| Type | When | `data.object` |
|---|---|---|
| `payment_intent.created` | An intent was created: by the API, a payment link, an invoice, the Terminal or the dashboard. | payment_intent |
| `payment_intent.processing` | Enough value was seen on chain; waiting for finality. **Do not fulfil yet.** | payment_intent |
| `payment_intent.partially_paid` | Less than the quote arrived. The customer can still send the rest. | payment_intent |
| `payment_intent.requires_review` | The payment needs a decision: late, short after expiry, or held. See `review_reason`. | payment_intent |
| `payment_intent.succeeded` | Final value covers the quote and is booked. **Fulfil the order.** | payment_intent |
| `payment_intent.canceled` | Canceled by you, by voiding its invoice, or refunded from a review. | payment_intent |
| `payment_intent.expired` | Passed its expiry with nothing paid. | payment_intent |
| `payment_attempt.created` | The customer chose a coin and network; carries the quote and address. | payment_attempt |
| `payment_attempt.misdirected` | A stablecoin arrived at the payment address on a different network. A `review.opened` follows. | payment_attempt, plus `misdirected: { network, asset, amount }` |
| `refund.created` | A refund was created. Carries `claim_url` when the customer must supply an address. | refund |
| `refund.updated` | The customer supplied an address through the claim link, or the refund was canceled. | refund |
| `refund.succeeded` | The refund was verified on chain. | refund |
| `refund.failed` | The refund could not be sent; reserved funds were returned. | refund |
| `payout.created` | A payout was requested (by a person, the API, an agent or a schedule). | payout |
| `payout.approved` | A payout received the approvals it needed. | payout |
| `payout.paid` | A payout was verified on chain. | payout |
| `payout.failed` | A payout could not be sent; funds were returned to available. | payout |
| `payout.canceled` | A payout was canceled or rejected before sending. | payout |
| `invoice.finalized` | An invoice was numbered and became payable. | invoice |
| `invoice.paid` | An invoice's payment succeeded. | invoice |
| `invoice.voided` | An invoice was voided. | invoice |
| `invoice.overdue` | Three or seven days past due and still open. | invoice |
| `invoice.reminder` | Three days before the due date, and on the due date. | invoice |
| `subscription.created` | A subscription started and issued its first invoice. | subscription |
| `subscription.updated` | A subscription renewed into a new period, or was set to cancel at period end. | subscription |
| `subscription.canceled` | A subscription ended. | subscription |
| `customer.created` | A customer was created, by the API or when a payment arrived from a new email or wallet. | customer |
| `customer.updated` | A customer's details changed. | customer |
| `review.opened` | A review was opened on a payment. | review |
| `review.closed` | A review was resolved. | review |

That is all 30 types. New types may be added without a new API version; an endpoint subscribed to `*` starts
receiving them, so ignore types you do not handle.

**A typical shop subscribes to** `payment_intent.succeeded` (fulfil), `payment_intent.requires_review` (tell
someone), `refund.created` (send the claim link if there is one) and `refund.succeeded`.

## Verifying signatures

The `Paylink-Signature` header has two parts:

- `t`: the Unix time the delivery was signed.
- `v1`: the hex-encoded HMAC-SHA256 of the string `` `${t}.${rawBody}` ``, keyed with the endpoint's secret
  (the **whole** `whsec_…` string, used as-is).

To verify:

1. Read the **raw** request body as bytes, before any JSON parsing. Re-serialised JSON will not match.
2. Split the header on `,` and each part on the first `=`.
3. Reject the request if `t` is more than **300 seconds** from your clock (stops replays of captured deliveries).
4. Compute `HMAC-SHA256(secret, t + "." + rawBody)` as hex and compare it to `v1` in constant time.

### Node SDK

```js
import express from "express";
import { Paylink } from "@paylink/node";

const paylink = new Paylink(process.env.PAYLINK_SECRET_KEY, { baseUrl: "https://paylink.useclaudia.xyz" });
const app = express();

// express.raw keeps the exact bytes; express.json would break the signature.
app.post("/webhooks", express.raw({ type: "application/json" }), async (req, res) => {
  let event;
  try {
    event = paylink.webhooks.constructEvent(req.body, req.headers["paylink-signature"], process.env.PAYLINK_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(err.message); // SignatureVerificationError
  }
  if (await alreadyHandled(event.id)) return res.sendStatus(200);
  if (event.type === "payment_intent.succeeded") await fulfil(event.data.object);
  res.sendStatus(200);
});
```

`constructEvent(payload, header, secret, toleranceSeconds = 300)` throws `SignatureVerificationError` on a
missing or malformed header, a timestamp outside the tolerance, or a mismatch, and returns the parsed event
otherwise.

### Raw Node (no dependencies)

```js
import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.PAYLINK_WEBHOOK_SECRET; // the whole "whsec_…" string
const TOLERANCE_SECONDS = 300;

function verify(header, rawBody) {
  const parts = Object.fromEntries((header ?? "").split(",").map((kv) => kv.split("=", 2)));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - t) > TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", SECRET).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/webhooks") return res.writeHead(404).end();
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    const rawBody = Buffer.concat(chunks).toString("utf8"); // verify the exact bytes
    if (!verify(req.headers["paylink-signature"], rawBody)) return res.writeHead(400).end();
    const event = JSON.parse(rawBody);
    // Deliveries are at least once: skip event.id values you have already handled.
    await handle(event);
    res.writeHead(200).end();
  });
}).listen(3000);
```

### Python (Flask)

```python
import hashlib, hmac, os, time
from flask import Flask, abort, request

app = Flask(__name__)
SECRET = os.environ["PAYLINK_WEBHOOK_SECRET"].encode()  # the whole "whsec_…" string
TOLERANCE_SECONDS = 300

def verify(header: str, raw_body: bytes) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    try:
        t = int(parts["t"])
    except (KeyError, ValueError):
        return False
    if abs(time.time() - t) > TOLERANCE_SECONDS:
        return False
    expected = hmac.new(SECRET, f"{t}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts.get("v1", ""))

@app.post("/webhooks")
def webhooks():
    if not verify(request.headers.get("Paylink-Signature", ""), request.get_data()):
        abort(400)
    event = request.get_json()
    # Deliveries are at least once: skip event["id"] values you have already handled.
    handle(event)
    return "", 200
```

## Delivery and retries

Respond with any `2xx` within **10 seconds** to acknowledge. Anything else (another status, a timeout, a refused
connection) is a failure, and the delivery is retried on this schedule, measured from when the delivery was
queued:

| Attempt | Due after |
|---|---|
| 1 | Immediately |
| 2 | 1 minute |
| 3 | 5 minutes |
| 4 | 30 minutes |
| 5 | 2 hours |
| 6 | 5 hours |
| 7 | 10 hours |
| 8 | 24 hours |
| 9 | 48 hours |
| 10 | 72 hours |

After the tenth attempt, about three days in, the delivery is marked `failed`. A delivery blocked by the URL
safety checks fails at once without retrying. You can redeliver any delivery from the dashboard or with
`POST /v1/webhook_deliveries/:id/retry`, and inspect them with `GET /v1/webhook_endpoints/:id/deliveries`.

**Automatic disabling.** An endpoint that has failed at least 20 times in a row and has not succeeded for three
days is disabled, with a `disabled_reason` on the endpoint. Events that happen while an endpoint is disabled are
not queued for it. After fixing it, re-enable it with `POST /v1/webhook_endpoints/:id` and `{"disabled": false}`
(which also resets the failure count), then catch up from the Events API.

## Guarantees and how to handle them

1. **Never a phantom event, never a missing one.** An event is written in the same database transaction as the
   change it describes, together with its deliveries. Either all commit or none do.
2. **At least once.** A delivery can arrive more than once. Record each `event.id` (also in `Paylink-Event-Id`) and
   skip repeats.
3. **Not necessarily in order.** Retries reorder deliveries. Use `created`, or fetch the object's current state,
   rather than assuming the last event you received is the latest.
4. **Acknowledge fast.** Return `200` and do slow work afterwards; a slow handler risks the 10-second timeout and a
   retry.
5. **Ordered per endpoint, parallel across endpoints.** Deliveries due to one endpoint go out one after another;
   one slow receiver does not hold up others.

## The Events API

Every event is also stored and listable, which is how you backfill after downtime or audit what happened.

```bash
# Everything about payment intents in the last day, newest first
curl "https://paylink.useclaudia.xyz/v1/events?type=payment_intent.*&created[gte]=$(($(date +%s)-86400))&limit=100" \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY"

# One event
curl https://paylink.useclaudia.xyz/v1/events/evt_7QvK2mZr9XbN4sLwT1cYpD8e -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

`type` takes a comma-separated list and trailing wildcards (`invoice.*`). Paginate with `limit` and
`starting_after` (see [api-reference.md](api-reference.md#pagination)). A restricted key needs `events: read`.

With the SDK:

```js
for await (const event of paylink.events.list({ type: "payment_intent.succeeded" })) {
  if (!(await alreadyHandled(event.id))) await fulfil(event.data.object);
}
```
