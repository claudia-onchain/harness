# The Paylink agent and the MCP server

Paylink has two ways for AI to work your account, sharing one list of tools:

| | **Paylink, your AI shopkeeper** | **Your own agents over MCP** |
|---|---|---|
| Where | The dashboard: the side panel, and the home page | `https://paylink.useclaudia.xyz/mcp` |
| Who it acts as | The signed-in team member, with their role | An API key, with its scopes |
| Model | Run by the platform (an agent built on Claudia) | Brought by you: Claude Code, Cursor, your own |
| Money movement | **Never**: no refunds, payouts or review decisions | Allowed only if the key's scopes allow it |
| Audit label | "via Paylink" | "via MCP agent" |

Both make every call through the real `/v1` API, over loopback, with the caller's own credentials. An agent gets
exactly the validation, role and scope checks, idempotency, events and audit trail a person would get. **Neither
can do anything its caller could not already do by hand.**

Paylink is a tool in the Claudia ecosystem; the built-in shopkeeper is managed by an agent built on
[Claudia](https://useclaudia.xyz).

---

## Paylink in the dashboard

Open the Paylink panel in the dashboard and type in plain words:

> **you ›** make a $45 link for the bunny plush
> ▸ `create_payment_link` · 45.00 USD
> **paylink ›** Done! It's on the counter: https://paylink.useclaudia.xyz/l/…

Under each reply, a receipt line shows what Paylink did: the tool, the object it made or touched, and a link to
open it.

### What it can do

- **Look things up:** balances, sales analytics, payments and their timelines, customers, products, payment
  links, invoices, subscriptions, payouts, refunds, reviews, events, accepted assets.
- **Create:** payment links (fixed or customer-chosen amount), invoices (draft or issued), customers, products
  (with one-off or recurring prices), one-off payments with a checkout URL.
- **Cancel** a payment that has not been paid.
- **In test mode:** simulate a customer paying (paid, underpaid, overpaid, late, reorg, top-up).

### What it never does

Paylink is not given the tools for these at all, so it cannot do them however it is asked. A person does them in
the dashboard, and Paylink points to the page instead:

- refunds;
- payouts and payout approvals;
- resolving reviews (accept, refund, dismiss);
- API keys, team members, settlement settings.

It also acts with **your role**: a Viewer's Paylink can look things up but cannot create a link, because the
Viewer role cannot.

### How it behaves

- Every number it states comes from a tool result in that conversation. If it does not have a figure, it looks it
  up or says it does not know. It never estimates money.
- If something important is missing (an amount, a title, who it is for) it asks one short question instead of
  guessing.
- In **live mode** it is told it is handling real customers and money and creates only what you clearly asked
  for. In **test mode** it is free to try things and simulate payments.
- Text inside tool results (customer names, memos, metadata) is treated as data. Paylink is instructed never to
  follow instructions found there, and replies are rendered as text, never HTML.
- Each message can take up to 8 model steps (tool calls and the answer). The browser keeps the conversation and
  sends the recent turns back each time; nothing about the conversation is stored on the server.
- A person can send up to 20 messages a minute.

### Spend caps

Model spend is metered per account per UTC day and capped twice:

| Setting | Default | Meaning |
|---|---|---|
| `PAYLINK_ACCOUNT_DAILY_USD` | `0.05` | Most one account's Paylink can spend per UTC day. |
| `PAYLINK_PLATFORM_DAILY_USD` | `0.5` | Most all accounts together can spend per UTC day. |

When either cap is reached, Paylink says it has "done a full day's work for this shop" and is back tomorrow
(UTC). Messages get `429 rate_limit_error`, code `assistant_budget_reached`. **The till keeps working as normal**:
only the chat pauses. The panel shows today's spend against the account's budget.

### Model configuration (operators)

| Setting | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | unset | Required for the dashboard agent. Without it the panel says Paylink is off (`503 assistant_disabled`). The MCP server works either way. |
| `PAYLINK_MODEL` | `claude-haiku-5-5` | The model the shopkeeper runs on. |

Spend is computed from token usage with a built-in price table for `claude-haiku-5-5`, `claude-sonnet-5-5` and
`claude-opus-5-5`. Any other model id is metered at a deliberately high rate, so it hits the caps sooner; raise
the caps if you choose one. See [self-hosting.md](self-hosting.md).

---

## The MCP server

Paylink runs a [Model Context Protocol](https://modelcontextprotocol.io) server so any agent can work an account
with an API key.

| | |
|---|---|
| URL | `https://paylink.useclaudia.xyz/mcp` |
| Transport | Streamable HTTP, stateless. One JSON-RPC 2.0 message per `POST`, one JSON response. No SSE streams (`GET` returns `405`). Batches are refused. |
| Protocol versions | `2025-11-25` (preferred), `2025-06-18`, `2025-03-26` |
| Auth | `Authorization: Bearer <key>`: a secret `sk_…` or, better, a restricted `rk_…` key. Session cookies are not accepted. |
| Methods | `initialize`, `ping`, `tools/list`, `tools/call`. Notifications get `202` and no body. |
| Rate limit | 50 requests per second per key, shared with `/v1`. |
| Mode | The key decides: `rk_test_…` acts in test mode on the simulated chain, `rk_live_…` in live mode. |

The `initialize` response's `instructions` tell the agent how amounts and assets are written, that test keys act
on a simulated chain, that payouts wait for approval rules, and which account and mode the key acts for.

### Create a key for your agent

1. **Developers → API keys → New key** (you confirm with your wallet).
2. Kind **Restricted**. Grant only what the agent needs; read-only is a good start. Use a test key while you try
   things.
3. Optionally limit it to the IP addresses your agent runs from and give it an expiry.

Example scopes:

| Agent | Scopes |
|---|---|
| Read-only bookkeeper | `read` on `payment_intents`, `invoices`, `customers`, `balance`, `events` |
| Sales assistant | `write` on `payment_links`, `invoices`, `customers`, `products`; `read` on `payment_intents` |
| Support agent that can refund | `read` on `payment_intents`, `customers`; `write` on `refunds` |
| Treasury agent | `read` on `balance`; `write` on `payouts` (payouts still wait for your approvals) |

### Connect Claude Code

```bash
claude mcp add --transport http paylink https://paylink.useclaudia.xyz/mcp \
  --header "Authorization: Bearer rk_live_…"
```

Then ask Claude Code things like *"What did we take this week, by network?"* or, with write scopes, *"Create an
invoice for Northwind Cafe, two lines, due in 14 days."*

### Connect Cursor and other clients

Clients that take a JSON server config (for example Cursor's `.cursor/mcp.json`) use:

```json
{
  "mcpServers": {
    "paylink": {
      "type": "http",
      "url": "https://paylink.useclaudia.xyz/mcp",
      "headers": { "Authorization": "Bearer rk_live_…" }
    }
  }
}
```

### Custom agents (raw JSON-RPC)

```bash
# Handshake
curl https://paylink.useclaudia.xyz/mcp \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25"}}'

# What can I call?
curl https://paylink.useclaudia.xyz/mcp \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# Call a tool
curl https://paylink.useclaudia.xyz/mcp \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call",
       "params":{"name":"create_payment","arguments":{"amount":"25.00","description":"Consulting call"}}}'
```

A `tools/call` result looks like:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [{ "type": "text", "text": "{\"id\":\"pi_…\",\"object\":\"payment_intent\",\"hosted_url\":\"https://paylink.useclaudia.xyz/pay/pi_…\",…}" }],
    "structuredContent": { "id": "pi_…", "object": "payment_intent", "hosted_url": "https://paylink.useclaudia.xyz/pay/pi_…" },
    "isError": false
  }
}
```

`content` carries the API response as compact JSON (cut off after 50,000 characters with a note to ask for fewer
items); `structuredContent` carries it as an object when it is one. When the API refuses (missing scope, invalid
parameter, wrong state) `isError` is `true` and the text contains the HTTP status and the API error, for example
`scope_missing`. An unknown tool is a JSON-RPC error `-32602`; an unknown method `-32601`.

Each tool in `tools/list` has an `inputSchema` and `annotations`: `readOnlyHint` is `true` for read tools and
`destructiveHint` is `true` for the three money-movement tools.

> MCP tool calls do not send an `Idempotency-Key`, so if your agent retries a create call after a network error
> it can create a second object. Build retries carefully, or use the REST API directly for writes that must be
> exactly-once.

---

## The tool list

25 tools. **Paylink** shows whether the built-in shopkeeper has the tool. **Scope** is what a restricted key needs
for the call to succeed.

### Reading the shop

| Tool | What it does | Scope | Paylink |
|---|---|---|---|
| `get_balance` | Balances by asset: available, pending, reserved, held, with USD values. | `balance: read` | Yes |
| `get_analytics` | Sales analytics for the last N days (`days`, 1 to 365, default 30): volume, counts, conversion, top assets, daily series. | `balance: read` | Yes |
| `list_payments` | Payment intents, newest first. Filter by `status` (comma-separated), `q` (search), `customer`; `limit`. | `payment_intents: read` | Yes |
| `get_payment` | One payment intent (`id`) with amounts, status, customer and checkout URL. | `payment_intents: read` | Yes |
| `get_payment_timeline` | Everything that happened to one payment, in order. | `payment_intents: read` | Yes |
| `list_customers` | Customers, optionally searching name or email (`q`). | `customers: read` | Yes |
| `list_products` | Catalog products with their default prices. | `products: read` | Yes |
| `list_payment_links` | Payment links with their public URLs. | `payment_links: read` | Yes |
| `list_invoices` | Invoices, filter by `status` (draft, open, paid, void, uncollectible). | `invoices: read` | Yes |
| `list_subscriptions` | Subscriptions. | `subscriptions: read` | Yes |
| `list_reviews` | Payments that need a decision. `status` `open` (default) or `closed`. | `payment_intents: read` | Yes |
| `list_payouts` | Payouts and their approval status. | `payouts: read` | Yes |
| `list_refunds` | Refunds. | `refunds: read` | Yes |
| `list_events` | The account's event log, filter by `type`. | `events: read` | Yes |
| `list_assets` | Every asset the account can be paid in, as `symbol.network` codes. | any key | Yes |

List tools return 10 items by default (`limit` up to 100).

### Selling

| Tool | What it does | Scope | Paylink |
|---|---|---|---|
| `create_payment_link` | A shareable link. `title` required; `amount_type` `fixed` (needs `amount`) or `custom` (optional `min_amount`, `max_amount`); `description`, `currency`, `allowed_assets`, `collect_email`. Returns the URL. | `payment_links: write` | Yes |
| `create_invoice` | An invoice from `lines` (`description`, `quantity`, `unit_amount`), with `customer` or `customer_name`/`customer_email`, `currency`, `memo`, `due_at`. `finalize: true` issues it now; otherwise a draft. | `invoices: write` | Yes |
| `create_customer` | A customer record (`name`, `email`, `description`). | `customers: write` | Yes |
| `create_product` | A product with a `default_price` (`unit_amount`, `currency`, optional `recurring.interval`). | `products: write` | Yes |
| `create_payment` | A one-off payment intent (`amount`, `currency`, `description`, `customer_email`) and its checkout URL. | `payment_intents: write` | Yes |
| `cancel_payment` | Cancel an unpaid payment intent (`id`, `reason`). | `payment_intents: write` | Yes |
| `simulate_payment` | Test mode only: act out a customer paying (`id`, `scenario`: paid, underpaid, overpaid, late, reorg, top_up). | `payment_intents: write` | Yes |

### Money movement (outside agents only)

| Tool | What it does | Scope | Paylink |
|---|---|---|---|
| `create_refund` | Refund a succeeded payment in full or in part (`payment_intent`, `amount`, `reason`). | `refunds: write` | **No** |
| `request_payout` | Request a payout to an allowlisted destination (`amount` in the asset's units, `asset`, `destination`, `description`). Funds are reserved now; your approval rules decide when it is sent. | `payouts: write` | **No** |
| `resolve_review` | Decide a review (`id`, `action`: accept, refund, dismiss, release; `note`). | `refunds: write` | **No** |

Even with these scopes, an agent **cannot**: approve or reject a payout, add a payout destination, create API
keys, or change team or settlement settings. Those are people-only, dashboard-only actions. A payout an agent
requests still waits for your approval threshold and can only go to an address a person added and that has
finished its cooling-off period.

The dashboard lists the same tools, with their access level, under **Developers → AI agents**.

---

## The audit trail

Every agent call is attributable:

- **Actor labels.** The audit log (**Settings → Security**) and every record that stores who acted name the real
  caller plus the agent: `Ada Lovelace via Paylink` for the shopkeeper, or
  `Bookkeeper (rk_live_AbCdEf…wxyz) via MCP agent` for an MCP key.
- **Real IP.** Each loopback call carries a single-use, in-memory ticket with the real caller's IP and which agent
  made it. `/v1` swaps them back in, so key IP allowlists, logs and the audit trail see the agent's caller, not
  the server. A ticket presented from anywhere but the server itself is refused (`agent_ticket_invalid`).
- **Request logs.** MCP calls are API-key requests, so each one appears under **Developers → Logs** with its
  request and response bodies (secrets redacted), status and duration, and the user agent `Paylink-agent/mcp`.
- **Events.** Anything an agent creates or changes emits the same events and webhooks as when a person does it.
- **Idempotency.** Paylink sends an idempotency key per tool use, so a retried step inside one message cannot
  create a duplicate.

---

## Coming soon: get paid by agents (x402)

Put a price on any API or URL; agents pay per request in USDC over an HTTP 402 handshake, and every paid call
lands in your ledger like any other payment. Announced in the product, **not available yet**.
