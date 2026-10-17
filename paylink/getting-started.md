# Getting started

This guide is for merchants. It covers signing in, setting up your shop, practising in test mode, taking your
first payment, and the money controls you set before going live: where funds settle, how payouts are approved,
and the verification that lifts your volume limits.

Everything here happens in the dashboard at **https://paylink.useclaudia.xyz/app**. Every action is also
available through the [API](api-reference.md), and Paylink, the agent in the dashboard, can do many of them for
you (see [agent.md](agent.md)).

---

## 1. Sign in with your wallet

Paylink has no passwords. Your wallet is your login.

1. Open **https://paylink.useclaudia.xyz/connect**.
2. Pick your wallet. The page lists every wallet extension your browser announces (MetaMask, Rabby, Coinbase
   Wallet and others) and, when the operator has configured it, WalletConnect for wallets on your phone.
3. Sign the message. It is a standard "Sign in with Ethereum" (EIP-4361) message bound to this site, with a
   single-use code that expires after five minutes. **Signing does not send a transaction and costs no gas.**

Smart-contract wallets such as Safe and Coinbase Smart Wallet work too: their signatures are checked through
ERC-1271. Sign-in uses an EVM address, even if you will mostly take Solana or Bitcoin payments.

> **Sensitive actions ask you to sign again.** Adding a payout address, creating or rolling API keys, changing
> where funds settle, transferring ownership and loosening payout approvals all need a fresh wallet signature
> from the last ten minutes. A stolen browser session on its own cannot move your money.

The sign-in page can also show **Explore with a demo account**. It gives you a shared test-mode
account full of sample activity. Use it to look around, not for real business.

## 2. Create your shop

After your first sign-in, onboarding asks three things:

| Step | What you enter |
|---|---|
| **Your business** | Business name, a handle (your public short name, used in your directory page and invoice numbers), an optional category and website, and your default currency. Prices are set in that currency; customers pay in crypto at the live rate. |
| **What you accept** | Which coins on which networks your checkout offers, for example USDC on Solana and Base, USDT on Ethereum. You can change this any time under **Settings → Payments**. |
| **Start** | Your shop opens in **test mode** so you can practise first. |

You can belong to several accounts with one wallet and switch between them in the dashboard. To add people,
go to **Settings → Team** and invite them. Each member has one role:

| Role | Can |
|---|---|
| Owner | Everything, including where funds settle. One per account. |
| Administrator | Everything except changing where funds settle. |
| Developer | API keys, webhooks and the catalog. Cannot move money. |
| Finance | Payouts, refunds, approvals and reports. |
| Support | Look up payments and customers, issue refunds. |
| Viewer | Read-only access to payments, balances and reports. |

## 3. Test mode and live mode

Every account has two separate copies: **test** and **live**. Switch between them in the dashboard header.

| | Test mode | Live mode |
|---|---|---|
| Money | None. A simulator plays the customer. | Real payments on real chains. |
| API keys | `sk_test_…`, `rk_test_…`, `pk_test_…` | `sk_live_…`, `rk_live_…`, `pk_live_…` |
| Limits | None | Per-payment maximum and, until you are verified, a daily volume cap |
| Settlement | Always custodial | Custodial or direct, your choice |
| Payouts and refunds | Complete by themselves a few seconds after approval | Sent by the platform's operators and verified on chain |
| Data | Its own payments, customers, webhooks and ledger | Its own payments, customers, webhooks and ledger |

Test mode never reads a real chain, testnets included. Sending testnet tokens to a test payment address does
nothing; only the simulator can pay a test payment. On a test payment's checkout page you will find buttons that
act out a payment (paid, underpaid, overpaid and so on), and developers can do the same through
`POST /v1/payment_intents/:id/simulate`.

## 4. Take your first payment

The quickest way is a payment link.

1. Go to **Payment links** and choose **New link**.
2. Give it a title ("Coffee beans 1 kg") and a price ("12.00"). You can instead let the customer choose the
   amount (good for tips and donations) or sell catalog items with quantities. See [use-cases.md](use-cases.md).
3. Save. You get a short URL (`https://paylink.useclaudia.xyz/l/…`) and a QR code to share.
4. Open the link yourself. In test mode, use the simulator buttons to pay it. Watch the payment appear under
   **Payments**, move to *Processing* and then *Succeeded*.

Or ask Paylink in the dashboard: *"make a $12 link for coffee beans"*. It creates the link as you and replies
with the URL.

Other ways to get paid:

- **Terminal** for in-person sales: key in the amount and show the QR code.
- **Invoices** for bills with a due date and reminders.
- **Subscriptions** for recurring billing.
- **The API** for your own website or app: create a payment intent and send the customer to its `hosted_url`.

### What a payment goes through

```
requires_payment ──> processing ──> succeeded
        │                 ▲
        ├─> partially_paid ┘ (customer sends the rest)
        ├─> requires_review  (late, short at expiry, wrong network, sanctioned payer)
        ├─> expired
        └─> canceled
```

*Processing* means the funds were seen on chain but are not final yet. *Succeeded* means they are final and
booked to your ledger. **Ship the order on succeeded.**

Anything unusual opens a review under **Needs attention**: a customer paid after the quote expired, paid short,
paid too much, paid twice or used the wrong network. You decide: accept the payment, refund it, or dismiss the
review. Late payments go to review by default; you can choose to accept them automatically under
**Settings → Payments**. Payments within your underpayment tolerance (0.5% by default) count as paid.

## 5. Choose where your money settles

Open **Settings → Settlement**. Only the account owner can change this, and it asks for a wallet signature.

| | Custodial (default) | Direct |
|---|---|---|
| Payment addresses | Derived from the platform's custody key | Derived from **your** extended public key (xpub) |
| Your funds | A ledger balance you pay out | In your own wallet the moment they are final |
| Platform fee | Deducted when each payment settles | Booked as a receivable and billed separately |
| Payouts | Needed to withdraw (allowlist, approvals) | Not needed; nothing to withdraw |
| Refunds | Reserved from your balance and sent by the platform | You send them from your wallet and report the transaction |
| Networks | All supported networks | EVM networks. Solana and Bitcoin payments still settle custodially. |

**To switch to direct settlement**, paste the account-level extended public key at `m/44'/60'/0'/0` from your
hardware wallet or custody provider (it starts with `xpub`). Never paste a private key, an `xprv` or a recovery
phrase: the page refuses them and you should treat any you pasted as exposed. Each payment still gets its own
fresh address, but only you hold the key that can move the funds.

> **Back up your key.** With direct settlement, losing the wallet behind your xpub means losing the funds. The
> platform cannot recover them.

The mode applies to live payments only, and each payment keeps the mode it was created under.

## 6. Payouts and approvals (custodial accounts)

Your balance has four parts, shown under **Balances**:

- **Available**: yours to pay out.
- **Pending**: seen on chain, not final yet.
- **Reserved**: set aside for payouts and refunds in progress.
- **Held**: frozen while a compliance review is open.

### Add a payout destination

Go to **Payouts → Destinations** and add the wallet address with the networks it can receive on (exchanges often
support only some). You sign with your wallet to confirm. Then:

- The address is screened against sanctions lists. A flagged address is blocked.
- It **cools off for 24 hours** (by default) before live payouts can use it, and everyone on your team who can
  approve payouts is notified. If you did not expect it, revoke it.
- Destinations can only be added by a person in the dashboard, never with an API key.

### Request a payout

Choose an amount of one coin on one network (for example 1,250 USDC on Base) and a destination. The amount moves
from available to reserved at once.

### Approvals

On **Payouts → Destinations** (`/app/payouts/destinations`, next to the wallets they apply to) set an **approval threshold** in USD and how many approvers you need (one to five).
A payout at or above the threshold waits in *Pending approval* until that many team members, other than the
person who asked for it, approve it. One rejection cancels it and releases the funds. With no threshold set,
payouts are approved immediately. Approvals are always made by people in the dashboard, never by an API key or
an agent. Relaxing the approval rules asks for a wallet signature.

### Scheduled payouts

On the same page, set a schedule (daily, or weekly on a chosen UTC weekday), a default destination and a minimum in USD. Each run
pays out every coin whose available balance is worth at least the minimum and that the destination can receive.
Scheduled payouts go through the same approvals.

### How payouts are sent

The platform's operators send approved payouts in batches from the treasury multisig. A payout is marked *Paid*
only after the transfer is found on chain with exactly the right amount, token and address. In test mode,
approved payouts complete by themselves a few seconds later.

## 7. Verification and limits

In live mode, every account has two limits. The defaults below are set by the operator and can differ per account.

| Limit | Default | Lifted by |
|---|---|---|
| Largest single payment | $50,000 | Contact support |
| Live volume per rolling 24 hours, unverified accounts | $5,000 | Business verification |

To verify, open **Settings → Verification** and submit your legal name, country, address, business type, a
description of what you sell, expected monthly volume and owners (with ownership percentages). The status moves
from *Not verified* to *In review*, then *Verified* or *Not approved*. Once verified, the daily cap no longer
applies unless the platform sets one for your account.

Some accounts must also be verified before any live payout. If so, a payout request says so
(`verification_required`).

## 8. Before you go live

- [ ] Choose the coins and networks you accept (**Settings → Payments**).
- [ ] Set your checkout rules: quote window (10 to 180 minutes, default 30), underpayment tolerance, late-payment
      policy.
- [ ] Choose custodial or direct settlement (**Settings → Settlement**).
- [ ] Custodial: add a payout destination early so its cooling-off period has passed when you need it, and set
      approval rules (**Payouts → Destinations**).
- [ ] Fill in your business profile (**Settings → Business**: support email, statement descriptor) and branding
      (**Settings → Branding**: logo and accent colour on checkout, invoices and receipts).
- [ ] Submit business verification.
- [ ] Developers: create live keys, register a live webhook endpoint, and run your integration against test mode
      first. See [api-reference.md](api-reference.md) and [webhooks.md](webhooks.md).
- [ ] Switch the dashboard to **Live**.
