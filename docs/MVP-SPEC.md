# Autonomirror MVP: paid download-button site

Build brief for Claude Code. It takes the working proof of concept (static generator plus download page, `Autonomi_Download_Button_Demo_SPEC.md`) to a paid MVP: a publisher signs in, uploads a file, pays by card (a single payment or prepaid credits), and gets a download button for a file stored on Autonomi.

Written 2026-10-17; go-live changed the same day from a 120-day seasoning wait to a risk-based gate (section 7). Checked against upstream releases on 2026-10-26 (ant-client 0.14.0 / ant CLI 0.3.12, ant-node 0.23.1; browser SDK still 0.1.2 on npm). Open items (section 19) extended on 2026-11-09 with Stripe compliance and dispute-monitoring findings. Section 20 (an Autonomi-hosted download page on Antnet) added on 2026-11-11. "Autonomirror" is a working name, subject to review; keep the brand in one config value.

Related docs: the business plan outline, the Mirror Buttons product spec and the Photo Albums spec. Where this brief and those differ, this brief wins for the MVP.

---

## 1. Decisions taken

| Topic | Decision |
| --- | --- |
| Payments | **Stripe**, behind a provider interface so a merchant of record (Paddle, Lemon Squeezy) can replace it later |
| Payment modes | (1) **Single upload**: pay the exact price at checkout. (2) **Credits**: top up, then pay uploads from the balance |
| Accounts | **Always required**: email magic-link sign-in before any upload, including single uploads |
| Credit unit | **Money, in minor units** (pence, cents). Each product prices its own uploads |
| Currencies | **GBP, USD and EUR**. Each account has one wallet currency, set at its first purchase |
| Unused credits | **Refundable for 14 days** after purchase, then non-refundable; **expire 24 months** after purchase |
| Go-live | **Risk-based, not time-based.** Live straight after the malware scan when the payment passed 3D Secure (or Apple or Google Pay), its fraud risk is normal, and the account is within its new-account limit. Anything else → **manual review** during the beta (a 24–72 hour hold after the beta) |
| File size | **Up to 1 GB** (1,000,000,000 bytes), matching the released browser SDK (0.1.2). The core lifted its download cap in ant-client 0.13.0 (16 Oct 2026), and SDK 0.1.3, which exposes streaming saves, is prepared on a branch but not yet on npm. Uploads run server-side with no cap, so raise `MAX_FILE_BYTES` once 0.1.3 is published and tested |
| Visibility | **Public files only** |
| Stack | **TypeScript API + Postgres**, a **Rust upload worker** using native ant-core (or the `ant` CLI), the existing **Vite + TS** front end |
| Multi-product | Accounts, wallet, ledger, payments, uploads and review are **platform** modules shared by every future product (photo albums, video). Mirror Buttons is the first **product** on top |

---

## 2. Scope

**In scope**

- Email magic-link sign-in, with a CAPTCHA.
- Wallet and ledger (multi-product, multi-currency), credit lots, seasoning, expiry and refunds.
- Stripe Checkout for top-ups and single uploads, with webhooks, refunds, and dispute and early-fraud-warning handling.
- Resumable upload to staging, malware scan, quote, payment, review gate, network upload and verification.
- Dashboard: files, statuses, embed codes, balance, top-ups, transaction history, receipts.
- Download page from the PoC, extended to check whether a file has been disabled.
- Admin console: review queue, disable or restore links, freeze accounts, refunds, disputes, treasury balance, audit log.
- Transactional email: sign-in links, payment receipts, upload outcomes, review results.

**Out of scope (do not build)**

- Subscriptions (Creator and Site plans), revocable links, updatable links (pointers), stats beyond simple counts.
- Files over 1 GB, the parts-and-manifest scheme, the downloader app.
- Bring-your-own-wallet uploads, other networks (keep the storage-adapter seam only), the public API, the GitHub Action.
- Upload by URL (SSRF risk; a stretch goal).
- Photo albums or any second product. The platform must not *prevent* them; it doesn't need to *contain* them.

---

## 3. Architecture

```
 Browser (publisher)                      Our services                                  Autonomi + Arbitrum
 ┌────────────────────┐  HTTPS   ┌───────────────────────────────┐
 │ web app (Vite/TS)  │ ───────► │ API (TypeScript, Fastify)     │──┐
 │ sign-in, upload,   │  tus     │ auth · wallet/ledger · orders │  │ jobs (Postgres queue)
 │ pay, dashboard     │ ───────► │ payments · review · admin     │  ▼
 └────────────────────┘          │ tus upload endpoint → staging │ ┌──────────────────────────┐   ┌──────────────┐
          │ Stripe Checkout      └───────────────────────────────┘ │ Upload worker (Rust)     │──►│ Autonomi     │
          ▼                              ▲ webhooks                │ scan (ClamAV) → upload   │   │ (ANT pays    │
 ┌────────────────────┐                  │                         │ via ant-core, treasury   │   │  storage)    │
 │ Stripe             │ ─────────────────┘                         │ wallet → verify          │   │ Arbitrum gas │
 └────────────────────┘                                            └──────────────────────────┘   └──────────────┘
 ┌────────────────────┐  status check     ┌──────────┐
 │ download page (PoC)│ ────────────────► │ API      │   downloads go browser → Autonomi nodes (WebRTC), never via us
 └────────────────────┘                   └──────────┘
```

- **One Postgres database.** It holds everything, and is also the job queue (`SELECT … FOR UPDATE SKIP LOCKED`). No Redis needed.
- **Staging storage:** local disk on the worker host for the MVP, behind a small interface so S3-compatible storage can replace it.
- **Hosting:** one small VPS (or two: API, and worker plus ClamAV) with Docker Compose; the static front end and download page on any static host with HTTPS.
- **Domains** (placeholders): `app.<domain>` for the web app, `get.<domain>` for download pages, `api.<domain>` for the API.

### 3.1 Platform versus product boundary

Code is split into **platform** modules, which any product reuses, and **product** modules.

| Platform (shared) | Product: Mirror Buttons |
| --- | --- |
| `auth` (users, sessions) | `files` (name, size, address, status) |
| `wallet` (wallets, lots, ledger, holds) | `links` (download URLs, embeds) |
| `payments` (provider interface, Stripe adapter) | dashboard pages and generator UI |
| `orders` (quotes, priced line items) | pricing rule for "mirror upload" |
| `uploads` (staging, scan, network upload, verify) | |
| `review` (queue, decisions), `admin`, `audit`, `email` | |

Rules:

- Every order, ledger entry and upload job carries a `product` field (`mirror`; later `albums`, `video`).
- Platform modules never import product modules. A product registers its pricing rule and its post-upload hook (for example, "create the file record and links").
- The network is reached only through a `StorageAdapter` (`quote(size)`, `upload(path) → address`, `verify(address, size)`), with Autonomi as the only implementation. Store `network = 'ant'` beside every address.

---

## 4. Money: wallet, credit lots and ledger

### 4.1 Principles

- All amounts are **integers in minor units** with a currency code. No floats anywhere.
- The **ledger is append-only**. Balances are sums of ledger entries, never edited in place; store a cached balance only if it is checked against the sum in tests.
- Every money-changing operation is **idempotent**, keyed by an idempotency key (a Stripe event id, an order id, a job id).
- Credits are a **closed-loop prepaid balance**: usable only for our products, not withdrawable as cash except through the refund rules below.

### 4.2 Wallet currency

- Each user has **one wallet**, whose currency is set by their first purchase (GBP, USD or EUR, offered from the browser's locale and changeable before paying).
- Prices are shown in the wallet currency. A user can change wallet currency only when their balance and holds are zero.

### 4.3 Credit lots

Every successful payment creates a **lot**: a dated batch of credit. A single-upload payment is a lot that is spent at once.

| Field | Meaning |
| --- | --- |
| `amount`, `remaining` | Minor units |
| `currency` | GBP, USD or EUR |
| `payment_id` | The payment that funded it |
| `created_at` | Payment time |
| `refundable_until` | `created_at` + 14 days |
| `seasoned_at` | `created_at` + `SEASONING_DAYS` (default **120**, config); immediate for payment methods with no chargebacks |
| `expires_at` | `created_at` + 24 months |
| `state` | `active`, `exhausted`, `refunded`, `expired`, `reversed` (chargeback) |

- **Spending order: oldest lot first** (FIFO), so credit is used before it expires.
- **Seasoning is a measure, never a wait.** Card schemes allow most disputes up to about 120 days after payment, so a lot counts as *unseasoned* until then. Unseasoned credit spent or held by an account is its **unseasoned exposure**, which feeds the new-account limit (section 7). No upload ever waits for a lot to season.
- **Expiry:** a nightly job expires the remaining balance of lots past `expires_at`. Email the user 30 days before.
- **Refunds:** a user can request a refund of a lot's **unspent** remainder until `refundable_until`; it goes back to the original card through the provider. Spent credit is not refundable. At checkout the user ticks a consent box ("Credits spent on uploads start the service immediately and are not refundable"); wording to be confirmed with an adviser (UK consumer-contract rules for digital services).

### 4.4 Ledger entries

| Type | Effect | When |
| --- | --- | --- |
| `topup` | + | A payment for credits succeeds |
| `single_payment` | + | A single-upload payment succeeds (followed by `hold`) |
| `hold` | − | An order is confirmed; credit is reserved, recording which lots it came from |
| `hold_release` | + | Upload failed or was rejected |
| `capture` | 0 | The upload succeeded; the hold becomes final (record the move from held to spent) |
| `refund` | − | Unspent credit is returned to the card |
| `expiry` | − | A lot expires |
| `reversal` | − | A chargeback is lost; can drive a balance negative, which blocks new uploads |
| `adjustment` | ± | Admin correction, with a mandatory reason |

Every entry records `user_id`, `wallet_id`, `currency`, `amount`, `lot_id` (or a list of lot allocations), `product`, `order_id` or `payment_id`, `idempotency_key`, `actor` (system, user or admin) and `created_at`.

**Invariants to test:** a wallet balance equals the sum of its entries; no lot's `remaining` goes below zero; held plus spent plus remaining equals the lot amount; replaying any webhook or job leaves balances unchanged.

---

## 5. Pricing and quotes

- **Pricing rule (mirror):** `price = max(min_price, ceil(per_gb_price × size_gb))` per currency, from a config table:

| Currency | `min_price` | `per_gb_price` | Top-up packs |
| --- | --- | --- | --- |
| GBP | 200 (£2.00) | 150 | £10, £25, £50 |
| USD | 250 ($2.50) | 190 | $12, $30, $60 |
| EUR | 240 (€2.40) | 180 | €12, €30, €60 |

  With the 1 GB cap, every MVP upload costs the minimum price. Keep the formula anyway for later sizes and products.
- **Quote:** after the scan, the API asks the worker for a live network quote (ANT plus gas) for the file and converts it at live rates.
- **Margin guard:** if `network_cost × 1.5` exceeds the price, don't sell: alert the founders and show the user "pricing is being updated, try again later". Never sell at a loss automatically.
- **Quote validity:** 30 minutes; an expired quote is recalculated before payment.
- **Cost tracking:** record the actual ANT and gas spent per upload (from the worker) beside the price, for margin reports.

---

## 6. User flows

### 6.1 Sign-in

Email → magic link (15-minute, single use) → session cookie (`HttpOnly`, `Secure`, `SameSite=Lax`). Cloudflare Turnstile (or similar) on the email form; rate limits per IP and per email.

### 6.2 Upload and pay (both modes)

1. **Choose file and name.** The page shows the 1 GB limit and the acceptable-use summary. The user confirms the rights attestation: "I have the right to distribute this file publicly. I understand it will be stored permanently on a public network and cannot be deleted from it."
2. **Upload to staging** by tus (resumable), with progress. The API checks the declared size first and rejects files over 1 GB.
3. **Scan:** the worker computes SHA-256 and scans the file with ClamAV, checking the hash against a blocklist. On failure the staged file is deleted and the user is told; nothing is charged.
4. **Quote:** "Store `name` (312 MB) permanently: £2.00".
5. **Pay**, with the options the user's balance allows:
   - **Pay from credits** (if the balance covers it): a `hold` is placed at once.
   - **Pay by card for this upload only**: Stripe Checkout for the exact price. On the webhook, the API records `single_payment` and a `hold`.
   - **Top up and pay**: Checkout for a top-up pack. On the webhook: `topup`, then a `hold` for this order.
6. **Go-live gate (section 7):** either straight to the network upload, or to the review queue.
7. **Network upload** (section 8), then **capture** the hold, create the file record and links, and email the user.
8. **On failure** after payment: `hold_release`. For a single-upload payment, refund the card automatically; for credits, return them to the balance. Email the user either way.

Staged files that are never paid for are deleted after 24 hours.

### 6.3 Top-up only

Dashboard → "Add credits" → pack → Checkout → webhook → `topup` → balance updated, receipt emailed.

### 6.4 Refund request

The dashboard shows "Refund unused credit" on each lot that is still refundable and has a remainder. A click creates a provider refund for the remainder (no human approval needed in the MVP, but logged and capped per user per month).

---

## 7. Go-live gate and review

Go-live is **risk-based**, so legitimate users are live within minutes. The aim is to keep the dispute rate far below card-network thresholds (around 1%) and to stop stolen cards being used to publish abusive files, not to wait out the dispute window.

**Why not wait for credit to season:** a dispute costs the sale plus Stripe's £20 dispute fee (another £20 to contest, refunded if won), whatever the payment size, so small payments are no safer. Waiting doesn't prevent disputes; 3D Secure, risk scoring, limits and early refunds do.

When an order's hold is placed, evaluate the **payments behind the lots it was allocated from** and the account:

| Check | Passes when |
| --- | --- |
| Authentication | Every funding payment passed 3D Secure (`three_d_secure.result = authenticated`), or used Apple Pay or Google Pay, or used a method with no chargebacks |
| Fraud risk | Stripe Radar `risk_level` is `normal` on every funding payment |
| Location | Card country and the sign-in IP country are consistent (same country, or on an allow-list of common pairs) |
| New-account limit | If the account is under `NEW_ACCOUNT_DAYS` (30) old: its unseasoned exposure, including this order, is within `NEW_ACCOUNT_CAP` (£25 / $30 / €30) and it has made at most `NEW_ACCOUNT_MAX_UPLOADS` (10) uploads |
| Standing | Account not frozen; no open early fraud warning or dispute on any of its payments |

| Result | Action |
| --- | --- |
| All checks pass | Upload to the network now; the file goes live when verified |
| Standing fails | Reject; release the hold (refund the card for a single-upload payment) |
| Any other check fails | `REVIEW_POLICY`: **`review`** in the beta (add to the review queue; the staged file waits) or **`delay`** after the beta (go live automatically after `DELAY_HOURS`, default 72, unless an early fraud warning, dispute or admin flag arrives first) |

- Record the outcome and the reason for every decision on the order, and show the counts in the admin console (section 11).
- **Liability shift is likely, not guaranteed.** Stripe says 3D Secure typically moves fraud disputes to the card issuer but can't promise it for any payment, and it doesn't cover non-fraud disputes (such as "not received"), which we answer with delivery evidence. Visa also excludes "stored-value" loads from liability shift: confirm with Stripe that top-ups of closed-loop service credit aren't treated as that (single-upload payments are plain purchases).
- **Payment methods with no chargebacks** (such as UK pay-by-bank, if available on our Stripe account) create lots that are seasoned at once. Optional for the MVP; behind the provider interface.
- **Review console:** the check that sent it to review, file name, size, type (from magic bytes), hash, scan result, uploader's email and history, payment risk signals (3D Secure result, Radar risk level and score, card country against IP country, unseasoned exposure), and a sandboxed preview for images and text. Actions: **Approve** (start the network upload), **Reject** with a reason (release the hold; refund the card for single payments, otherwise return credits), or **Freeze the account**.
- **Review target:** within 24 hours in the beta. The dashboard shows "In review" with that expectation.
- **Why review happens before the network upload:** once a public file is on Autonomi it cannot be removed, so the review must come first. Staging keeps the bytes until a decision is made.

---

## 8. Upload worker (Rust)

- Runs jobs from the Postgres queue with a small, configurable concurrency (start at 2).
- **Connects with native ant-core**, pinned to the current release: **ant-core 0.14.0 / `ant` CLI 0.3.12** (23 Oct 2026); record it in `DECISIONS.md`. The CLI also installs from npm as `@withautonomi/ant`, and falls back to its bundled mainnet seeds when no bootstrap config exists. If the Rust API is awkward for any step, shell out to the pinned `ant` CLI instead. Either way, put it behind the `StorageAdapter`.
- **Uploads public** files, paying from the **treasury wallet** (an EVM key holding ANT and ETH on Arbitrum).
- **Verifies:** reads back the size through the DataMap at the returned address and checks the address is a 64-hex public DataMap address. Since ant-core 0.14.0, upload results report the file's SHA-256 (`FileUploadResult::sha256`; `--json` gives `sha256` from the CLI): compare it with the SHA-256 computed at the scan, and fail the job on a mismatch. Optionally download and compare for files under 50 MB.
- **Records** the address, actual ANT and gas spent, timings and the ant-core version on the job.
- **Retries** with backoff on network errors (3 attempts), then marks the job failed (section 6.2, step 8).
- **Connect hardening** (known 2.0 behaviour): treat zero peers after connect as a failure; time out each connect attempt at 60 s; reconnect with backoff.
- **Treasury safety:**
  - a daily spend cap (config);
  - a low-balance alert for ANT and ETH;
  - pause new jobs (queue them) when below the floor;
  - the key is supplied as a secret, never logged, never in the repo.

  Founders top up the treasury by hand in the MVP.
- **Staging cleanup:** delete the staged file after verification, or after rejection.

**Phase-0 checks before relying on the worker:** a public upload from the worker host to mainnet succeeds; the real cost per 100 MB and 1 GB in ANT and gas; and the PoC download page downloads the result.

---

## 9. Payments: provider interface and Stripe

### 9.1 Interface (`payments/provider.ts`)

```ts
interface PaymentProvider {
  createCheckout(input: {
    kind: "topup" | "single";
    orderId?: string;              // single uploads
    packId?: string;               // top-ups
    amount: number; currency: "GBP" | "USD" | "EUR";
    userId: string; email: string;
    successUrl: string; cancelUrl: string;
  }): Promise<{ checkoutUrl: string; providerRef: string }>;

  parseWebhook(rawBody: Buffer, headers: Record<string, string>): Promise<ProviderEvent[]>; // verified + normalised

  refund(input: { paymentRef: string; amount: number; reason: string }): Promise<{ refundRef: string }>;
}

type ProviderEvent =
  | { type: "payment_succeeded"; paymentRef: string; amount: number; currency: string; metadata: Record<string, string>;
      risk: { threeDS?: "authenticated" | "attempted" | "not_supported" | "failed" | "none"; wallet?: "apple_pay" | "google_pay";
              riskLevel?: "normal" | "elevated" | "highest"; riskScore?: number; cardCountry?: string; chargebackFree: boolean } }
  | { type: "payment_failed"; paymentRef: string }
  | { type: "refund_succeeded"; paymentRef: string; refundRef: string; amount: number }
  | { type: "dispute_opened"; paymentRef: string; amount: number; reason: string }
  | { type: "dispute_closed"; paymentRef: string; outcome: "won" | "lost" }
  | { type: "early_fraud_warning"; paymentRef: string };
```

All business logic works on `ProviderEvent`s, never on Stripe objects directly.

### 9.2 Stripe adapter

- **Checkout Sessions** in `payment` mode, with automatic payment methods (cards, Apple Pay, Google Pay) and `metadata` = `{userId, kind, orderId|packId, idempotencyKey}`.
- **3D Secure on every card payment:** set `payment_method_options[card][request_three_d_secure]=any` on each Checkout Session (the bank still decides whether to challenge the cardholder).
- **Record risk data per payment** (from the charge on `checkout.session.completed`): 3D Secure result, wallet type (Apple Pay, Google Pay or none), Radar `risk_level` and `risk_score`, card country, and the IP country of the session that started checkout. The go-live gate (section 7) reads these.
- **Webhooks:** `checkout.session.completed`, `checkout.session.async_payment_failed`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed` and `radar.early_fraud_warning.created`. Verify signatures. Store every raw event in `provider_events` with a unique constraint on the event id (idempotency).
- **Receipts:** Stripe emails the payment receipt; our email confirms the upload.
- **Tax:** VAT and GST treatment is unresolved (ask an adviser). Keep tax as a config switch that can turn on Stripe Tax; launch the beta with it decided, not defaulted.

### 9.3 Disputes and fraud warnings

| Event | Action |
| --- | --- |
| `early_fraud_warning` | **Refund the whole payment at once** (this usually prevents the dispute and its £20 fee, and is cheaper than fighting it); reverse its remaining credit; freeze the account; reject pending reviews; disable links for files it paid for (our pages only) |
| `dispute_opened` | Freeze the account; disable download links for files paid from that payment's lots (our pages only); notify the founders; assemble evidence (receipt, sign-in IP, upload record, terms acceptance) |
| `dispute_closed: lost` | Record a `reversal`; the account stays frozen |
| `dispute_closed: won` | Unfreeze if no other issues; restore links |

---

## 10. Download page and links

- Reuse the PoC download page (`/d/`), served on `get.<domain>`. Pin `@withautonomi/ant-browser-sdk` **0.1.2** (the PoC pinned 0.1.0); move to 0.1.3 once it is on npm, which adds streaming saves and the network's hot-read spreading.
- **"Busy" is not "missing":** since ant-node 0.23.1 (ADR-0023), nodes explicitly refuse browser sessions when full, and the client reports holders as busy rather than the record as absent. For a busy or capacity error, show "The network is busy for this file, retrying…" and retry with backoff; never show "file not found" for it. This matters most on launch-day spikes.
- **Link format** (network code included for later multi-network support): `https://get.<domain>/f/ant/<address>?n=<name>&s=<size>`. Keep the PoC's `/d/?a=…` format working by redirecting it.
- **Static blocklist (works even if the API is down):** a small file, `blocklist.json`, is served from the **same static host as the download page**, so if the page loads, the list loads.
  - **Format:** `{version, generated_at, entries: [...]}`, where each entry is the lowercase hex SHA-256 of `"ant:" + address`. It holds **hashes, not addresses**, so the public file never becomes a directory of flagged content; the page hashes the address it was given with Web Crypto and looks it up.
  - **Updates:** disabling or restoring a file (admin action, dispute or fraud warning) regenerates the list and publishes it to the static host through the host's API within a minute. Cache it for at most 60 seconds (`Cache-Control: max-age=60`). Record every publish in the audit log.
  - **Fails closed:** the page fetches the list before enabling the Download button. If the list can't be loaded, show "Can't check this file right now, please try again" with a retry, and don't download.
- **Status check:** the page also calls `GET api.<domain>/v1/public/files/ant/<address>`, which returns `{status: "live" | "disabled", name, size, sha256}` or 404, for the file details and a second disabled check.
  - A file is treated as disabled if **either** the blocklist or the API says so; show "This file has been removed from this site" and don't download.
  - If the API is unreachable, or returns 404 (a file not uploaded through us), rely on the blocklist alone and otherwise behave as the PoC does.
  - Downloads from other Autonomi tools can't be stopped, and the wording must not imply they can.
- Show the SHA-256 from our records beside the BLAKE3 the SDK verifies.
- **Download counter:** the page reports a successful download to `POST /v1/public/files/ant/<address>/downloaded` (count only, no personal data stored beyond the request).
- **Embeds:** HTML button, Markdown badge and plain link, using the PoC's snippet generator.
- **Wording rules:** "Free to download"; never "free mirror", "forever" or "can't be taken down".
- **Autonomi-hosted version:** the same page can also be published as a site on Antnet, so the page itself comes from the network. See section 20.

---

## 11. Dashboard and admin

**User dashboard:**

- Balance (with held amount), lots with refund and expiry dates, and transaction history.
- Files: name, size, status (`scanning`, `awaiting payment`, `in review`, `uploading`, `live`, `rejected`, `failed`, `disabled`), date, download count, embed codes, copy-link buttons.
- Upload button; Add credits; account email; sign out; terms and acceptable-use links.

**Admin console** (role `admin`; sign-in plus a TOTP second factor; every action audit-logged):

- Review queue (section 7).
- Users: search, freeze or unfreeze, view history.
- Files: disable or restore a link with a reason.
- Payments and disputes: list, refund, see linked lots and uploads.
- Ledger adjustment with a mandatory reason.
- Treasury: ANT and ETH balances, today's spend against the cap, cost per GB over the last 7 and 30 days.
- **Risk dashboard:** dispute rate (disputes ÷ card payments, rolling 30 and 90 days) with an alert at `DISPUTE_RATE_ALERT` (0.4%), early fraud warnings, refunds, go-live outcomes (live at once, reviewed, rejected) and the check that triggered each review, and the share of payments that passed 3D Secure.
- Config view: seasoning days, review policy and delay, new-account limits, prices, packs, caps.

---

## 12. Data model (Postgres, minimum)

```
users(id, email unique, created_at, status[active|frozen], role[user|admin], wallet_currency, totp_secret?)
sessions(id, user_id, created_at, expires_at, ip, user_agent)
magic_links(token_hash, email, expires_at, used_at)

wallets(id, user_id unique, currency)
payments(id, provider, provider_ref unique, user_id, kind[topup|single], amount, currency, status,
         three_ds_result, wallet_type, risk_level, risk_score, card_country, ip_country, chargeback_free, created_at)
credit_lots(id, wallet_id, payment_id, amount, remaining, currency, created_at, refundable_until, seasoned_at, expires_at, state)
ledger_entries(id, wallet_id, type, amount, currency, product, order_id?, payment_id?, idempotency_key unique, actor, reason?, created_at)
ledger_allocations(ledger_entry_id, lot_id, amount)          -- which lots a hold/capture/refund touched
provider_events(id, provider, event_id unique, type, payload jsonb, received_at, processed_at)

orders(id, user_id, product, status[quoted|awaiting_payment|held|in_review|delayed|uploading|complete|rejected|failed|cancelled],
       price, currency, quote_expires_at, network_cost_estimate, golive_decision, golive_reasons jsonb, golive_at?, created_at)
upload_jobs(id, order_id, product, staging_path, size, sha256, scan_result, status, attempts, last_error,
            network, address?, ant_spent?, gas_spent?, client_version, created_at, updated_at)
reviews(id, order_id, reviewer_id?, decision[approve|reject]?, reason?, created_at, decided_at)

files(id, user_id, order_id, network, address, name, size, sha256, content_type, status[live|disabled], disabled_reason?, download_count, created_at)
audit_log(id, actor_id?, actor_type, action, target_type, target_id, details jsonb, created_at)
```

Migrations go through a migration tool (for example Kysely or Drizzle migrations). Seed data covers prices and packs per currency.

---

## 13. API (sketch)

All authenticated routes use the session cookie and a CSRF token; JSON in and out.

```
POST /v1/auth/magic-link            {email, captchaToken}
GET  /v1/auth/callback?token=…
POST /v1/auth/logout
GET  /v1/me                          → user, wallet, balance, held

GET  /v1/wallet/lots                 GET /v1/wallet/ledger
POST /v1/wallet/topups               {packId, currency?} → {checkoutUrl}
POST /v1/wallet/lots/:id/refund

POST /v1/uploads                     {name, size} → {orderId, tusUrl}   (size ≤ 1 GB)
PATCH/HEAD/POST /v1/tus/…            resumable upload (tus protocol)
GET  /v1/orders/:id                  → status, quote, scan result
POST /v1/orders/:id/pay              {method: "credits" | "card_single" | "topup_and_pay", packId?} → {checkoutUrl?}
POST /v1/orders/:id/cancel

GET  /v1/files                       GET /v1/files/:id   (with embed codes)

GET  /v1/public/files/:network/:address
POST /v1/public/files/:network/:address/downloaded

POST /v1/webhooks/stripe

/v1/admin/…                          review, users, files, payments, ledger adjustments, treasury, config
```

---

## 14. Repository layout

```
autonomirror/
├─ apps/
│  ├─ web/                 # Vite + TS: sign-in, upload, pay, dashboard, generator (from the PoC)
│  ├─ download/            # the PoC download page, extended (status check, counter, SHA-256)
│  └─ admin/               # Vite + TS admin console (separate build, separate origin)
├─ services/
│  ├─ api/                 # TypeScript (Fastify): platform modules + products/mirror
│  │  ├─ platform/{auth,wallet,payments,orders,uploads,review,admin,audit,email}
│  │  └─ products/mirror/
│  └─ worker/              # Rust: queue consumer, ClamAV client, StorageAdapter(ant-core), treasury guard
├─ packages/shared/        # TS types, pricing tables, money helpers (minor units), snippet generator
├─ infra/                  # docker-compose (postgres, clamav, api, worker), env examples, backups
├─ DECISIONS.md            # pinned versions, config defaults, decisions made during the build
└─ README.md
```

---

## 15. Configuration (environment, with defaults)

```
BRAND_NAME=Autonomirror            DOMAIN=example.com
MAX_FILE_BYTES=1000000000          STAGING_DIR=/var/lib/autonomirror/staging
SEASONING_DAYS=120                 REVIEW_POLICY=review              DELAY_HOURS=72
NEW_ACCOUNT_DAYS=30                NEW_ACCOUNT_CAP=GBP:2500,USD:3000,EUR:3000   NEW_ACCOUNT_MAX_UPLOADS=10
LOCATION_ALLOW_PAIRS=…             DISPUTE_RATE_ALERT=0.004
BLOCKLIST_PUBLISH_TOKEN=… (static host API)   BLOCKLIST_MAX_AGE_SECONDS=60
REFUND_WINDOW_DAYS=14              CREDIT_EXPIRY_MONTHS=24
QUOTE_TTL_MINUTES=30               MARGIN_GUARD_MULTIPLIER=1.5
TREASURY_DAILY_CAP_USD=50          TREASURY_MIN_ANT=…  TREASURY_MIN_ETH=…
STRIPE_SECRET_KEY=…  STRIPE_WEBHOOK_SECRET=…  STRIPE_TAX_ENABLED=false
EMAIL_PROVIDER_KEY=…               CAPTCHA_SECRET=…
TREASURY_KEY (secret store only)   ANT_CLIENT_VERSION=…
```

---

## 16. Build order (stop and check at each ★)

1. **★ Phase 0: prove the network path.** On the worker host, connect to mainnet, upload a public test file from the treasury wallet, and download it with the PoC page. Record the ant-core and CLI versions and the real cost per 100 MB and per 1 GB. **Stop if this fails.**
2. Monorepo scaffold, Docker Compose (Postgres, ClamAV), migrations, money helpers with tests.
3. Auth (magic links, sessions, CAPTCHA) and the dashboard shell.
4. **★ Wallet and ledger** with lots, holds, capture, release, refunds and expiry, all invariants tested, before any payment code.
5. Payment provider interface and Stripe adapter in test mode: top-ups end to end with the Stripe CLI forwarding webhooks.
6. Upload pipeline: tus to staging, scan, quote, pay (all three methods), the go-live gate, the worker upload and verify, capture or release.
7. **★ Review queue and admin console**, including disputes, freezes and disabling links.
8. Download page changes: static blocklist (fail closed), status check, counter, SHA-256, new link format with a redirect from the PoC format.
9. Emails, terms and acceptable-use pages, and the consent wording at checkout.
10. Hardening: rate limits, backups, alerts (treasury, failed jobs, disputes), structured logs without personal data or keys.
11. **★ Beta readiness review** against the acceptance criteria, then switch Stripe to live mode.

---

## 17. Testing

- **Unit:** money arithmetic, the pricing rule, FIFO allocation, seasoning and expiry dates, and every ledger invariant (property-based tests).
- **Integration:** Stripe test mode with the Stripe CLI, covering success, decline, 3DS challenge, refund, dispute (test cards for disputes and early fraud warnings), and duplicate and out-of-order webhooks.
- **Network:** a local devnet or the alpha network for the worker in CI or nightly; mainnet only in phase 0 and the beta.
- **Go-live gate:** a table-driven test of every check and combination (3DS authenticated, attempted, not supported; wallet payments; each Radar risk level; country mismatch; new-account limit edges; frozen account; open fraud warning), using Stripe's 3DS and Radar test cards in integration tests.
- **End to end (Playwright):** sign in → upload → pay by single payment with a 3DS test card → live without review → download on the download page → byte-identical file. Repeat with a card that doesn't support 3DS and confirm it goes to review, then approve and confirm it goes live; repeat with credits until the new-account limit is passed and confirm the next upload goes to review.
- **Abuse tests:** the EICAR test file is rejected at the scan; an oversized file is rejected before upload; a frozen account cannot upload.
- **Blocklist tests:** disable a file and confirm the download page refuses it with the API stopped; confirm the page fails closed when the blocklist can't load; confirm the published file holds only hashes.

---

## 18. Acceptance criteria (beta-ready)

- [ ] A new user can sign in, upload a file up to 1 GB, pay by card for that single upload with 3D Secure, and see it live within minutes of the scan; the embed codes work on another site.
- [ ] A user can buy a top-up in GBP, USD or EUR, and pay uploads from credits until the balance runs out; the dashboard shows lots, holds and history correctly.
- [ ] Uploads go to review (beta) when a funding payment lacks 3D Secure or a wallet, has elevated risk, shows a country mismatch, or would take a new account past its limit; the review console shows which check triggered it.
- [ ] The admin console shows the dispute rate and alerts at the configured threshold.
- [ ] Unspent credit can be refunded to the card within 14 days, and not after; lots expire after 24 months with a reminder 30 days before.
- [ ] A failed network upload or a rejected review returns credit (or refunds a single card payment) automatically, and the user is emailed.
- [ ] Replaying any Stripe webhook, or retrying any job, never changes a balance twice.
- [ ] An early fraud warning or a dispute freezes the account, rejects pending reviews and disables that payment's links on our pages.
- [ ] Nothing is ever uploaded to the network before the go-live gate passes.
- [ ] The margin guard blocks sales when the network cost exceeds two-thirds of the price, and alerts the founders.
- [ ] The treasury pauses uploads below its floor or above its daily cap, and alerts the founders.
- [ ] Disabling a file stops every Autonomirror download page from serving it within about a minute, **including while the API is down** (static blocklist); the published blocklist contains only hashes, never addresses.
- [ ] No download passes through our servers (check the browser's network tab: only the status check and counter calls).
- [ ] The ledger, accounts, payments and upload modules contain no Mirror-specific code; adding a second product needs only a new product module and a pricing rule.
- [ ] Every page credits Autonomi and follows the wording rules.

---

## 19. Open items (decide or confirm before launch)

| Item | Who | Note |
| --- | --- | --- |
| VAT and GST on digital services in GBP, USD and EUR markets, and whether to enable Stripe Tax | Adviser | Decide before live mode |
| Consumer-contract wording for credits (14-day refund window, immediate performance, 24-month expiry) | Adviser | Section 4.3 |
| Whether closed-loop credits sit outside e-money rules | Adviser | Expected yes; confirm |
| New-account limits, location allow-list, and when to move from `review` to `delay` | Founders | Section 7; revisit after the beta's dispute and review rates are known |
| Whether top-ups of closed-loop credit count as "stored-value" loads for Visa liability shift | Stripe support | Section 7; affects how much 3D Secure protects top-ups |
| UK pay-by-bank (no chargebacks) availability on our Stripe account | Founders | Optional; lots paid this way are seasoned at once |
| Terms of service, acceptable-use policy, privacy notice | Founders + adviser | Needed for Stripe approval |
| Final brand and domain | Founders | "Autonomirror" is a placeholder |
| Treasury custody: who holds the key, top-up routine, spend cap | Founders | Section 8 |
| Prices and pack sizes per currency | Founders | Section 5; test in the beta |
| **Operator jurisdiction (likely blocker)** | Founders + adviser | Stripe doesn't support businesses based in Jersey, Guernsey or the Isle of Man. A UK account needs a UK legal entity, a physical UK address (not a PO box) and a physical UK bank account. Signing up as a UK business while operating from Jersey would be a misrepresentation. Decide the entity before applying to Stripe |
| Stripe approval as a restricted business | Founders | Stripe's list restricts "cyberlocker and file-sharing services" and platforms that host or distribute third-party content. Declare the category at sign-up and get explicit approval in writing. Stripe can modify or revoke approval at any time |
| How we describe Autonomi and ANT to Stripe | Founders | Stripe won't support crypto businesses (exchanges, wallets, ICOs). We sell storage: customers never hold tokens, and ANT is a supplier cost paid from our treasury. Keep the website, onboarding answers and descriptor consistent with this |
| Limits on seller-maintained credits | Stripe support | Stripe allows credits issued and held by the seller but says they may be subject to limits. Confirm any limit on pack sizes or balances |
| Dispute monitoring that matches Visa's count | Technical co-founder | Visa's VAMP counts disputes **plus early fraud warnings**, even when the payment was refunded; Stripe lists the non-compliant level as 5 events in a month at a 0.5% ratio (excessive: 1.5%). Mastercard ECM counts chargebacks regardless of liability shift (100 a month at 1.5%). Stripe treats dispute activity above 0.75% as excessive. Change the section 11 metric to (disputes + EFWs) ÷ captured payments per calendar month, keep `DISPUTE_RATE_ALERT`, and add an absolute alert (for example 3 events in a month), since beta volumes make the count threshold easy to hit. Cross-check with Stripe's VAMP dashboard |
| Authorise, then capture after the go-live gate | Technical co-founder | Issuers must report suspected fraud on captured payments even after a refund, but not on authorisations reversed before capture. For payments routed to `review` or `delay`, use manual capture and capture only when the gate passes; cancel the authorisation on rejection. Check that the card authorisation window covers the review target and `DELAY_HOURS` |
| Statement descriptor | Founders | Recognisable, for example "\<NAME\> UPLOAD" (Mirror Buttons spec, chargeback control 6). Use one static prefix across all currencies so Visa aggregates the account's ratios |
| Matching against known illegal imagery before upload | Founders + adviser | ClamAV and our own hash blocklist don't cover this. Public files are permanent, and one illegal file could end the merchant account faster than any dispute ratio. Choose an industry hash-list or matching service |
| Merchant-of-record fallback | Founders | The provider interface allows a swap, but confirm first that Paddle or Lemon Squeezy accept a Jersey (or UK) seller and a crypto-adjacent storage service |
| Removal-list behaviour of the Antnet download page on other loaders | Founders | Section 20: fail closed everywhere, or only on our own loader with a warning elsewhere. Decide before claiming that download links outlive the service |

---

## 20. Autonomi-hosted download page (Antnet version)

*Added 11 November 2026. An experiment alongside the MVP, not part of its scope (section 2). The Antnet demo plan (`claude/Antnet_DEMO.md`, section 3.6) covers it from the demo's side.*

**What:** the current download page and button generator, published as a site on Antnet, the site loader at `antnet.autonomirror.com`. The page itself then comes from the Autonomi network, not from our static host: `https://download.antnet.autonomirror.com/f/ant/<address>?n=<name>&s=<size>`. It has no sign-in, upload or payment parts.

**Why:**

- Neither the file nor the download page is sent by our servers. Only Antnet's small loader page comes from our host, and it is open source.
- The page is reachable without our host too: the same site opens by its pointer link on any Antnet loader. That is a stronger promise to publishers than a page on `get.<domain>`, subject to the removal-list decision below.

**How:**

- **Same page, packed as an Antnet site.** It bundles the browser SDK (the archive is about 7 MB) and sets `"spa": true` in its `.autonomi-site.json`, so every `/f/ant/…` path serves the page with its query string kept. Old `/d/?a=…` links redirect in the page.
- **Same download strategy as section 10:** the save picker with `streamAndSave()` in Chrome and Edge (still the first thing awaited in the click handler), the buffered download elsewhere.
- **Service workers:** an Antnet site can't register its own worker; the loader's worker controls the origin. A media preview uses the SDK's media handler, which the loader merges into its worker. Any worker the page uses to stream saves in Firefox or Safari has to be merged the same way.
- **Generator:** its base URL for links, buttons and badges becomes a build setting, so it can produce either `get.<domain>` or Antnet links.
- **Publishing:** pack the built page, upload it as a public file, and publish it behind a pointer (with the short name `download`), so fixes don't change any link. Keep the pointer key with the treasury key's safeguards (section 8): losing it freezes every Antnet download link.

**Differences from section 10:**

- **Removal list and status check are fetched live,** from `get.<domain>/blocklist.json` and `api.<domain>`, which must send `Access-Control-Allow-Origin` for the Antnet origins. **Never bake the list into the archive:** every version of the page stays readable at its own address and can't be updated afterwards.
- **When the list can't be fetched:** the MVP fails closed. Two options for the Antnet page:
  1. **Fail closed everywhere,** as section 10. Safest for the brand and the merchant account, but the page stops working if our host is gone, which undoes the resilience promise.
  2. **Fail closed on `antnet.autonomirror.com`; warn on other loaders** ("This page couldn't check Autonomirror's list of removed files"), then allow the download. Keeps the promise, but our page could serve a file we removed when it is opened through someone else's loader. Any Autonomi tool can fetch that file anyway, but the page carries our name.

  **Decide before claiming that links outlive the service** (open item in section 19).
- **Download counter:** the same API call. Failures are ignored, as now.
- **Wording:** the same rules: "free to download", never "free mirror", "forever" or "can't be taken down".

**Effort:** about 2–4 days once the Antnet loader has merged the SDK's media handler (Antnet demo plan, section 5.8). Most of it is the base-URL setting, the routing, and testing saves in each browser on the Antnet origin.

**Checks:** a cold open and a reload of a `/f/ant/…` link; a save through the picker in Chrome; a buffered download in Firefox and Safari; the shown hash matches the published SHA-256; a disabled file is refused on `antnet.autonomirror.com` with the API stopped; the generator's snippets point at the chosen base URL.
