# Node SDK: `@paylink/node`

The server-side SDK for the Paylink API. Zero dependencies, Node 18+, ESM, fully typed: the object types are
generated from the same definitions the server serializes, so the SDK and the API cannot drift.

- Every `POST` carries an `Idempotency-Key` (generated unless you pass one), so retries are safe.
- Network errors, `429`, `5xx` and `409 request_in_progress` are retried with exponential backoff (honouring
  `Retry-After`).
- Every list is an awaitable first page **and** an async iterator that pages for you.
- Errors are typed `PaylinkError`s.
- Webhook signature verification is built in.

## Install

```bash
npm install @paylink/node
# or: pnpm add @paylink/node / yarn add @paylink/node
```

The SDK is a thin, typed layer over the [REST API](api-reference.md): anything it does, a plain `fetch` to
`https://paylink.useclaudia.xyz/v1` can do too.

## Initialise

```ts
import { Paylink } from "@paylink/node";   // also the default export

const paylink = new Paylink(process.env.PAYLINK_SECRET_KEY!, {
  baseUrl: "https://paylink.useclaudia.xyz",
});
```

The constructor takes a **secret** (`sk_…`) or **restricted** (`rk_…`) key; anything else throws. Publishable
keys belong in the browser. `paylink.livemode` is `true` for `_live_` keys.

| Option | Default | Meaning |
|---|---|---|
| `baseUrl` | `http://localhost:5000` | **Set this** to `https://paylink.useclaudia.xyz`. |
| `maxRetries` | `2` | Retries for retryable failures. |
| `timeout` | `30000` | Per-request timeout in ms. |
| `apiVersion` | unset | Sent as `Paylink-Version`. Informational today; the server has one version. |
| `headerPrefix` | `"Paylink"` | Prefix for the signature and version headers. Leave as is. |
| `fetch` | global `fetch` | Inject your own (tests, proxies). |

## Requests, options and errors

Every write method takes an optional last argument `{ idempotencyKey }`. Pass your own (an order id, say) so a
retry from your side, even after a process restart, cannot create a second object:

```ts
const pi = await paylink.paymentIntents.create(
  { amount: "49.99", currency: "USD", description: "Order 1001", metadata: { order_id: "1001" } },
  { idempotencyKey: "order-1001" },
);
```

Failures throw `PaylinkError`:

```ts
import { PaylinkError } from "@paylink/node";

try {
  await paylink.refunds.create({ payment_intent: "pi_…" });
} catch (err) {
  if (err instanceof PaylinkError) {
    console.log(err.status, err.type, err.code, err.param, err.requestId, err.message);
    // e.g. 409 conflict_error already_refunded undefined req_… "This payment has already been fully refunded."
  }
  throw err;
}
```

A network failure after all retries is a `PaylinkError` with `status: 0`, `type: "api_connection_error"`,
`code: "network_error"`. See [api-reference.md](api-reference.md#errors) for types and codes.

## Lists and pagination

```ts
// The first page
const page = await paylink.paymentIntents.list({ status: "succeeded", limit: 50 });
console.log(page.data.length, page.has_more);

// Every item, page after page
for await (const p of paylink.paymentIntents.list({ status: "succeeded" })) {
  console.log(p.id, p.amount, p.latest_attempt?.asset);
}
```

All list params accept `limit` (1 to 100) and `starting_after`.

---

## Methods

### `paylink.paymentIntents`

```ts
// Create: send the customer to pi.hosted_url
const pi = await paylink.paymentIntents.create({
  amount: "48.00",              // required, decimal string
  currency: "USD",
  description: "Order 1042",
  customer: "cus_…",            // or customer_email / customer_name
  metadata: { order_id: "1042" },
  allowed_assets: ["usdc.base", "usdc.solana"],
  success_url: "https://shop.example.com/thanks",
  cancel_url: "https://shop.example.com/cart",
  expires_in: 3600,
}, { idempotencyKey: "order_1042" });

const same = await paylink.paymentIntents.retrieve(pi.id);
await paylink.paymentIntents.update(pi.id, { metadata: { shipment: "DHL-448120" } });   // PATCH
for await (const p of paylink.paymentIntents.list({ status: "requires_review", q: "ada@" })) { /* … */ }
await paylink.paymentIntents.cancel(pi.id, { reason: "Customer changed their mind" });

const attempts = await paylink.paymentIntents.listAttempts(pi.id);           // { data: PaymentAttempt[] }
const attempt = await paylink.paymentIntents.createAttempt(pi.id, { asset: "usdc.base" });
console.log(attempt.address, attempt.amount_expected, attempt.payment_uri);

const timeline = await paylink.paymentIntents.timeline(pi.id);               // { data: TimelineEntry[] }

// Test mode only (sk_test_ / rk_test_ keys)
await paylink.paymentIntents.simulate(pi.id, { scenario: "paid", asset: "usdc.base", confirm_after: 5 });
```

| Method | HTTP |
|---|---|
| `create(params, opts?)` | `POST /v1/payment_intents` |
| `retrieve(id)` | `GET /v1/payment_intents/:id` |
| `update(id, { description?, metadata? })` | `PATCH /v1/payment_intents/:id` |
| `list({ status?, customer?, q?, limit?, starting_after? })` | `GET /v1/payment_intents` |
| `cancel(id, { reason? }, opts?)` | `POST /v1/payment_intents/:id/cancel` |
| `listAttempts(id)` | `GET /v1/payment_intents/:id/attempts` |
| `createAttempt(id, { asset }, opts?)` | `POST /v1/payment_intents/:id/attempts` |
| `timeline(id)` | `GET /v1/payment_intents/:id/timeline` |
| `simulate(id, { scenario, asset?, confirm_after? })` | `POST /v1/payment_intents/:id/simulate` |

`scenario` is `"paid" | "underpaid" | "overpaid" | "late" | "reorg" | "top_up"`.

### `paylink.refunds`

```ts
const refund = await paylink.refunds.create(
  { payment_intent: "pi_…", amount: "12.00", reason: "One bag arrived damaged" },
  { idempotencyKey: "refund-1042" },
);
if (refund.claim_url) await emailCustomer(refund.claim_url);   // only present on this response

await paylink.refunds.retrieve(refund.id);
for await (const r of paylink.refunds.list({ payment_intent: "pi_…" })) { /* … */ }
await paylink.refunds.cancel(refund.id);
```

| Method | HTTP |
|---|---|
| `create({ payment_intent, amount?, reason? }, opts?)` | `POST /v1/refunds` |
| `retrieve(id)` | `GET /v1/refunds/:id` |
| `list({ payment_intent?, limit?, starting_after? })` | `GET /v1/refunds` |
| `cancel(id, opts?)` | `POST /v1/refunds/:id/cancel` |

### `paylink.customers`

```ts
const cus = await paylink.customers.create({ email: "ada@example.com", name: "Ada Lovelace" });
await paylink.customers.retrieve(cus.id);
await paylink.customers.update(cus.id, { name: "Ada King", metadata: { tier: "gold" } });
for await (const c of paylink.customers.list({ q: "ada" })) { /* … */ }
await paylink.customers.del(cus.id);   // { id, object: "customer", deleted: true }
```

| Method | HTTP |
|---|---|
| `create({ email?, name?, description?, metadata? }, opts?)` | `POST /v1/customers` |
| `retrieve(id)` | `GET /v1/customers/:id` |
| `update(id, { email?, name?, description?, metadata? }, opts?)` | `POST /v1/customers/:id` |
| `del(id)` | `DELETE /v1/customers/:id` |
| `list({ email?, q?, limit?, starting_after? })` | `GET /v1/customers` |

### `paylink.products` and `paylink.prices`

```ts
const product = await paylink.products.create({
  name: "Coffee box",
  description: "250 g of this month's roast",
  default_price: { unit_amount: "12.00", currency: "USD", recurring: { interval: "month" } },
});
const monthly = product.default_price!;

const yearly = await paylink.prices.create({
  product: product.id, unit_amount: "120.00", nickname: "Yearly", recurring: { interval: "year" },
});
await paylink.prices.update(monthly.id, { nickname: "Monthly" });
for await (const p of paylink.prices.list({ product: product.id })) { /* … */ }

await paylink.products.retrieve(product.id);
await paylink.products.update(product.id, { active: false });
for await (const p of paylink.products.list({ active: "true" })) { /* … */ }
```

| Method | HTTP |
|---|---|
| `products.create({ name, description?, image?, metadata?, default_price? }, opts?)` | `POST /v1/products` |
| `products.retrieve(id)` | `GET /v1/products/:id` |
| `products.update(id, { name?, description?, image?, active?, metadata? }, opts?)` | `POST /v1/products/:id` |
| `products.list({ active?: "true" \| "false", … })` | `GET /v1/products` |
| `prices.create({ product, unit_amount, currency?, nickname?, recurring? }, opts?)` | `POST /v1/prices` |
| `prices.update(id, { active?, nickname? }, opts?)` | `POST /v1/prices/:id` |
| `prices.list({ product?, … })` | `GET /v1/prices` |

### `paylink.paymentLinks`

```ts
const link = await paylink.paymentLinks.create({
  title: "Support the newsletter",
  amount_type: "custom",
  min_amount: "2",
  presets: ["5", "10", "25"],
  collect_email: true,
});
console.log(link.url);   // https://paylink.useclaudia.xyz/l/…

await paylink.paymentLinks.retrieve(link.id);
await paylink.paymentLinks.update(link.id, { active: false });
for await (const l of paylink.paymentLinks.list({ active: "true" })) { /* … */ }
```

`create` accepts every field of [`POST /v1/payment_links`](api-reference.md#create-a-payment-link).

| Method | HTTP |
|---|---|
| `create({ title, amount_type?, … }, opts?)` | `POST /v1/payment_links` |
| `retrieve(id)` | `GET /v1/payment_links/:id` |
| `update(id, { active?, title?, description?, metadata? }, opts?)` | `POST /v1/payment_links/:id` |
| `list({ active?, … })` | `GET /v1/payment_links` |

### `paylink.invoices`

```ts
const invoice = await paylink.invoices.create({
  customer: "cus_…",
  lines: [{ description: "Wholesale beans, 5 kg", quantity: "2", unit_amount: "60.00" }],
  tax_rate: "20",
  due_at: Math.floor(Date.now() / 1000) + 14 * 86_400,
  finalize: true,
});
console.log(invoice.number, invoice.hosted_url);

await paylink.invoices.retrieve(invoice.id);
for await (const i of paylink.invoices.list({ status: "open" })) { /* … */ }

const draft = await paylink.invoices.create({ customer_email: "buyer@example.com", lines: [{ price: "price_…", quantity: "1" }] });
await paylink.invoices.finalize(draft.id);
await paylink.invoices.void(draft.id);
await paylink.invoices.markUncollectible(invoice.id);
```

| Method | HTTP |
|---|---|
| `create({ lines, finalize?, customer?, customer_name?, customer_email?, … }, opts?)` | `POST /v1/invoices` |
| `retrieve(id)` | `GET /v1/invoices/:id` |
| `list({ status?, customer?, … })` | `GET /v1/invoices` |
| `finalize(id, opts?)` | `POST /v1/invoices/:id/finalize` |
| `void(id, opts?)` | `POST /v1/invoices/:id/void` |
| `markUncollectible(id, opts?)` | `POST /v1/invoices/:id/mark_uncollectible` |

### `paylink.subscriptions`

```ts
const sub = await paylink.subscriptions.create({ customer: "cus_…", price: "price_…", days_until_due: 7 });
await paylink.subscriptions.retrieve(sub.id);
for await (const s of paylink.subscriptions.list({ status: "past_due" })) { /* … */ }
await paylink.subscriptions.cancel(sub.id, { at_period_end: true });
```

| Method | HTTP |
|---|---|
| `create({ customer, price, quantity?, days_until_due?, metadata? }, opts?)` | `POST /v1/subscriptions` |
| `retrieve(id)` | `GET /v1/subscriptions/:id` |
| `list({ status?, … })` | `GET /v1/subscriptions` |
| `cancel(id, { at_period_end? }, opts?)` | `POST /v1/subscriptions/:id/cancel` |

### `paylink.balance` and `paylink.balanceTransactions`

```ts
const balance = await paylink.balance.retrieve();
console.log(balance.totals_usd.available, balance.available);

for await (const t of paylink.balanceTransactions.list({ type: "payment,refund" })) {
  console.log(t.type, t.amount, t.fee, t.net, t.asset);
}
```

| Method | HTTP |
|---|---|
| `balance.retrieve()` | `GET /v1/balance` |
| `balanceTransactions.list({ type?, … })` | `GET /v1/balance_transactions` |

### `paylink.payouts` and `paylink.payoutDestinations`

```ts
const { data: destinations } = await paylink.payoutDestinations.list();
const treasury = destinations.find((d) => d.status === "active" && d.networks.includes("base"))!;

const payout = await paylink.payouts.create(
  { amount: "1250.00", asset: "usdc.base", destination: treasury.id, description: "Weekly sweep" },
  { idempotencyKey: "payout-2026-09-24" },
);
console.log(payout.status);   // "approved" or "pending_approval"

await paylink.payouts.retrieve(payout.id);
for await (const p of paylink.payouts.list({ status: "pending_approval" })) { /* … */ }
await paylink.payouts.cancel(payout.id);

await paylink.payoutDestinations.revoke("wd_…");
```

| Method | HTTP |
|---|---|
| `payouts.create({ amount, asset, destination, description? }, opts?)` | `POST /v1/payouts` |
| `payouts.retrieve(id)` | `GET /v1/payouts/:id` |
| `payouts.list({ status?, … })` | `GET /v1/payouts` |
| `payouts.cancel(id, opts?)` | `POST /v1/payouts/:id/cancel` |
| `payoutDestinations.list()` | `GET /v1/payout_destinations` |
| `payoutDestinations.revoke(id)` | `DELETE /v1/payout_destinations/:id` |
| `payoutDestinations.create({ address, label?, networks }, opts?)` | `POST /v1/payout_destinations`: **always fails with an API key** (`dashboard_only`). Destinations are added by a person in the dashboard. |

Approving and rejecting payouts is dashboard-only and has no SDK method.

### `paylink.reviews`

```ts
for await (const r of paylink.reviews.list({ status: "open" })) {
  if (r.reason === "late_payment") await paylink.reviews.resolve(r.id, { action: "accept", note: "Customer confirmed" });
}
```

| Method | HTTP |
|---|---|
| `list({ status?, … })` | `GET /v1/reviews` (scope `payment_intents: read`) |
| `resolve(id, { action: "accept" \| "refund" \| "dismiss", note? }, opts?)` | `POST /v1/reviews/:id/resolve` (scope `refunds: write`) |

The API also accepts `status: "closed"` on the list (approved, refunded and dismissed together); the SDK's type
lists the individual statuses only.

### `paylink.events`

```ts
for await (const e of paylink.events.list({ type: "payment_intent.*" })) { /* backfill */ }
const event = await paylink.events.retrieve("evt_…");
```

| Method | HTTP |
|---|---|
| `retrieve(id)` | `GET /v1/events/:id` |
| `list({ type?, … })` | `GET /v1/events` |

### `paylink.webhookEndpoints`

```ts
const endpoint = await paylink.webhookEndpoints.create({
  url: "https://shop.example.com/webhooks",
  enabled_events: ["payment_intent.succeeded", "payment_intent.requires_review", "refund.created"],
});
await saveSecret(endpoint.secret!);   // shown once

await paylink.webhookEndpoints.retrieve(endpoint.id);
await paylink.webhookEndpoints.list();
await paylink.webhookEndpoints.update(endpoint.id, { enabled_events: ["*"] });
await paylink.webhookEndpoints.update(endpoint.id, { disabled: false });   // re-enable
const rolled = await paylink.webhookEndpoints.rollSecret(endpoint.id);     // rolled.secret
await paylink.webhookEndpoints.del(endpoint.id);
```

| Method | HTTP |
|---|---|
| `create({ url, enabled_events, description? }, opts?)` | `POST /v1/webhook_endpoints` |
| `retrieve(id)` | `GET /v1/webhook_endpoints/:id` |
| `update(id, { url?, enabled_events?, description?, disabled? }, opts?)` | `POST /v1/webhook_endpoints/:id` |
| `del(id)` | `DELETE /v1/webhook_endpoints/:id` |
| `list()` | `GET /v1/webhook_endpoints` |
| `rollSecret(id)` | `POST /v1/webhook_endpoints/:id/roll_secret` |

### `paylink.webhooks.constructEvent`

```ts
import express from "express";
import { Paylink, SignatureVerificationError } from "@paylink/node";

app.post("/webhooks", express.raw({ type: "application/json" }), (req, res) => {
  let event;
  try {
    event = paylink.webhooks.constructEvent(
      req.body,                              // the RAW body: Buffer or string
      req.headers["paylink-signature"],      // string | string[] | undefined
      process.env.PAYLINK_WEBHOOK_SECRET!,   // the endpoint's whsec_… secret
      300,                                   // tolerance in seconds (default 300)
    );
  } catch (err) {
    if (err instanceof SignatureVerificationError) return res.status(400).send(err.message);
    throw err;
  }
  if (event.type === "payment_intent.succeeded") fulfil(event.data.object);
  res.sendStatus(200);
});
```

It parses `t` and `v1` from the header, rejects timestamps outside the tolerance, recomputes
`HMAC-SHA256(secret, "${t}.${body}")` and compares in constant time. It throws `SignatureVerificationError` for a
missing header, a malformed header, a stale timestamp or a mismatch, and returns the parsed `EventObject`.
Signatures only match the exact bytes received, so never pass re-serialised JSON. Details:
[webhooks.md](webhooks.md#verifying-signatures).

### `paylink.request` (anything else)

Endpoints without a dedicated method can be called with the generic, typed `request`. It applies the same auth,
idempotency and retries:

```ts
import type { WebhookDelivery, ListResponse, Refund } from "@paylink/node";

// Report a refund you sent yourself (direct settlement)
await paylink.request<Refund>("POST", "/refunds/re_…/mark_sent", { tx_hash: "0x…" });

// Webhook deliveries and retries
const deliveries = await paylink.request<ListResponse<WebhookDelivery>>("GET", "/webhook_endpoints/we_…/deliveries");
await paylink.request("POST", "/webhook_deliveries/whd_…/retry", {});
await paylink.request("POST", "/webhook_endpoints/we_…/test", { type: "invoice.paid" });

// Accepted assets and analytics
const assets = await paylink.request("GET", "/assets");
const analytics = await paylink.request("GET", "/analytics", { days: 30 });

// A filter the typed list does not expose
await paylink.request("GET", "/invoices", { subscription: "sub_…" });
```

`request(method, path, params?, { idempotencyKey }?)`: `path` is relative to `/v1`; for `GET`, `params` become
the query string, otherwise the JSON body. CSV reports (`/reports/:kind.csv`) return text, not JSON, so fetch
those with `fetch` directly.

---

## Types

All API object types are exported:

```ts
import type {
  PaymentIntent, PaymentAttempt, Refund, Customer, Product, Price, PaymentLink, Invoice, Subscription,
  Balance, BalanceTransaction, Payout, PayoutDestination, Review, EventObject, WebhookEndpoint,
  WebhookDelivery, AssetObject, ListResponse, ApiErrorBody, TimelineEntry,
} from "@paylink/node";
```

They are generated from `apps/gateway/shared/api.ts` by `packages/node/scripts/sync-types.mjs` (run as part of the
SDK build).

## A complete example

```ts
import express from "express";
import { Paylink } from "@paylink/node";

const paylink = new Paylink(process.env.PAYLINK_SECRET_KEY!, { baseUrl: "https://paylink.useclaudia.xyz" });
const app = express();

app.post("/checkout/:orderId", express.json(), async (req, res) => {
  const order = await loadOrder(req.params.orderId);
  const pi = await paylink.paymentIntents.create(
    { amount: order.total, currency: "USD", description: `Order ${order.id}`, metadata: { order_id: order.id },
      success_url: `https://shop.example.com/orders/${order.id}` },
    { idempotencyKey: `order-${order.id}` },
  );
  res.redirect(303, pi.hosted_url);
});

app.post("/webhooks", express.raw({ type: "application/json" }), async (req, res) => {
  const event = paylink.webhooks.constructEvent(req.body, req.headers["paylink-signature"], process.env.PAYLINK_WEBHOOK_SECRET!);
  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as { metadata: Record<string, string> };
    await markPaid(pi.metadata.order_id);   // idempotent on your side: deliveries are at least once
  }
  res.sendStatus(200);
});

app.listen(3000);
```

Test it with an `sk_test_` key and `paylink.paymentIntents.simulate(pi.id, { scenario: "paid" })`.
