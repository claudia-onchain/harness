# API reference

The Paylink REST API. Everything the dashboard can do goes through this same API, with the same validation and
the same events.

- **Base URL:** `https://paylink.useclaudia.xyz/v1`.
- **Format:** JSON request bodies (`Content-Type: application/json`, at most 400 KB), JSON responses. CSV reports
  are the one exception.
- **Current API version:** `2026-09-01` (see [Versioning](#versioning)).

Examples use `curl` with a test secret key:

```bash
export PAYLINK_SECRET_KEY=sk_test_...
```

## Contents

- [Authentication and keys](#authentication-and-keys) · [Scopes](#restricted-key-scopes) · [Publishable keys](#publishable-keys)
- [Conventions](#conventions) · [Idempotency](#idempotency) · [Versioning](#versioning) · [Pagination](#pagination)
- [Errors](#errors) · [Rate limits](#rate-limits)
- Endpoints:
  [Payment intents](#payment-intents) ·
  [Refunds](#refunds) ·
  [Customers](#customers) ·
  [Products](#products) ·
  [Prices](#prices) ·
  [Payment links](#payment-links) ·
  [Invoices](#invoices) ·
  [Subscriptions](#subscriptions) ·
  [Balance](#balance) ·
  [Payouts](#payouts) ·
  [Payout destinations](#payout-destinations) ·
  [Reviews](#reviews) ·
  [Events](#events) ·
  [Webhook endpoints](#webhook-endpoints) ·
  [Assets](#assets) ·
  [Reports and analytics](#reports-and-analytics)
- [Test mode and simulation](#test-mode-and-simulation)
- [Other HTTP endpoints](#other-http-endpoints)

---

## Authentication and keys

Authenticate every request with an API key as a bearer token:

```bash
curl https://paylink.useclaudia.xyz/v1/balance -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

Keys are created in the dashboard under **Developers → API keys**. Creating or rolling a key asks for a fresh
wallet signature. A key is shown **once** and stored only as a SHA-256 hash. Each key belongs to one account and
one mode: a test key only ever sees test data, a live key only live data.

| Prefix | Kind | Can |
|---|---|---|
| `sk_live_` / `sk_test_` | **Secret** | Everything the API offers for its account and mode, except the people-only actions below. Server-side only. |
| `rk_live_` / `rk_test_` | **Restricted** | Only the resources and access levels it names. Use one per service or agent. |
| `pk_live_` / `pk_test_` | **Publishable** | Safe in a browser. Can read one intent and create an attempt on it when it presents that intent's `client_secret`, and list accepted assets. Every other endpoint answers `permission_error` (`publishable_key`). |

**People-only actions.** These can never be done with any key, so a leaked key cannot redirect your money:

- approving or rejecting a payout (`POST /v1/payouts/:id/approve`, `/reject`): `dashboard_only`;
- adding a payout destination (`POST /v1/payout_destinations`): `dashboard_only`, and needs a fresh wallet
  signature.

**IP allowlists and expiry.** Any key can be limited to up to 50 IPv4/IPv6 addresses or CIDR ranges (a request
from elsewhere fails with `ip_not_allowed`), and can expire after 1 to 730 days (`api_key_expired`). Every use
records the time and IP.

**Rolling.** Rolling a key issues a replacement with the same kind, scopes and IP list and keeps the old one
working for a grace period (24 hours by default, up to 7 days; 0 revokes it at once). Revoking takes effect
immediately.

**Request logs.** Every API-key request is recorded under **Developers → Logs**, with request and response
bodies (secrets redacted), status, duration, IP and idempotency key.

**Dashboard sessions.** The dashboard calls `/v1` with a session cookie plus `X-Account` and `X-Mode` headers and
the member's role decides what is allowed. Integrations should always use keys.

### Restricted key scopes

A restricted key grants `read` or `write` per resource; `write` includes `read`. A request outside its scopes
fails with `403 permission_error`, code `scope_missing`.

| Resource | Read covers | Write covers |
|---|---|---|
| `payment_intents` | Intents, attempts, timelines, **reviews list** | Create, update, cancel, create attempts, simulate |
| `refunds` | Refunds | Create, cancel, mark sent, **resolve reviews** |
| `customers` | Customers | Create, update, delete |
| `products` | Products | Create, update |
| `prices` | Prices | Create, update |
| `payment_links` | Payment links | Create, update |
| `invoices` | Invoices | Create, finalize, void, mark uncollectible |
| `subscriptions` | Subscriptions | Create, cancel |
| `balance` | Balance, balance transactions, CSV reports, analytics | (read only) |
| `payouts` | Payouts, payout destinations | Request, cancel, revoke a destination |
| `events` | Events | — |
| `webhook_endpoints` | Endpoints, deliveries | Create, update, roll secret, delete, test, retry |

`GET /v1/assets` needs no scope: any key can call it.

### Publishable keys

A publishable key is everything an embedded or custom checkout needs:

```bash
# Read one intent (client_secret is returned to the server that created the intent)
curl "https://paylink.useclaudia.xyz/v1/payment_intents/pi_...?client_secret=secret_..." \
  -H "Authorization: Bearer pk_test_..."

# Choose how to pay it
curl https://paylink.useclaudia.xyz/v1/payment_intents/pi_.../attempts \
  -H "Authorization: Bearer pk_test_..." -H "Content-Type: application/json" \
  -d '{"asset":"usdc.base","client_secret":"secret_..."}'
```

Without the right `client_secret` both fail with `client_secret_required`. Treat `client_secret` as private to
the customer's session: it lets its holder drive that one intent. Do not log it.

---

## Conventions

- **Ids** are prefixed by type: `pi_` payment intent, `pa_` attempt, `re_` refund, `cus_` customer, `prod_`
  product, `price_` price, `plink_` payment link, `in_` invoice, `sub_` subscription, `txn_` balance transaction,
  `po_` payout, `wd_` payout destination, `rev_` review, `evt_` event, `we_` webhook endpoint, `whd_` webhook
  delivery, `req_` request.
- **Money** is a decimal string, never a float. Fiat amounts are in major units (`"19.99"`, at most 6 decimal
  places); crypto amounts are in whole tokens (`"19.99"` USDC). Numbers are accepted on input and converted.
- **Timestamps** are Unix seconds, `null` until reached.
- **Assets** are `symbol.network`, for example `usdc.base`, `usdt.ethereum`, `usdc.solana`. `GET /v1/assets` lists
  the ones your account accepts.
- **Currencies** for fiat amounts: USD (default), EUR, GBP, CAD, AUD, JPY, CHF, SGD, HKD, INR, BRL, MXN, NGN, ZAR,
  AED, KES. Stablecoins quote 1:1 against USD; other currencies convert at a current exchange rate.
- **Metadata** is a map of up to 40 string keys (max 40 characters) to string values (max 500 characters). On
  update it is merged into the existing map.
- Every object carries `object` and `livemode`.
- Every response carries a `Request-Id` header (also `request_id` in error bodies). Quote it to support.

## Idempotency

Send an `Idempotency-Key` header (up to 255 characters) on any `POST` to make it safe to retry. Keys are scoped to
your account and mode and kept for 24 hours. `GET`, `PATCH` and `DELETE` ignore the header.

```bash
curl https://paylink.useclaudia.xyz/v1/refunds \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: refund_order_1042" \
  -d '{"payment_intent":"pi_..."}'
```

The first request records a fingerprint of method, path and JSON body (object keys sorted, so key order does not
matter; values do: `"48.00"` and `"48"` are different requests).

| Situation | Result |
|---|---|
| Same fingerprint, first request finished | The stored status and body are returned, with `Idempotent-Replayed: true`. Nothing runs again. |
| Same fingerprint, first request still running | `409 idempotency_error`, code `request_in_progress`. Retry shortly. |
| Different method, path or body | `422 idempotency_error`, code `idempotency_key_reused`. Use a new key for a new request. |
| First request failed with a 5xx | The key is released, so the retry runs for real. |
| First request failed with a 4xx | The error is stored and replayed. Fix the request and use a new key. |
| Key longer than 255 characters | `400 idempotency_error`, code `key_too_long`. |

## Versioning

Every `/v1` response carries a `Paylink-Version` header naming the version that produced it:

```http
Paylink-Version: 2026-09-01
```

Events record the version they were generated under in `api_version`. Today there is one version and requests
cannot pin an older one; the header is informational. Additive changes (new endpoints, optional parameters,
fields, event types, error codes, review reasons) ship without a new version, so write clients that ignore what
they do not know.

## Pagination

List endpoints return newest first, one page at a time:

| Query parameter | Meaning |
|---|---|
| `limit` | 1 to 100. Default 20. |
| `starting_after` | The `id` of the last object you received. The next page starts after it. An id not in the list is `400 cursor_invalid`. |

```json
{
  "object": "list",
  "data": [ { "id": "pi_3HnV8sKq2LmZ9xWc4TbR7yPe", "object": "payment_intent" } ],
  "has_more": true,
  "url": "/v1/payment_intents"
}
```

When `has_more` is `true`, request again with `starting_after` set to the last id in `data`. A few short lists
(a payment's attempts, timelines, payout destinations, webhook endpoints, accepted assets) return everything with
`has_more: false`.

Filters: `status` takes a comma-separated list where offered. `created[gte]` and `created[lte]` (Unix seconds)
filter payment intents, balance transactions and events.

## Errors

Any non-`2xx` response has this body:

```json
{
  "error": {
    "type": "invalid_request_error",
    "code": "amount_invalid",
    "message": "Amount must be a positive decimal, e.g. \"19.99\".",
    "param": "amount",
    "request_id": "req_9f2c1a7b3e5d4c6a8b0e"
  }
}
```

- `type`: whose problem it is. Branch on this.
- `code`: the specific, stable reason. Safe to branch on.
- `message`: a sentence you can show a person. It may change; do not parse it.
- `param`: the field at fault, when there is one.
- `detail`: extra structured context, on some errors.
- `request_id`: the same as the `Request-Id` header.

| `type` | HTTP | Meaning |
|---|---|---|
| `invalid_request_error` | 400 | The request is wrong: a missing or malformed parameter. Fix and resend. |
| `authentication_error` | 401 | No key, or one that is invalid, revoked or expired. |
| `permission_error` | 403 | Authenticated but not allowed: missing scope, IP not allowed, publishable key, dashboard-only action, live-only or test-only action. |
| `not_found_error` | 404 | No such object in this account and mode, or no such route. |
| `idempotency_error` | 409 (422 for `idempotency_key_reused`, 400 for `key_too_long`) | An `Idempotency-Key` problem. |
| `conflict_error` | 409 | The object's state forbids this, e.g. canceling a payment with funds arriving. |
| `rate_limit_error` | 429 | Too many requests. Back off and retry. |
| `risk_error` | 403 | Blocked by a compliance or risk control: sanctioned address, account limit, verification required. |
| `chain_error` | 503 | A blockchain dependency failed, such as an unreachable network. Usually retryable. |
| `pricing_error` | 503 | No trustworthy price right now, or a stablecoin has depegged. Retry shortly or use another asset. |
| `api_error` | 500 | Something failed on our side. |

Common codes:

| Code | Type | When |
|---|---|---|
| `parameter_invalid` | invalid_request_error | A field failed validation; `param` names it. |
| `body_invalid` / `body_too_large` | invalid_request_error | Body is not JSON (400) / over 400 KB (413). |
| `api_key_invalid` / `api_key_expired` | authentication_error | Unknown or revoked key / expired key. |
| `scope_missing` | permission_error | Restricted key lacks the scope. |
| `publishable_key` / `client_secret_required` | permission_error | Publishable key on a secret-only route / without the intent's secret. |
| `ip_not_allowed` | permission_error | Request IP is not on the key's allowlist. |
| `dashboard_only` | permission_error | People-only action (payout approvals, adding destinations). |
| `livemode_forbidden` | permission_error | Simulation with a live key. |
| `resource_missing` / `route_not_found` | not_found_error | No such object / route. |
| `cursor_invalid` | invalid_request_error | `starting_after` is not in the list. |
| `amount_invalid`, `amount_too_large`, `amount_below_minimum` | invalid_request_error | Bad amount, or below an asset's minimum. |
| `currency_unsupported`, `asset_unknown`, `assets_not_accepted` | invalid_request_error | Unknown currency or asset, or none of `allowed_assets` is enabled. |
| `no_assets_accepted` | conflict_error | The account accepts no assets yet. |
| `live_payments_not_configured` | conflict_error (503) | Live attempt before a settlement key exists (platform custody key, or your xpub in direct mode). |
| `funds_arriving` / `payment_in_progress` | conflict_error | Cannot cancel / switch asset once funds were seen. |
| `amount_over_limit`, `daily_limit_reached`, `account_inactive` | risk_error | Live limits. |
| `address_sanctioned`, `verification_required` | risk_error | Screening / verification gates. |
| `nothing_to_refund`, `already_refunded` | conflict_error | Refund not possible. |
| `destination_cooling_down`, `destination_unusable`, `network_mismatch`, `balance_insufficient`, `direct_settlement` | various | Payout not possible. |
| `review_closed`, `action_invalid` | conflict / invalid | Review already closed, or the action is not allowed for its reason. |
| `url_invalid` | invalid_request_error | Webhook URL not public https. |
| `price_unavailable`, `stablecoin_depegged`, `price_sources_disagree` | pricing_error | No trustworthy quote right now. |
| `network_unreachable` | chain_error | A chain's RPC is down. |
| `rate_limited` | rate_limit_error | Rate limit exceeded. |

**Retrying:** do not retry a `4xx` unchanged. Retry `429`, `500` and `503` with exponential backoff, sending the
same `Idempotency-Key`. A network timeout on a write: retry with the same key.

## Rate limits

| Surface | Limit | Keyed by |
|---|---|---|
| `/v1` and `/mcp` | 50 requests per second | API key (or signed-in user) |
| `/api/public` (hosted pages) | 120 requests per minute | IP |
| `/api/auth` (sign-in) | 60 requests per 15 minutes | IP |
| `/api/agent` (Paylink chat) | 20 messages per minute | Signed-in user |

Responses carry the standard `RateLimit` and `RateLimit-Policy` headers (IETF draft 7). Beyond the limit you get
`429 rate_limit_error`, code `rate_limited`.

---

# Endpoints

Each endpoint lists the restricted-key scope it needs. Secret keys can call everything except the people-only
actions. Example ids are illustrative.

## Payment intents

What a customer owes you, in fiat, and the attempts they make to pay it.

**Statuses:** `requires_payment` → `processing` (enough seen on chain, not final) → `succeeded` (final and
booked). Also `partially_paid`, `requires_review`, `expired`, `canceled`. **Fulfil on `succeeded`.**

**The payment intent object**

```json
{
  "id": "pi_3HnV8sKq2LmZ9xWc4TbR7yPe",
  "object": "payment_intent",
  "amount": "48.00",
  "currency": "USD",
  "status": "requires_payment",
  "description": "Order 1042",
  "customer": null,
  "customer_email": "ada@example.com",
  "customer_name": null,
  "metadata": { "order_id": "1042" },
  "line_items": null,
  "allowed_assets": ["usdc.base", "usdc.arbitrum"],
  "client_secret": "secret_q7Zr2mK9xWb4TcLp0YvHs3Dn",
  "hosted_url": "https://paylink.useclaudia.xyz/pay/pi_3HnV8sKq2LmZ9xWc4TbR7yPe",
  "success_url": "https://shop.example.com/thanks",
  "cancel_url": null,
  "source": "api",
  "invoice": null,
  "payment_link": null,
  "subscription": null,
  "amount_received_usd": null,
  "amount_refunded": "0",
  "review_reason": null,
  "cancellation_reason": null,
  "latest_attempt": null,
  "expires_at": 1790326007,
  "succeeded_at": null,
  "canceled_at": null,
  "created": 1790239607,
  "livemode": false
}
```

`source` is one of `api`, `link`, `invoice`, `terminal`, `subscription`, `dashboard`. `client_secret` is returned
on creation and to secret and publishable keys; restricted keys and list responses get `null`.

### Create a payment intent

`POST /v1/payment_intents` · scope `payment_intents: write` · emits `payment_intent.created`

| Field | Type | Description |
|---|---|---|
| `amount` **required** | decimal string | Amount owed in major units of `currency`. Positive, at most 6 decimals. |
| `currency` | string | Three-letter code from the supported list. Default `USD`. |
| `description` | string | Shown to the customer. Up to 500 characters. |
| `customer` | string | An existing customer id (`cus_…`). |
| `customer_email` | string | Payer's email if you have no customer object. |
| `customer_name` | string | Up to 120 characters. |
| `metadata` | map | See conventions. |
| `allowed_assets` | string[] | Up to 50 asset codes. Restricts the checkout to these; empty means every accepted asset. |
| `success_url` | url | Where the checkout sends the customer after paying. |
| `cancel_url` | url | Where the checkout sends a customer who backs out. |
| `expires_in` | integer | Seconds until the intent expires: 300 to 2,592,000. Default 86,400 (24 hours). |

Live intents are checked against your account limits at creation (`amount_over_limit`, `daily_limit_reached`).

```bash
curl https://paylink.useclaudia.xyz/v1/payment_intents \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: order_1042" \
  -d '{"amount":"48.00","currency":"USD","description":"Order 1042","metadata":{"order_id":"1042"},
       "success_url":"https://shop.example.com/thanks"}'
```

Response `201 Created`: the payment intent object above.

### List payment intents

`GET /v1/payment_intents` · scope `payment_intents: read`

| Query | Description |
|---|---|
| `limit`, `starting_after` | Pagination. |
| `status` | Comma-separated, e.g. `succeeded,requires_review`. |
| `customer` | Only this customer's payments. |
| `q` | Search ids, descriptions, emails, receiving and payer addresses, transaction hashes. Up to 100 characters. |
| `created[gte]`, `created[lte]` | Unix seconds. |

```bash
curl "https://paylink.useclaudia.xyz/v1/payment_intents?status=succeeded&limit=3" \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

Response: a list of payment intents.

### Retrieve a payment intent

`GET /v1/payment_intents/:id` · scope `payment_intents: read` (or a publishable key with `?client_secret=`)

Includes `latest_attempt`.

```bash
curl https://paylink.useclaudia.xyz/v1/payment_intents/pi_3HnV8sKq2LmZ9xWc4TbR7yPe \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

```json
{
  "id": "pi_3HnV8sKq2LmZ9xWc4TbR7yPe",
  "object": "payment_intent",
  "status": "processing",
  "amount": "48.00",
  "currency": "USD",
  "latest_attempt": {
    "id": "pa_4kTq9WmZ2rXb7NcLp0YvHs3D",
    "object": "payment_attempt",
    "payment_intent": "pi_3HnV8sKq2LmZ9xWc4TbR7yPe",
    "status": "processing",
    "asset": "usdc.base",
    "symbol": "USDC",
    "network": "base",
    "network_name": "Base",
    "chain_id": 8453,
    "address": "0x4f1c2b8e0d7a9c3f5e6b1a2d8c7e9f0a3b5da92e",
    "amount_expected": "48.00",
    "amount_seen": "48.00",
    "amount_confirmed": "0",
    "amount_settled": "0",
    "confirmations_required": 60,
    "finality": "about 2 minutes",
    "currency": "USD",
    "rate": "1",
    "usd_rate": "1",
    "rate_source": "par",
    "tx_hash": "0x8e2d…b41c",
    "explorer_url": "https://basescan.org/tx/0x8e2d…b41c",
    "address_url": "https://basescan.org/address/0x4f1c…a92e",
    "payer": "0x2b7e0c9d4a1f6e3b8c5d7a0f9e2c4b6d8a1f3e5c",
    "late": false,
    "overpaid_amount": "0",
    "payment_uri": "ethereum:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913@8453/transfer?address=0x4f1c…a92e&uint256=48000000",
    "token_contract": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "decimals": 6,
    "settlement_mode": "custodial",
    "expires_at": 1790241407,
    "detected_at": 1790239702,
    "confirmed_at": null,
    "created": 1790239647,
    "livemode": true
  },
  "…": "other payment intent fields"
}
```

Attempt statuses: `awaiting_payment`, `processing`, `partially_paid`, `paid`, `expired`, `superseded`,
`canceled`. `payment_uri` is an EIP-681 URI for wallets and QR codes; it is `null` in test mode.

### Update a payment intent

`PATCH /v1/payment_intents/:id` · scope `payment_intents: write`

Changes the description or merges metadata. Amounts and currencies never change after creation.

| Field | Type | Description |
|---|---|---|
| `description` | string | Up to 500 characters. |
| `metadata` | map | Merged into the existing metadata. |

```bash
curl -X PATCH https://paylink.useclaudia.xyz/v1/payment_intents/pi_3HnV8sKq2LmZ9xWc4TbR7yPe \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"metadata":{"shipment":"DHL-448120"}}'
```

Response: the updated payment intent.

### Cancel a payment intent

`POST /v1/payment_intents/:id/cancel` · scope `payment_intents: write` · emits `payment_intent.canceled`

Only while nothing has been seen on chain; otherwise `409 funds_arriving`. Open attempts stay watched, so a
customer mid-send is never lost.

| Field | Type | Description |
|---|---|---|
| `reason` | string | Up to 200 characters. Stored as `cancellation_reason`. |

```bash
curl https://paylink.useclaudia.xyz/v1/payment_intents/pi_3HnV8sKq2LmZ9xWc4TbR7yPe/cancel \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"reason":"Customer changed their mind"}'
```

```json
{ "id": "pi_3HnV8sKq2LmZ9xWc4TbR7yPe", "object": "payment_intent", "status": "canceled",
  "cancellation_reason": "Customer changed their mind", "canceled_at": 1790239667, "…": "…" }
```

### List attempts

`GET /v1/payment_intents/:id/attempts` · scope `payment_intents: read`

Every attempt on the intent, newest first. Not paginated.

```bash
curl https://paylink.useclaudia.xyz/v1/payment_intents/pi_3HnV8sKq2LmZ9xWc4TbR7yPe/attempts \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

Response: `{ "object": "list", "data": [ <payment_attempt>, … ], "has_more": false, "url": "…" }`.

### Create an attempt

`POST /v1/payment_intents/:id/attempts` · scope `payment_intents: write` (or a publishable key with
`client_secret`) · emits `payment_attempt.created`

Quotes the intent in one asset and issues a fresh address, for building your own checkout. Returns `201` for a new
attempt, or `200` with the open attempt for that asset when it is reused. Choosing a different asset supersedes
an attempt that is still waiting. Fails with `409 payment_in_progress` if funds are already arriving in another
asset, and `amount_below_minimum` if the quote is below the asset's minimum.

| Field | Type | Description |
|---|---|---|
| `asset` **required** | string | Asset code, e.g. `usdc.base`. |
| `client_secret` | string | Required with a publishable key. |

```bash
curl https://paylink.useclaudia.xyz/v1/payment_intents/pi_3HnV8sKq2LmZ9xWc4TbR7yPe/attempts \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"asset":"usdc.base"}'
```

Response `201 Created`: a payment attempt with `status: "awaiting_payment"`, `address`, `amount_expected`,
`payment_uri` and `expires_at` (the end of the quote window).

### Simulate a payment (test mode)

`POST /v1/payment_intents/:id/simulate` · scope `payment_intents: write` · **test mode only**

See [Test mode and simulation](#test-mode-and-simulation).

### Payment timeline

`GET /v1/payment_intents/:id/timeline` · scope `payment_intents: read`

A human-readable history, oldest first: events on the intent and its refunds and reviews, plus reorgs seen by
settlement.

```bash
curl https://paylink.useclaudia.xyz/v1/payment_intents/pi_3HnV8sKq2LmZ9xWc4TbR7yPe/timeline \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

```json
{
  "object": "list",
  "data": [
    { "at": 1790239607, "kind": "payment_intent.created", "title": "Payment created" },
    { "at": 1790239647, "kind": "payment_attempt.created", "title": "Customer chose how to pay", "detail": "48.00 USDC on Base" },
    { "at": 1790239702, "kind": "payment_intent.processing", "title": "Funds seen on chain; waiting for finality" },
    { "at": 1790239828, "kind": "payment_intent.succeeded", "title": "Payment succeeded" }
  ],
  "has_more": false,
  "url": "/v1/payment_intents/pi_3HnV8sKq2LmZ9xWc4TbR7yPe/timeline"
}
```

---

## Refunds

Returning settled funds, in the payment's own asset and network.

**Statuses:** `requires_destination` (waiting for the customer to supply an address through the claim link),
`pending`, `in_batch`, `processing`, `succeeded`, `failed`, `canceled`.

```json
{
  "id": "re_5TxW2nLq8KbZ4mRc7YvP1sHd",
  "object": "refund",
  "payment_intent": "pi_3HnV8sKq2LmZ9xWc4TbR7yPe",
  "status": "pending",
  "amount": "12",
  "amount_fiat": "12.00",
  "currency": "USD",
  "asset": "usdc.base",
  "network": "base",
  "destination": "0x2b7e0c9d4a1f6e3b8c5d7a0f9e2c4b6d8a1f3e5c",
  "reason": "One bag arrived damaged",
  "tx_hash": null,
  "explorer_url": null,
  "failure_reason": null,
  "succeeded_at": null,
  "created": 1790239607,
  "livemode": false
}
```

### Create a refund

`POST /v1/refunds` · scope `refunds: write` · emits `refund.created`

Refunds a succeeded payment, one in review, or one canceled after review. If no clean payer address is known, the
refund starts `requires_destination` and the response (and only the response, plus the `refund.created` event)
includes `claim_url`. Custodial refunds are reserved from your available balance at once. The platform fee is not
returned.

| Field | Type | Description |
|---|---|---|
| `payment_intent` **required** | string | The payment to refund. |
| `amount` | decimal string | In the intent's currency, converted at the original quote rate. Default: everything still refundable. |
| `reason` | string | Up to 300 characters. |

```bash
curl https://paylink.useclaudia.xyz/v1/refunds \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: refund_order_1042" \
  -d '{"payment_intent":"pi_3HnV8sKq2LmZ9xWc4TbR7yPe","amount":"12.00","reason":"One bag arrived damaged"}'
```

Response `201 Created`: the refund. When a claim is needed:
`"status": "requires_destination", "destination": null, "claim_url": "https://paylink.useclaudia.xyz/refund/rclm_…"`.

### List refunds

`GET /v1/refunds` · scope `refunds: read`

| Query | Description |
|---|---|
| `limit`, `starting_after` | Pagination. |
| `payment_intent` | Only refunds of this payment. |
| `status` | Comma-separated statuses. |

```bash
curl "https://paylink.useclaudia.xyz/v1/refunds?payment_intent=pi_3HnV8sKq2LmZ9xWc4TbR7yPe" \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

### Retrieve a refund

`GET /v1/refunds/:id` · scope `refunds: read`

```bash
curl https://paylink.useclaudia.xyz/v1/refunds/re_5TxW2nLq8KbZ4mRc7YvP1sHd -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

### Cancel a refund

`POST /v1/refunds/:id/cancel` · scope `refunds: write` · emits `refund.updated`

Only while `requires_destination` or `pending`. Reserved funds return to your balance.

```bash
curl -X POST https://paylink.useclaudia.xyz/v1/refunds/re_5TxW2nLq8KbZ4mRc7YvP1sHd/cancel \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

Response: the refund with `"status": "canceled"`.

### Report a refund you sent (direct settlement)

`POST /v1/refunds/:id/mark_sent` · scope `refunds: write` · emits `refund.succeeded`

For payments that settled directly to your wallet: you send the refund yourself and report the transaction. The
refund must be `pending` and the payment direct-settled (`custodial_refund` otherwise). Live refunds are checked
on chain: the transaction must send at least the refund amount of the right token to the refund's destination
(`refund_not_found_on_chain` otherwise).

| Field | Type | Description |
|---|---|---|
| `tx_hash` **required** | string | `0x`-prefixed 32-byte transaction hash. |

```bash
curl https://paylink.useclaudia.xyz/v1/refunds/re_5TxW2nLq8KbZ4mRc7YvP1sHd/mark_sent \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"tx_hash":"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'
```

Response: the refund with `"status": "succeeded"`.

---

## Customers

The people who pay you. Payments with an email or a known wallet are linked to a customer automatically.

```json
{
  "id": "cus_2PmZ8rKq4XbN7sLwT1cYvD3e",
  "object": "customer",
  "email": "ada@example.com",
  "name": "Ada Lovelace",
  "description": null,
  "wallets": ["0x2b7e0c9d4a1f6e3b8c5d7a0f9e2c4b6d8a1f3e5c"],
  "metadata": {},
  "total_spent_usd": "96.00",
  "payments_count": 2,
  "last_payment_at": 1790239607,
  "created": 1787647607,
  "livemode": false
}
```

### Create a customer

`POST /v1/customers` · scope `customers: write` · emits `customer.created`

| Field | Type | Description |
|---|---|---|
| `email` | string | Stored lowercased. |
| `name` | string | Up to 120 characters. |
| `description` | string | Up to 500 characters. |
| `metadata` | map | |

```bash
curl https://paylink.useclaudia.xyz/v1/customers \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"email":"ada@example.com","name":"Ada Lovelace"}'
```

Response `201 Created`: the customer.

### List customers

`GET /v1/customers` · scope `customers: read`

Deleted customers are excluded.

| Query | Description |
|---|---|
| `limit`, `starting_after` | Pagination. |
| `email` | Exact email match. |
| `q` | Search email, name, id and wallets. |

```bash
curl "https://paylink.useclaudia.xyz/v1/customers?q=ada" -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

### Retrieve a customer

`GET /v1/customers/:id` · scope `customers: read`

```bash
curl https://paylink.useclaudia.xyz/v1/customers/cus_2PmZ8rKq4XbN7sLwT1cYvD3e -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

### Update a customer

`POST /v1/customers/:id` · scope `customers: write` · emits `customer.updated`

Only the fields you send change. Send `null` (or `""` for email) to clear a field. Metadata is merged.

| Field | Type |
|---|---|
| `email` | string, `""` or `null` |
| `name` | string or `null` |
| `description` | string or `null` |
| `metadata` | map |

```bash
curl https://paylink.useclaudia.xyz/v1/customers/cus_2PmZ8rKq4XbN7sLwT1cYvD3e \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Ada King"}'
```

### Delete a customer

`DELETE /v1/customers/:id` · scope `customers: write`

Erases the email, name, description and metadata. Payments made by the customer are kept.

```bash
curl -X DELETE https://paylink.useclaudia.xyz/v1/customers/cus_2PmZ8rKq4XbN7sLwT1cYvD3e \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

```json
{ "id": "cus_2PmZ8rKq4XbN7sLwT1cYvD3e", "object": "customer", "deleted": true }
```

---

## Products

A catalog for payment links, invoices and subscriptions. A product has any number of prices.

```json
{
  "id": "prod_6KqX2mZr9TbN4sLwP1cYvH8e",
  "object": "product",
  "name": "Coffee subscription",
  "description": "250 g of this month's roast",
  "image": null,
  "active": true,
  "metadata": {},
  "default_price": {
    "id": "price_8NcL0pYvHs3D4kTq9WmZ2rXb",
    "object": "price",
    "product": "prod_6KqX2mZr9TbN4sLwP1cYvH8e",
    "nickname": "Monthly",
    "unit_amount": "12.00",
    "currency": "USD",
    "type": "recurring",
    "recurring": { "interval": "month", "interval_count": 1 },
    "active": true,
    "created": 1790239607,
    "livemode": false
  },
  "created": 1790239607,
  "livemode": false
}
```

`default_price` is the product's newest active price.

### Create a product

`POST /v1/products` · scope `products: write`

| Field | Type | Description |
|---|---|---|
| `name` **required** | string | 1 to 200 characters. |
| `description` | string | Up to 2,000 characters. |
| `image` | string | Image URL or data URL. |
| `metadata` | map | |
| `default_price.unit_amount` | decimal string | Creates the first price with this amount. |
| `default_price.currency` | string | Default `USD`. |
| `default_price.nickname` | string | Up to 80 characters. |
| `default_price.recurring.interval` | enum | `day`, `week`, `month` or `year`. Makes the price recurring. |
| `default_price.recurring.interval_count` | integer | 1 to 12. Default 1. |

```bash
curl https://paylink.useclaudia.xyz/v1/products \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Coffee subscription","description":"250 g of this month'\''s roast",
       "default_price":{"unit_amount":"12.00","recurring":{"interval":"month"}}}'
```

Response `201 Created`: the product.

### List products

`GET /v1/products` · scope `products: read`

| Query | Description |
|---|---|
| `limit`, `starting_after` | Pagination. |
| `active` | `true` or `false`. |

```bash
curl "https://paylink.useclaudia.xyz/v1/products?active=true" -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

### Retrieve a product

`GET /v1/products/:id` · scope `products: read`

```bash
curl https://paylink.useclaudia.xyz/v1/products/prod_6KqX2mZr9TbN4sLwP1cYvH8e -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

### Update a product

`POST /v1/products/:id` · scope `products: write`

Only the fields you send change: `name`, `description`, `image`, `active` (archive or restore), `metadata`
(merged).

```bash
curl https://paylink.useclaudia.xyz/v1/products/prod_6KqX2mZr9TbN4sLwP1cYvH8e \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"active":false}'
```

---

## Prices

Prices are immutable apart from `nickname` and `active`: create a new price to change an amount. A recurring price
drives a subscription.

### Create a price

`POST /v1/prices` · scope `prices: write`

| Field | Type | Description |
|---|---|---|
| `product` **required** | string | The product (`prod_…`). |
| `unit_amount` **required** | decimal string | Amount per unit. |
| `currency` | string | Default `USD`. |
| `nickname` | string | Up to 80 characters. |
| `recurring.interval` | enum | `day`, `week`, `month` or `year`. |
| `recurring.interval_count` | integer | 1 to 12. Default 1. |

```bash
curl https://paylink.useclaudia.xyz/v1/prices \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"product":"prod_6KqX2mZr9TbN4sLwP1cYvH8e","unit_amount":"120.00","nickname":"Yearly","recurring":{"interval":"year"}}'
```

Response `201 Created`: the price object (see `default_price` above).

### List prices

`GET /v1/prices` · scope `prices: read`

| Query | Description |
|---|---|
| `limit`, `starting_after` | Pagination. |
| `product` | Only this product's prices. |

```bash
curl "https://paylink.useclaudia.xyz/v1/prices?product=prod_6KqX2mZr9TbN4sLwP1cYvH8e" -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

### Update a price

`POST /v1/prices/:id` · scope `prices: write`

| Field | Type | Description |
|---|---|---|
| `active` | boolean | Archive or restore. |
| `nickname` | string | Up to 80 characters. |

```bash
curl https://paylink.useclaudia.xyz/v1/prices/price_8NcL0pYvHs3D4kTq9WmZ2rXb \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"active":false}'
```

---

## Payment links

Reusable checkouts at a short URL. Each customer who proceeds to pay gets their own payment intent
(`source: "link"`, valid for two hours).

```json
{
  "id": "plink_4sLwT1cYpD8e7QvK2mZr9XbN",
  "object": "payment_link",
  "url": "https://paylink.useclaudia.xyz/l/k7Qm2xZr9TbN",
  "title": "Support the newsletter",
  "description": null,
  "amount_type": "custom",
  "amount": null,
  "min_amount": "2",
  "max_amount": null,
  "presets": ["5", "10", "25"],
  "items": null,
  "currency": "USD",
  "allowed_assets": [],
  "collect_email": true,
  "collect_name": false,
  "success_url": null,
  "max_completions": null,
  "completions": 0,
  "expires_at": null,
  "active": true,
  "metadata": {},
  "created": 1790239607,
  "livemode": false
}
```

### Create a payment link

`POST /v1/payment_links` · scope `payment_links: write`

| Field | Type | Description |
|---|---|---|
| `title` **required** | string | 1 to 120 characters. |
| `description` | string | Up to 600 characters. |
| `amount_type` | enum | `fixed` (default), `items` or `custom`. |
| `amount` | decimal string | Required for `fixed`. |
| `min_amount`, `max_amount` | decimal string | Bounds for `custom`. |
| `presets` | decimal string[] | Up to 6 suggested amounts for `custom`. |
| `items` | object[] | For `items`: up to 20 of `{ price, quantity, adjustable }`. `quantity` 1 to 999, default 1. All prices must be active and share a currency. |
| `currency` | string | Default `USD`. |
| `allowed_assets` | string[] | Limit the coins offered. |
| `collect_email`, `collect_name` | boolean | Ask the customer before paying. |
| `success_url` | url | Where to send the customer after paying. |
| `max_completions` | integer | Stop after this many successful payments. |
| `expires_at` | unix seconds | Stop accepting payments after this time. |
| `metadata` | map | Copied onto each payment made through the link. |

```bash
curl https://paylink.useclaudia.xyz/v1/payment_links \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"title":"Support the newsletter","amount_type":"custom","min_amount":"2","presets":["5","10","25"],"collect_email":true}'
```

Response `201 Created`: the payment link.

### List payment links

`GET /v1/payment_links` · scope `payment_links: read`

| Query | Description |
|---|---|
| `limit`, `starting_after` | Pagination. |
| `active` | `true` or `false`. |

```bash
curl "https://paylink.useclaudia.xyz/v1/payment_links?active=true" -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

### Retrieve a payment link

`GET /v1/payment_links/:id` · scope `payment_links: read`

```bash
curl https://paylink.useclaudia.xyz/v1/payment_links/plink_4sLwT1cYpD8e7QvK2mZr9XbN -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

### Update a payment link

`POST /v1/payment_links/:id` · scope `payment_links: write`

| Field | Type | Description |
|---|---|---|
| `active` | boolean | `false` stops new payments. |
| `title` | string | 1 to 120 characters. |
| `description` | string | Up to 600 characters. |
| `metadata` | map | Merged. |

```bash
curl https://paylink.useclaudia.xyz/v1/payment_links/plink_4sLwT1cYpD8e7QvK2mZr9XbN \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"active":false}'
```

---

## Invoices

Numbered bills with a hosted payment page and reminders. **Statuses:** `draft`, `open`, `paid`, `void`,
`uncollectible`.

```json
{
  "id": "in_9WmZ2rXb7NcL4kTq0pYvHs3D",
  "object": "invoice",
  "number": "NORTHW-00042",
  "status": "open",
  "hosted_url": "https://paylink.useclaudia.xyz/i/p4Xr8mKq2ZbN",
  "customer": "cus_2PmZ8rKq4XbN7sLwT1cYvD3e",
  "customer_name": "Ada Lovelace",
  "customer_email": "ada@example.com",
  "customer_address": null,
  "currency": "USD",
  "subtotal": "120.00",
  "tax_rate": "0",
  "tax": "0.00",
  "total": "120.00",
  "lines": [
    { "description": "Wholesale beans, 5 kg", "quantity": "1", "unit_amount": "120.00", "amount": "120.00", "price": null }
  ],
  "memo": null,
  "footer": null,
  "payment_intent": "pi_3HnV8sKq2LmZ9xWc4TbR7yPe",
  "subscription": null,
  "period_start": null,
  "period_end": null,
  "due_at": 1791449207,
  "finalized_at": 1790239607,
  "paid_at": null,
  "voided_at": null,
  "created": 1790239607,
  "livemode": false
}
```

### Create an invoice

`POST /v1/invoices` · scope `invoices: write`

Creates a draft, or a finalized invoice with `finalize: true` (emits `invoice.finalized`).

| Field | Type | Description |
|---|---|---|
| `lines` **required** | object[] | 1 to 100 lines of `{ description, quantity, unit_amount }`, or `{ price, quantity }` to bill a catalog price. `description` up to 300 characters. |
| `customer` | string | An existing customer. |
| `customer_name` | string | Up to 120 characters. |
| `customer_email` | string | Billing email. |
| `customer_address` | string | Up to 500 characters. |
| `currency` | string | Default `USD`. |
| `tax_rate` | decimal string | Percentage applied to the subtotal, e.g. `"20"`. |
| `memo` | string | Up to 2,000 characters. |
| `footer` | string | Up to 1,000 characters. |
| `due_at` | unix seconds | Default: 14 days after finalizing. |
| `finalize` | boolean | Finalize immediately. Default `false`. |

```bash
curl https://paylink.useclaudia.xyz/v1/invoices \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"customer":"cus_2PmZ8rKq4XbN7sLwT1cYvD3e",
       "lines":[{"description":"Wholesale beans, 5 kg","quantity":"1","unit_amount":"120.00"}],"finalize":true}'
```

Response `201 Created`: the invoice.

### List invoices

`GET /v1/invoices` · scope `invoices: read`

| Query | Description |
|---|---|
| `limit`, `starting_after` | Pagination. |
| `status` | Comma-separated statuses. |
| `customer` | Only this customer's invoices. |
| `subscription` | Only invoices issued by this subscription. |

```bash
curl "https://paylink.useclaudia.xyz/v1/invoices?status=open" -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

### Retrieve an invoice

`GET /v1/invoices/:id` · scope `invoices: read`

```bash
curl https://paylink.useclaudia.xyz/v1/invoices/in_9WmZ2rXb7NcL4kTq0pYvHs3D -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

### Finalize an invoice

`POST /v1/invoices/:id/finalize` · scope `invoices: write` · emits `invoice.finalized`

Numbers a draft from your gapless sequence, creates its payment and opens the hosted page.

```bash
curl -X POST https://paylink.useclaudia.xyz/v1/invoices/in_9WmZ2rXb7NcL4kTq0pYvHs3D/finalize \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

### Void an invoice

`POST /v1/invoices/:id/void` · scope `invoices: write` · emits `invoice.voided`

For a draft, open or uncollectible invoice with no payment in progress. Cancels its open payment.

```bash
curl -X POST https://paylink.useclaudia.xyz/v1/invoices/in_9WmZ2rXb7NcL4kTq0pYvHs3D/void \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

### Mark an invoice uncollectible

`POST /v1/invoices/:id/mark_uncollectible` · scope `invoices: write`

Writes the invoice off. It can still be paid, and becomes `paid` if it is.

```bash
curl -X POST https://paylink.useclaudia.xyz/v1/invoices/in_9WmZ2rXb7NcL4kTq0pYvHs3D/mark_uncollectible \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

---

## Subscriptions

A schedule that issues and finalizes an invoice each period. **Statuses:** `active`, `past_due`, `paused`,
`canceled`.

```json
{
  "id": "sub_1cYpD8e7QvK2mZr9XbN4sLwT",
  "object": "subscription",
  "status": "active",
  "customer": "cus_2PmZ8rKq4XbN7sLwT1cYvD3e",
  "price": { "id": "price_8NcL0pYvHs3D4kTq9WmZ2rXb", "object": "price", "unit_amount": "12.00", "currency": "USD",
             "type": "recurring", "recurring": { "interval": "month", "interval_count": 1 }, "…": "…" },
  "quantity": 1,
  "days_until_due": 7,
  "current_period_start": 1790239607,
  "current_period_end": 1792831607,
  "cancel_at_period_end": false,
  "canceled_at": null,
  "latest_invoice": "in_9WmZ2rXb7NcL4kTq0pYvHs3D",
  "metadata": {},
  "created": 1790239607,
  "livemode": false
}
```

### Create a subscription

`POST /v1/subscriptions` · scope `subscriptions: write` · emits `subscription.created`

Starts now and issues the first invoice immediately.

| Field | Type | Description |
|---|---|---|
| `customer` **required** | string | The customer to bill. |
| `price` **required** | string | A recurring price. |
| `quantity` | integer | 1 to 10,000. Default 1. |
| `days_until_due` | integer | 0 to 60. Default 7. |
| `metadata` | map | |

```bash
curl https://paylink.useclaudia.xyz/v1/subscriptions \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"customer":"cus_2PmZ8rKq4XbN7sLwT1cYvD3e","price":"price_8NcL0pYvHs3D4kTq9WmZ2rXb"}'
```

Response `201 Created`: the subscription.

### List subscriptions

`GET /v1/subscriptions` · scope `subscriptions: read`

| Query | Description |
|---|---|
| `limit`, `starting_after` | Pagination. |
| `status` | Comma-separated: `active`, `past_due`, `paused`, `canceled`. |

```bash
curl "https://paylink.useclaudia.xyz/v1/subscriptions?status=active,past_due" -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

### Retrieve a subscription

`GET /v1/subscriptions/:id` · scope `subscriptions: read`

```bash
curl https://paylink.useclaudia.xyz/v1/subscriptions/sub_1cYpD8e7QvK2mZr9XbN4sLwT -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

### Cancel a subscription

`POST /v1/subscriptions/:id/cancel` · scope `subscriptions: write`

Cancels now (emits `subscription.canceled`), or at the end of the current period (emits `subscription.updated`
now, then cancels at renewal).

| Field | Type | Description |
|---|---|---|
| `at_period_end` | boolean | Default `false`. |

```bash
curl https://paylink.useclaudia.xyz/v1/subscriptions/sub_1cYpD8e7QvK2mZr9XbN4sLwT/cancel \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"at_period_end":true}'
```

---

## Balance

Your custodial balance, from the ledger. Pending funds come from the chain: seen but not yet final. With direct
settlement there is no platform balance and the lists are empty.

### Retrieve the balance

`GET /v1/balance` · scope `balance: read`

```bash
curl https://paylink.useclaudia.xyz/v1/balance -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

```json
{
  "object": "balance",
  "available": [{ "asset": "usdc.base", "symbol": "USDC", "network": "base", "amount": "1247.76", "amount_usd": "1247.76" }],
  "pending": [{ "asset": "usdc.arbitrum", "symbol": "USDC", "network": "arbitrum", "amount": "48", "amount_usd": "48.00" }],
  "reserved": [],
  "held": [],
  "totals_usd": { "available": "1247.76", "pending": "48.00", "reserved": "0", "held": "0" },
  "settlement_mode": "custodial",
  "livemode": false
}
```

`reserved` is set aside for payouts and refunds in progress; `held` is frozen while a compliance review is open.

### List balance transactions

`GET /v1/balance_transactions` · scope `balance: read`

Ledger movements with gross, fee and net, newest first. Amounts are signed from your point of view: money in
positive, money out negative.

| Query | Description |
|---|---|
| `limit`, `starting_after` | Pagination. |
| `type` | Comma-separated, e.g. `payment,payout,refund`. |
| `created[gte]`, `created[lte]` | Unix seconds. |

```bash
curl "https://paylink.useclaudia.xyz/v1/balance_transactions?type=payment&limit=10" -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

```json
{
  "object": "list",
  "data": [{
    "id": "txn_4kTq9WmZ2rXb7NcLp0YvHs3D",
    "object": "balance_transaction",
    "type": "payment",
    "amount": "48",
    "fee": "0.24",
    "net": "47.76",
    "asset": "usdc.base",
    "usd_rate": "1",
    "amount_usd": "48.00",
    "description": "Payment settled",
    "source": { "type": "payment_intent", "id": "pi_3HnV8sKq2LmZ9xWc4TbR7yPe" },
    "created": 1790239828,
    "livemode": false
  }],
  "has_more": true,
  "url": "/v1/balance_transactions"
}
```

---

## Payouts

Moving a custodial balance to your allowlisted wallets. **Statuses:** `pending_approval`, `approved`, `in_batch`,
`processing`, `paid`, `failed`, `canceled`.

```json
{
  "id": "po_7NcLp0YvHs3D4kTq9WmZ2rXb",
  "object": "payout",
  "status": "pending_approval",
  "amount": "1250",
  "amount_usd": "1250.00",
  "asset": "usdc.base",
  "network": "base",
  "destination": { "id": "wd_8LmQ2xVr7KcN3pZt9WbY4sHe", "address": "0x9c3f5e6b1a2d8c7e9f0a3b5d4f1c2b8e0d7a9c3f", "label": "Treasury Safe" },
  "method": "manual",
  "description": "Weekly sweep",
  "approvals_required": 2,
  "approvals": [],
  "requested_by": null,
  "tx_hash": null,
  "explorer_url": null,
  "failure_reason": null,
  "paid_at": null,
  "created": 1790239607,
  "livemode": false
}
```

### Request a payout

`POST /v1/payouts` · scope `payouts: write` · emits `payout.created`

Reserves the amount immediately. Starts `approved`, or `pending_approval` if it is at or above your approval
threshold. Fails with `direct_settlement` on a live direct-settlement account, `destination_cooling_down` if the
address is still cooling off, `network_mismatch` if the destination cannot receive on the asset's network, and
`verification_required` if the platform requires verification for live payouts.

| Field | Type | Description |
|---|---|---|
| `amount` **required** | decimal string | Crypto amount, in whole tokens. |
| `asset` **required** | string | Asset code, e.g. `usdc.base`. |
| `destination` **required** | string | An active payout destination (`wd_…`). |
| `description` | string | Up to 200 characters. |

```bash
curl https://paylink.useclaudia.xyz/v1/payouts \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: payout_2026_09_24" \
  -d '{"amount":"1250.00","asset":"usdc.base","destination":"wd_8LmQ2xVr7KcN3pZt9WbY4sHe","description":"Weekly sweep"}'
```

Response `201 Created`: the payout.

### List payouts

`GET /v1/payouts` · scope `payouts: read`

| Query | Description |
|---|---|
| `limit`, `starting_after` | Pagination. |
| `status` | Comma-separated statuses. |

```bash
curl "https://paylink.useclaudia.xyz/v1/payouts?status=pending_approval" -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

### Retrieve a payout

`GET /v1/payouts/:id` · scope `payouts: read`

With approvals and, once sent, the transaction.

```bash
curl https://paylink.useclaudia.xyz/v1/payouts/po_7NcLp0YvHs3D4kTq9WmZ2rXb -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

### Approve a payout

`POST /v1/payouts/:id/approve` · **dashboard session only**

Recorded against a person, who cannot be the requester (`self_approval`), with an optional `note` (up to 300
characters). API keys always receive `403 permission_error`, code `dashboard_only`. Emits `payout.approved` once
enough approvals are in.

### Reject a payout

`POST /v1/payouts/:id/reject` · **dashboard session only**

Cancels the payout and releases its funds. Optional `note`. API keys cannot call this.

### Cancel a payout

`POST /v1/payouts/:id/cancel` · scope `payouts: write` · emits `payout.canceled`

While `pending_approval` or `approved`. Releases the funds.

```bash
curl -X POST https://paylink.useclaudia.xyz/v1/payouts/po_7NcLp0YvHs3D4kTq9WmZ2rXb/cancel \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

---

## Payout destinations

Allowlisted wallets that payouts can go to. **Statuses:** `cooling_down`, `active`, `revoked`, `blocked`.

```json
{
  "id": "wd_8LmQ2xVr7KcN3pZt9WbY4sHe",
  "object": "payout_destination",
  "address": "0x9c3f5e6b1a2d8c7e9f0a3b5d4f1c2b8e0d7a9c3f",
  "label": "Treasury Safe",
  "networks": ["base", "arbitrum"],
  "status": "cooling_down",
  "active_from": 1790326007,
  "screening": "clear",
  "created": 1790239607
}
```

### List payout destinations

`GET /v1/payout_destinations` · scope `payouts: read`

All destinations, including revoked ones. Not paginated.

```bash
curl https://paylink.useclaudia.xyz/v1/payout_destinations -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

### Add a payout destination

`POST /v1/payout_destinations` · **dashboard only**: a person, with a fresh wallet signature

Not available to API keys (`dashboard_only`). Screens the address (a sanctioned address is refused with
`risk_error`) and starts its cooling-off period; your team is notified. Body: `address` (0x EVM address),
`networks` (network ids, e.g. `["base","arbitrum"]`), `label` (up to 80 characters, default `"Wallet"`).

### Revoke a payout destination

`DELETE /v1/payout_destinations/:id` · scope `payouts: write`

Takes effect immediately. The destination stays listed as `revoked`.

```bash
curl -X DELETE https://paylink.useclaudia.xyz/v1/payout_destinations/wd_8LmQ2xVr7KcN3pZt9WbY4sHe \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

---

## Reviews

Payments that need a decision. **Statuses:** `open`, `approved`, `refunded`, `dismissed`.

| `reason` | What happened | Allowed actions |
|---|---|---|
| `late_payment` | Paid in full after the quote expired, and your late-payment policy is "review". | `accept`, `refund` |
| `underpaid_expired` | Some funds arrived, less than owed, and the quote expired. | `accept`, `refund` |
| `overpaid` | More arrived than was owed, or the intent was paid twice. | `refund`, `dismiss` |
| `misdirected` | A stablecoin arrived at the payment address on a different network. | `accept`, `refund`, `dismiss` |
| `amount_limit` | Reserved for payments that run into an account limit. Defined in the schema; the current server does not open it. | `accept`, `refund` |
| `sanctioned_payer` | The payer is on a sanctions list. Funds are held. | Platform only |
| `manual` | Held by the platform, e.g. after a reorg deeper than the confirmation depth. | Platform only |

```json
{
  "id": "rev_3D4kTq9WmZ2rXb7NcLp0YvHs",
  "object": "review",
  "reason": "late_payment",
  "status": "open",
  "payment_intent": "pi_3HnV8sKq2LmZ9xWc4TbR7yPe",
  "platform_only": false,
  "detail": { "expired_at": "2026-09-24T08:30:00.000Z" },
  "note": null,
  "closed_at": null,
  "created": 1790239607,
  "livemode": false
}
```

### List reviews

`GET /v1/reviews` · scope `payment_intents: read`

| Query | Description |
|---|---|
| `limit`, `starting_after` | Pagination. |
| `status` | Comma-separated statuses, or `closed` for approved, refunded and dismissed together. |

```bash
curl "https://paylink.useclaudia.xyz/v1/reviews?status=open" -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

### Resolve a review

`POST /v1/reviews/:id/resolve` · scope `refunds: write` · emits `review.closed`

`accept` marks the payment succeeded. `refund` refunds what arrived and cancels the intent with
`cancellation_reason: "refunded_after_review"`. `dismiss` closes the review without changing the payment.
Platform-only reviews cannot be resolved by an account.

| Field | Type | Description |
|---|---|---|
| `action` **required** | enum | `accept`, `refund`, `dismiss` or `release` (see the table for which apply). |
| `note` | string | Up to 500 characters, kept on the review. |

```bash
curl https://paylink.useclaudia.xyz/v1/reviews/rev_3D4kTq9WmZ2rXb7NcLp0YvHs/resolve \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"action":"accept","note":"Customer confirmed by email"}'
```

Response: the review with `"status": "approved"` and `closed_at` set.

---

## Events

Every change to your account is an event. See [webhooks.md](webhooks.md) for the full list of types.

### List events

`GET /v1/events` · scope `events: read`

Every event in this mode, newest first. Use it to backfill after downtime.

| Query | Description |
|---|---|
| `limit`, `starting_after` | Pagination. |
| `type` | Comma-separated types. A trailing wildcard works: `payment_intent.*`. |
| `created[gte]`, `created[lte]` | Unix seconds. |

```bash
curl "https://paylink.useclaudia.xyz/v1/events?type=payment_intent.*&limit=10" -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

```json
{
  "object": "list",
  "data": [{
    "id": "evt_7QvK2mZr9XbN4sLwT1cYpD8e",
    "object": "event",
    "type": "payment_intent.succeeded",
    "api_version": "2026-09-01",
    "data": { "object": { "id": "pi_3HnV8sKq2LmZ9xWc4TbR7yPe", "object": "payment_intent", "status": "succeeded", "…": "…" } },
    "request": null,
    "created": 1790239828,
    "livemode": false
  }],
  "has_more": true,
  "url": "/v1/events"
}
```

### Retrieve an event

`GET /v1/events/:id` · scope `events: read`

```bash
curl https://paylink.useclaudia.xyz/v1/events/evt_7QvK2mZr9XbN4sLwT1cYpD8e -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

---

## Webhook endpoints

Where events are pushed. Endpoints belong to one mode. See [webhooks.md](webhooks.md).

```json
{
  "id": "we_2rXb7NcLp0YvHs3D4kTq9WmZ",
  "object": "webhook_endpoint",
  "url": "https://shop.example.com/webhooks",
  "description": null,
  "enabled_events": ["payment_intent.succeeded", "payment_intent.requires_review"],
  "status": "enabled",
  "disabled_reason": null,
  "secret": "whsec_…",
  "last_success_at": null,
  "last_failure_at": null,
  "consecutive_failures": 0,
  "created": 1790239607,
  "livemode": false
}
```

`secret` appears only on the responses that create the endpoint or roll its secret.

### Create a webhook endpoint

`POST /v1/webhook_endpoints` · scope `webhook_endpoints: write`

The URL must be public `https`; private, loopback and internal addresses are refused (`url_invalid`).

| Field | Type | Description |
|---|---|---|
| `url` **required** | url | Up to 500 characters. |
| `enabled_events` **required** | string[] | Event types, or `["*"]` for all. Unknown types are refused. |
| `description` | string | Up to 200 characters. |

```bash
curl https://paylink.useclaudia.xyz/v1/webhook_endpoints \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"url":"https://shop.example.com/webhooks","enabled_events":["payment_intent.succeeded","payment_intent.requires_review"]}'
```

Response `201 Created`: the endpoint, with `secret`.

### List webhook endpoints

`GET /v1/webhook_endpoints` · scope `webhook_endpoints: read` · not paginated, no secrets

```bash
curl https://paylink.useclaudia.xyz/v1/webhook_endpoints -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

### Retrieve a webhook endpoint

`GET /v1/webhook_endpoints/:id` · scope `webhook_endpoints: read`

```bash
curl https://paylink.useclaudia.xyz/v1/webhook_endpoints/we_2rXb7NcLp0YvHs3D4kTq9WmZ -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

### Update a webhook endpoint

`POST /v1/webhook_endpoints/:id` · scope `webhook_endpoints: write`

| Field | Type | Description |
|---|---|---|
| `url` | url | New URL. |
| `enabled_events` | string[] | Replaces the list. |
| `description` | string | Up to 200 characters. |
| `disabled` | boolean | `true` stops deliveries (events in the meantime are not queued); `false` re-enables and resets the failure count. |

```bash
curl https://paylink.useclaudia.xyz/v1/webhook_endpoints/we_2rXb7NcLp0YvHs3D4kTq9WmZ \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"disabled":false}'
```

### Roll the signing secret

`POST /v1/webhook_endpoints/:id/roll_secret` · scope `webhook_endpoints: write`

Issues a new secret, effective immediately, and returns it once.

```bash
curl -X POST https://paylink.useclaudia.xyz/v1/webhook_endpoints/we_2rXb7NcLp0YvHs3D4kTq9WmZ/roll_secret \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

### Delete a webhook endpoint

`DELETE /v1/webhook_endpoints/:id` · scope `webhook_endpoints: write`

```bash
curl -X DELETE https://paylink.useclaudia.xyz/v1/webhook_endpoints/we_2rXb7NcLp0YvHs3D4kTq9WmZ \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

```json
{ "id": "we_2rXb7NcLp0YvHs3D4kTq9WmZ", "object": "webhook_endpoint", "deleted": true }
```

### Send a test event

`POST /v1/webhook_endpoints/:id/test` · scope `webhook_endpoints: write`

Queues a sample event to this endpoint only, whatever it subscribes to. The sample object carries
`test_event: true`.

| Field | Type | Description |
|---|---|---|
| `type` | string | Any event type. Default `payment_intent.succeeded`. |

```bash
curl https://paylink.useclaudia.xyz/v1/webhook_endpoints/we_2rXb7NcLp0YvHs3D4kTq9WmZ/test \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"type":"payment_intent.succeeded"}'
```

```json
{ "object": "webhook_test", "endpoint": "we_2rXb7NcLp0YvHs3D4kTq9WmZ", "queued": true }
```

### List deliveries

`GET /v1/webhook_endpoints/:id/deliveries` · scope `webhook_endpoints: read`

Delivery attempts to this endpoint, newest first. Paginated with `limit` and `starting_after`.

```bash
curl https://paylink.useclaudia.xyz/v1/webhook_endpoints/we_2rXb7NcLp0YvHs3D4kTq9WmZ/deliveries \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

```json
{
  "object": "list",
  "data": [{
    "id": "whd_Hs3D4kTq9WmZ2rXb7NcLp0Yv",
    "object": "webhook_delivery",
    "event": "evt_7QvK2mZr9XbN4sLwT1cYpD8e",
    "event_type": "payment_intent.succeeded",
    "endpoint": "we_2rXb7NcLp0YvHs3D4kTq9WmZ",
    "status": "succeeded",
    "attempts": 1,
    "next_attempt_at": null,
    "last_status_code": 200,
    "last_error": null,
    "last_duration_ms": 184,
    "delivered_at": 1790239829,
    "created": 1790239828
  }],
  "has_more": false,
  "url": "/v1/webhook_endpoints/we_2rXb7NcLp0YvHs3D4kTq9WmZ/deliveries"
}
```

### Retry a delivery

`POST /v1/webhook_deliveries/:id/retry` · scope `webhook_endpoints: write`

Queues the event for immediate redelivery to that endpoint.

```bash
curl -X POST https://paylink.useclaudia.xyz/v1/webhook_deliveries/whd_Hs3D4kTq9WmZ2rXb7NcLp0Yv/retry \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

```json
{ "object": "webhook_delivery", "id": "whd_Hs3D4kTq9WmZ2rXb7NcLp0Yv", "queued": true }
```

---

## Assets

### List accepted assets

`GET /v1/assets` · any key, including publishable

The assets your account accepts, in your preferred order. Not paginated.

```bash
curl https://paylink.useclaudia.xyz/v1/assets -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

```json
{
  "object": "list",
  "data": [{
    "object": "asset",
    "id": "usdc.base",
    "symbol": "USDC",
    "name": "USD Coin",
    "network": "base",
    "network_name": "Base",
    "chain_id": 8453,
    "decimals": 6,
    "contract_address": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "type": "erc20",
    "stablecoin": true,
    "min_amount": "0.01",
    "finality": "about 2 minutes",
    "color": "#0052FF"
  }],
  "has_more": false,
  "url": "/v1/assets"
}
```

`type` is `native`, `erc20` or `spl`. Live networks: Base, Ethereum, Arbitrum One, OP Mainnet, Polygon PoS,
Avalanche C-Chain, BNB Smart Chain, Robinhood Chain, ZKsync Era, Linea, Scroll, Unichain, World Chain, Celo,
Gnosis, Mantle, Blast, Sonic, Berachain, Solana and Bitcoin. Tron is planned and does not settle yet.

---

## Reports and analytics

### Download a report

`GET /v1/reports/:kind.csv` · scope `balance: read`

A CSV of `payments`, `balance`, `payouts` or `refunds` for a date range (default: the last 30 days), served as
`text/csv` with a download filename. Values that could be read as spreadsheet formulas are neutralised.

| Query | Description |
|---|---|
| `from` | Unix seconds. Start of the range. |
| `to` | Unix seconds. End of the range (inclusive). Default now. |

```bash
curl "https://paylink.useclaudia.xyz/v1/reports/payments.csv?from=1788000000" \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -o payments.csv
```

Columns, for example `payments.csv`: `id, created, status, amount, currency, description, customer,
customer_email, asset, crypto_amount, usd_rate, amount_usd, tx_hash, payer, succeeded_at, amount_refunded`.

### Analytics

`GET /v1/analytics` · scope `balance: read`

| Query | Description |
|---|---|
| `days` | 1 to 365. Default 30. |

```bash
curl "https://paylink.useclaudia.xyz/v1/analytics?days=30" -H "Authorization: Bearer $PAYLINK_SECRET_KEY"
```

```json
{
  "days": 30,
  "volume": [{ "day": "2026-09-24", "usd": "1250.5", "count": 14 }],
  "funnel": { "succeeded": 120, "expired": 9, "requires_payment": 3 },
  "conversion": 0.909,
  "assets": [{ "asset": "usdc.base", "symbol": "USDC", "network": "base", "count": 80, "usd": "8420" }],
  "settlement_seconds": { "p50": 74, "p90": 160 }
}
```

`volume` is daily succeeded volume in USD, `funnel` counts intents by status, `conversion` is succeeded over all
created (or `null`), and `settlement_seconds` gives time-from-detection-to-finality percentiles.

---

## Test mode and simulation

Test mode is a full copy of your account with its own keys, data, ledger and webhooks, on a simulated chain. It
never reads a real chain, testnets included: only the simulator pays a test payment.

- Use an `sk_test_` key (or the dashboard's test mode).
- Test payments have no account limits.
- Test mode always settles custodially.
- Prices may fall back to labelled reference rates so the sandbox works offline. Live mode never does.
- Approved test payouts and pending test refunds complete by themselves a few seconds later.

### Simulate a payment

`POST /v1/payment_intents/:id/simulate` · scope `payment_intents: write` · **test mode only** (a live key gets
`403 livemode_forbidden`)

Writes simulated transfers that the normal settlement sweep then reads, so you get exactly the statuses, events
and ledger entries a real payment produces. If the intent has no open attempt yet, one is created for `asset` (or
your first accepted stablecoin).

| Field | Type | Description |
|---|---|---|
| `scenario` | enum | See below. Default `paid`. |
| `asset` | string | Asset to pay with when an attempt has to be created, e.g. `usdc.base`. |
| `confirm_after` | integer | Seconds until the transfer is final, 0 to 3600. Default 5. |
| `amount` | decimal string | An exact crypto amount to send instead of the scenario's. |

| `scenario` | What it sends | You should see |
|---|---|---|
| `paid` | The quoted amount | `processing`, then `succeeded` |
| `underpaid` | Half the quoted amount | `partially_paid`; `requires_review` if the quote then expires |
| `top_up` | Whatever is still missing after an underpayment | `processing`, then `succeeded` |
| `overpaid` | The quoted amount plus 10% | `succeeded`, and an `overpaid` review |
| `late` | The quoted amount, after moving the quote deadline into the past | `requires_review` (`late_payment`), or `succeeded` if your policy accepts late payments |
| `reorg` | First call: a transfer that is seen but never final. Second call: it disappears | `processing`, then back to `requires_payment` |

```bash
curl https://paylink.useclaudia.xyz/v1/payment_intents/pi_3HnV8sKq2LmZ9xWc4TbR7yPe/simulate \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"scenario":"underpaid","asset":"usdc.base","confirm_after":10}'
```

```json
{
  "object": "simulation",
  "scenario": "underpaid",
  "payment_attempt": "pa_4kTq9WmZ2rXb7NcLp0YvHs3D",
  "note": "The settlement worker picks this up within a few seconds."
}
```

Other test-mode helpers: `POST /v1/webhook_endpoints/:id/test` sends a sample event, and every test checkout page
has buttons that run the same scenarios.

---

## Other HTTP endpoints

Not part of `/v1`, but useful to know.

| Path | What it is |
|---|---|
| `GET /embed.js` | The embedded checkout script (`Paylink.checkout({ paymentIntent \| url, onSuccess, onClose })`). See [use-cases.md](use-cases.md#5-hosted-and-embedded-checkout). |
| `POST /mcp` | The MCP server for AI agents. See [agent.md](agent.md). |
| `GET /healthz` | Liveness: `{ "ok": true }`. |
| `GET /readyz` | Readiness: database reachable and the settlement worker fresh. `503` when the database is down. |
| `GET /metrics` | Prometheus text: HTTP status counts and job heartbeats. |
| `/pay/:id`, `/l/:code`, `/i/:code`, `/receipt/:id`, `/refund/:token` | Hosted checkout, payment link, invoice, receipt and refund-claim pages. |
| `/shops`, `/shop/:handle` | The public directory. |
| `/api/public/*` | Unauthenticated JSON behind the hosted pages (checkout, links, invoices, refund claims, directory, status). Rate-limited by IP. These serve Paylink's own pages and are not a versioned integration surface; integrate with `/v1`. |
