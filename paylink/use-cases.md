# Use cases

What you can use Paylink for, each with a concrete walkthrough. Dashboard steps assume you are signed in at
`https://paylink.useclaudia.xyz/app`. API examples use a test secret key in `$PAYLINK_SECRET_KEY`; the full
parameter lists are in the [API reference](api-reference.md).

| Use case | Best for | Customer pays at |
|---|---|---|
| [In-person payments (Terminal)](#1-in-person-payments-terminal) | Shops, stalls, events | A QR code on your screen |
| [Payment links](#2-payment-links) | Social posts, chats, a "buy" button without code | `/l/:code` |
| [Invoices with reminders](#3-invoices-with-reminders) | B2B, freelancers, wholesale | `/i/:code` |
| [Subscriptions](#4-subscriptions) | Memberships, retainers, boxes | One invoice per period |
| [Hosted and embedded checkout](#5-hosted-and-embedded-checkout) | Your own website or app | `/pay/:id`, in a tab or a popup |
| [Refunds and claim links](#6-refunds-and-claim-links) | Returning money | `/refund/:token` (when needed) |
| [The shop directory](#7-the-public-shop-directory) | Being found | `/shops` and `/shop/:handle` |
| [AI agents over MCP](#8-ai-agents-working-the-counter-over-mcp) | Automating the back office | — |
| [Paylink in the dashboard](#9-the-built-in-paylink-agent) | Asking and doing in plain words | — |

---

## 1. In-person payments (Terminal)

The Terminal turns any phone, tablet or laptop into a point of sale.

**Walkthrough: selling a $4.50 coffee**

1. Open **Terminal** (`/app/terminal`). You need a role that can create payments (owner, admin, developer,
   support).
2. Key in `4.50` on the keypad (or type it on a keyboard). Add an optional note such as "Flat white".
3. Press **Charge $4.50**. Paylink creates a payment for that amount in your default currency, valid for one
   hour, marked `source: "terminal"`.
4. Turn the screen to the customer. They scan the QR code with their phone camera, which opens the hosted
   checkout. They pick a coin and network and pay from any wallet.
5. The screen follows the payment live: *processing* when the transfer is seen, then a celebration when it is
   final. Press **New sale** for the next customer.

In test mode the QR code is replaced by buttons that act out a payment, so staff can practise.

**Tips**

- Accept coins on fast networks (Solana, Base, Arbitrum and others) for counter sales: finality takes seconds
  to a couple of minutes. Ethereum mainnet and Bitcoin take longer.
- Every Terminal sale is a normal payment: it appears under **Payments**, sends webhooks and books to the ledger.

## 2. Payment links

A payment link is a reusable checkout at a short URL. Each customer who opens it and proceeds to pay gets their
own payment intent, so a link can be paid any number of times. No code is needed.

| `amount_type` | The customer pays | Example |
|---|---|---|
| `fixed` | A set amount | "Coffee beans 1 kg, $12" |
| `items` | Up to 20 catalog prices, each with a quantity they may be allowed to adjust | "Workshop ticket ×2 + T-shirt" |
| `custom` | An amount they choose, optionally between a minimum and maximum, with up to six suggested presets | Tips, donations, "pay what you want" |

Options on any link: collect the customer's email and/or name, limit the coins offered (`allowed_assets`), send
the customer to your own page after paying (`success_url`), stop after N payments (`max_completions`), stop at a
date (`expires_at`), or switch it off at any time.

**Walkthrough: a fixed-price link from the dashboard**

1. **Payment links → New link**. Title "Coffee beans 1 kg", amount `12.00`.
2. Tick **Collect email** so you know who to ship to.
3. Save and share the URL or the QR code.

**Walkthrough: a catalog link through the API**

```bash
# 1. A product with a price
curl https://paylink.useclaudia.xyz/v1/products \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Workshop ticket","default_price":{"unit_amount":"40.00"}}'
# -> default_price.id = price_...

# 2. A link selling it, quantity adjustable
curl https://paylink.useclaudia.xyz/v1/payment_links \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"title":"Saturday workshop","amount_type":"items",
       "items":[{"price":"price_...","quantity":1,"adjustable":true}],
       "collect_email":true,"collect_name":true,"max_completions":30}'
```

**Walkthrough: pay-what-you-want**

```bash
curl https://paylink.useclaudia.xyz/v1/payment_links \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"title":"Support the newsletter","amount_type":"custom","min_amount":"2",
       "presets":["5","10","25"],"collect_email":true}'
```

Payments made through a link have `source: "link"` and `payment_link` set to the link's id. A customer has two
hours to pay once they start.

## 3. Invoices with reminders

Invoices bill a customer for an amount due by a date, at a hosted page they can pay from any wallet.

**Walkthrough: billing a wholesale customer**

1. **Invoices → New invoice**. Choose or add the customer, add lines (description, quantity, unit price), an
   optional tax rate (0 to 50%), memo and footer, and a due date. With no due date, an invoice is due 14 days
   after it is issued.
2. **Finalize**. The invoice gets the next number in your account's gapless sequence (for example
   `NORTHW-00042`; test invoices end in `-TEST`), a payment, and a hosted page at `/i/:code`.
3. Send the link. If the platform has email configured and the invoice has a customer email, live invoices are
   emailed automatically on finalizing and with each reminder.
4. Paylink chases it for you:

| When | Event | Also |
|---|---|---|
| 3 days before the due date | `invoice.reminder` | Email to the customer, if configured |
| On the due date | `invoice.reminder` | Email, if configured |
| 3 days after | `invoice.overdue` | Your team is notified; a subscription invoice makes the subscription `past_due` |
| 7 days after | `invoice.overdue` | Your team is notified |

5. When the customer pays, the invoice becomes `paid` and you receive `invoice.paid`.

Before finalizing, an invoice is an editable `draft` with no number. Afterwards you can **void** it (if no
payment is in progress) or **mark it uncollectible** (written off, still payable).

The same in one API call:

```bash
curl https://paylink.useclaudia.xyz/v1/invoices \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"customer_email":"buyer@example.com","customer_name":"Northwind Cafe",
       "lines":[{"description":"Wholesale beans, 5 kg","quantity":"2","unit_amount":"60.00"}],
       "tax_rate":"20","due_at":1793000000,"finalize":true}'
```

The response carries `hosted_url`, the page to send.

## 4. Subscriptions

Crypto cannot be pulled from someone's wallet, so a Paylink subscription is a **schedule, not a charge**: each
period it issues and finalizes an invoice for the customer to pay. Nothing is ever taken without the customer
sending it.

**Walkthrough: a $12 monthly coffee box**

1. Create a product with a recurring price (**Products → New product**, price `12.00`, recurring monthly), or:

   ```bash
   curl https://paylink.useclaudia.xyz/v1/products \
     -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
     -d '{"name":"Coffee box","default_price":{"unit_amount":"12.00","recurring":{"interval":"month"}}}'
   ```

2. Subscribe a customer to that price:

   ```bash
   curl https://paylink.useclaudia.xyz/v1/subscriptions \
     -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
     -d '{"customer":"cus_...","price":"price_...","days_until_due":7}'
   ```

3. The first invoice is issued immediately, due `days_until_due` days later (7 by default, up to 60).
4. When each period ends the next invoice is issued (renewals are checked every five minutes).
5. If an invoice is three days overdue the subscription becomes `past_due`; paying it makes it `active` again.
   Past-due subscriptions keep renewing.
6. Cancel now, or with `at_period_end: true` to stop when the current period ends.

Intervals are day, week, month or year, every 1 to 12 intervals. Payments for subscription invoices have
`source: "subscription"`.

## 5. Hosted and embedded checkout

For your own website or app, create a **payment intent** on your server for each order, then let the customer pay
it on Paylink's checkout.

**Walkthrough: hosted checkout (redirect)**

```bash
curl https://paylink.useclaudia.xyz/v1/payment_intents \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: order_1042" \
  -d '{"amount":"48.00","currency":"USD","description":"Order 1042",
       "metadata":{"order_id":"1042"},"success_url":"https://shop.example.com/thanks",
       "cancel_url":"https://shop.example.com/cart"}'
```

1. Redirect the browser to `hosted_url` (`https://paylink.useclaudia.xyz/pay/pi_…`).
2. The customer picks a coin and network, sees the quoted amount, a one-time address and a QR code, or pays with
   a connected wallet.
3. Wait for the `payment_intent.succeeded` webhook, then fulfil the order. See [webhooks.md](webhooks.md).

Payments expire after 24 hours by default (`expires_in`, 5 minutes to 30 days). Each quote is valid for your
quote window (30 minutes by default).

**Walkthrough: embedded checkout (popup on your page)**

```html
<script src="https://paylink.useclaudia.xyz/embed.js"></script>
<button id="pay">Pay with crypto</button>
<script>
  document.getElementById("pay").onclick = () => {
    Paylink.checkout({
      paymentIntent: "pi_...",            // created on your server
      onSuccess: (id) => { location.href = "/thanks?pi=" + id; },
      onClose: () => console.log("Customer closed the checkout"),
    });
  };
</script>
```

`Paylink.checkout` takes `{ paymentIntent }` (an intent id) or `{ url }` (any Paylink checkout URL, such as a
payment link). It opens the hosted checkout in a centred popup (not an iframe, so wallet extensions and
WalletConnect work normally). If the browser blocks the popup, the page navigates to the checkout instead.
`onSuccess` fires when the checkout reports success; `onClose` fires if the customer closes it first.

> The browser message is a hint, not proof. Always confirm the payment on your server (the webhook, or
> `GET /v1/payment_intents/:id`) before fulfilling.

**Building your own checkout UI.** A publishable key (`pk_…`) is safe in a browser. With an intent's
`client_secret` it can read that intent and create an attempt for a chosen asset, which returns the address,
amount and an EIP-681 `payment_uri`. See [api-reference.md](api-reference.md#publishable-keys).

## 6. Refunds and claim links

A refund returns crypto from what a payment actually settled, in the same coin and on the same network it
arrived on. You can refund in full or in part, from a succeeded payment, one under review, or one canceled after
a review. The platform fee on the original payment is not returned.

**Walkthrough: a partial refund**

```bash
curl https://paylink.useclaudia.xyz/v1/refunds \
  -H "Authorization: Bearer $PAYLINK_SECRET_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: refund_order_1042" \
  -d '{"payment_intent":"pi_...","amount":"12.00","reason":"One bag arrived damaged"}'
```

`amount` is in the payment's own currency and converted back to crypto at the rate the payment was quoted at.
Leave it out to refund everything still refundable.

Where the money goes:

- **Back to the payer.** If settlement recorded the paying address and it screens clear, the refund goes there and
  starts as `pending`.
- **Through a claim link.** If the customer paid from an exchange or the address is unknown, the refund starts as
  `requires_destination` and the response includes a `claim_url` (`/refund/:token`). Send it to the customer:
  they enter a wallet address, it is screened, and the refund proceeds. The link appears only on the creating
  response and in the `refund.created` event, never again. Anyone holding it can choose the destination, so send
  it only to the customer. With email configured, live customers with an email are sent it automatically.

Custodial refunds are reserved from your balance immediately and sent by the platform's operators. With direct
settlement the funds are in your wallet, so you send the refund yourself and report the transaction hash with
`POST /v1/refunds/:id/mark_sent`; live refunds are checked on chain before they count as sent.

Refunds, like payouts, are always started by a person in the dashboard or by an integration or agent whose key
allows it. Paylink, the built-in agent, never refunds.

## 7. The public shop directory

Opt in to be listed at **https://paylink.useclaudia.xyz/shops**, a public directory of businesses that take
payments through Paylink.

1. Open **Settings → Business** and turn on **List in the public directory**. Fill in your description, category,
   website and support contacts, and your logo and accent colour under **Settings → Branding**: they appear on
   your page.
2. Make sure you have at least one **live, active** payment link. Accounts with no live link are not shown.
3. Your page is at `/shop/:handle`. It lists up to 50 of your live, active links and the coins you accept.

## 8. AI agents working the counter over MCP

Paylink runs an MCP (Model Context Protocol) server at `https://paylink.useclaudia.xyz/mcp`. Any agent (Claude
Code, Cursor, your own) can work your account with an API key, and a **restricted key** decides exactly what it
may touch.

**Walkthrough: a read-only bookkeeping agent**

1. **Developers → API keys → New key**. Kind *Restricted*. Grant `read` on `payment_intents`, `invoices`,
   `customers`, `balance` and `events`. Nothing else. Optionally add an IP allowlist and an expiry.
2. Connect it:

   ```bash
   claude mcp add --transport http paylink https://paylink.useclaudia.xyz/mcp \
     --header "Authorization: Bearer rk_live_..."
   ```

3. Ask: *"Which invoices are overdue, and how much did we take last week?"* The agent calls `list_invoices` and
   `get_analytics`. A call outside its scopes fails with `scope_missing`.

**Walkthrough: an agent that sells but cannot move money**

Grant `write` on `payment_links`, `invoices`, `customers` and `products`, and `read` on `payment_intents`. The
agent can create links and invoices for your customers; refunds, payouts and review decisions fail.

Whatever the key allows, payouts still wait for your approval rules and can only go to destinations a person
added. Every call is in **Developers → Logs** and the audit trail records it as "via MCP agent". Full details and
the tool list: [agent.md](agent.md).

## 9. The built-in Paylink agent

Paylink, your AI shopkeeper, lives in the dashboard (the side panel, and the home page). It is an agent built on
Claudia, and it acts as you: your account, your mode, your role.

Things to ask:

- *"How are sales going this week?"* — calls `get_analytics` and answers with real numbers.
- *"Make a $45 link for the bunny plush."* — calls `create_payment_link` and replies with the URL.
- *"Invoice Northwind Cafe $120 for 5 kg of beans, due in two weeks."* — drafts or issues an invoice.
- *"Anything that needs my attention?"* — lists open reviews and points you to **Needs attention**.
- In test mode: *"Simulate a customer paying that."*

It never refunds, pays out, approves payouts, resolves reviews, or changes keys, team or settlement settings. It
points you to the right page instead. Every number it states comes from a lookup in that conversation. See
[agent.md](agent.md) for the full tool list and spend caps.

---

## Coming soon: get paid by agents (x402)

Put a price on any API or URL, and agents pay per request in USDC over an HTTP 402 handshake, with every paid
call landing in your ledger like any other payment. This is announced in the product and is **not available yet**.
