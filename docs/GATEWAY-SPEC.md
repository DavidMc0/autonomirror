# Upload gateway — draft spec

Status: **draft for David's review** (2026-10-31). Nothing here is built. Once approved, the gateway server gets its own repository; the changes to this repo are listed in section 9.

The goal is to let people upload to Autonomi by paying with a card, with no crypto wallet. They buy credits, and the gateway uploads their file and pays the network from its own wallet. Several front ends can share the same credits: this download button first, and photo albums or video backup later (SPEC.md section 15).

Anyone who doesn't want the gateway's rules can still upload with their own wallet or the Autonomi App. The network is open, so the gateway is one convenient route onto it, not the only one.

---

## 1. Principles

1. **Check before paying.** Autonomi storage is permanent. Every check runs before anything is paid for or stored, because nothing can be deleted later.
2. **Reject when unsure.** An automated "no" costs a publisher a retry. Letting the wrong file through can't be undone. Uncertain results are rejected, not queued for a person.
3. **Know who uploaded what.** Every stored file links to a verified account and a payment. That deters abuse and gives law enforcement something to work with.
4. **Keep admin low.** Use hosted services (payments, sign-in) and automated checks. Day-to-day work should come down to abuse reports, the blocklist and topping up the wallet.
5. **Buttons can be switched off.** Buttons link to a pointer the gateway controls, so a file's button can be disabled without anyone needing to delete the file (section 7).

## 2. Verified facts this design depends on (from the SDK 0.1.5 typings, 2026-10-31; not yet tested on the network)

| Fact | Detail |
| --- | --- |
| Payment doesn't need the uploader's wallet | `PaymentProvider.pay(network, quotes, context)` receives the storage quotes and returns a transaction hash. Large uploads use `payMerkle()`. Any wallet can pay, including the gateway's. |
| Pointers can be read in the browser | `client.getPointer()` / `client.resolvePointer()` return the current target, `kind: "chunk"`, and a 64-hex address. |
| Pointers are written with an owner seed | `createPointer` / `updatePointer({ ownerSeed, kind, target, onCheckpoint })`. The 32-byte seed belongs to the application, and `pointerAddress(seed)` computes the address offline. |
| Pointer writes are paid | `PointerWriteResult` includes `storageCostAtto` and an optional `transactionHash`. That covers updates too, so disabling a button costs a small payment. |
| Pointer updates settle over time | `pointerFinality()` reports `open / settling / unconfirmed / final / forked`. For a while, some readers can still see the old target. |
| Browser uploads cap at 1 GB | `MAX_BROWSER_FILE_BYTES` in ant-core. A server-side upload is expected to have no cap (untested). |

**To verify before building:** which client the server should use to upload and write pointers (the `ant` CLI, the Rust `ant-core` library, or a Node binding if one exists), and what a pointer write costs on mainnet.

## 3. Architecture

```
Publisher's browser                Gateway (new repo)                         Autonomi
───────────────────                ──────────────────                         ────────
upload page ── sign in ─────────▶  auth (hosted email link)
            ── buy credits ─────▶  Stripe Checkout ──▶ webhook adds credits
            ── send file ───────▶  temporary storage
                                   checks (section 5) ── rejected → delete, tell publisher
                                   upload + pay from hot wallet ─────────────▶  file stored
                                   create pointer → file ────────────────────▶  pointer stored
            ◀── pointer + address  record: account, file, pointer, payment

Visitor's browser
─────────────────
/d/?p=<pointer> ── resolve pointer ──────────────────────────────────────────▶  target
                ── check blocklist + notices (static files in this repo)
                ── download target ──────────────────────────────────────────▶  file
```

- **The gateway uploads the file itself.** The browser doesn't. If the gateway only paid quotes the browser prepared, it couldn't easily prove they were for the file it checked. Uploading on the server also gets past the browser's 1 GB cap.
- **Hosting:** one small always-on server or container. Serverless platforms are a poor fit, because large uploads and scans run past their time limits.
- **Downloads don't touch the gateway.** The download page stays static, and it keeps working if the gateway is down.

## 4. Accounts, payment and credits

- **Sign-in:** email magic link through a hosted sign-in service. The email must be verified before anyone can buy credits.
- **Payment:** hosted Stripe Checkout, so the gateway never holds card details. Keep Stripe Radar switched on.
- **Credits:** priced in GBP or USD. They can't be transferred, refunded as cash or cashed out. The gateway pays the network itself, and publishers never receive tokens. That makes this a storage service, not a crypto sale. Get a short legal check before taking card payments (section 11).
- **Credits are bought before uploading.** A card dispute can arrive after storage has been paid for permanently, so uploads never run ahead of payment.
- **Pricing per upload:**
  1. When the file arrives, show an estimate based on its size and hold that many credits.
  2. After the checks pass, get the real quotes and convert ANT plus gas into credits using a current price and a margin.
  3. Charge the real amount, up to the hold. If the real price is higher than the hold, stop and ask the publisher before paying.
  4. Release whatever is left of the hold.
- **Records kept for each upload:** account ID, email, Stripe customer ID, IP address, file name, size, SHA-256, check results, file address, pointer address, payment transaction hashes and timestamps.

## 5. Content rules and checks

### Rules (strict at launch, relaxed later if it proves safe)

| Rule | Launch value |
| --- | --- |
| Visibility | Public files only |
| Allowed types | Images, video, audio, PDF and office documents, plain text, and archives (zip, tar, 7z) whose contents follow these same rules |
| Not allowed | Password-protected archives, encrypted containers, executables and anything that can't be inspected |
| Max size | 1 GB (to review once checking costs are known) |
| Type check | Detect the type from the file's content, not its name or extension |

### Checks, in order (each one can reject)

1. **Unpack and identify:** unpack archives, with limits on depth, file count and total unpacked size to stop zip bombs. Identify every file inside and apply the rules above.
2. **Known child-abuse material:** hash matching against an industry database. Options: Microsoft PhotoDNA (free, apply first), Thorn Safer (paid) or Google Content Safety API (apply first). Applications take time, so **start one as soon as the spec is approved**. A match triggers the legal reporting process (section 11), not just a rejection. Nobody on the team ever looks at flagged material.
3. **Malware:** ClamAV (self-hosted, free). Optionally, look up each file's SHA-256 on VirusTotal, sending the hash only and never the file, because files uploaded to VirusTotal are shared.
4. **AI content checks:** send images and sampled video frames to a moderation API, and extracted text (documents, PDFs, subtitles) to a text moderation model. Candidates: OpenAI moderation, AWS Rekognition, Google SafeSearch, or Claude for unclear cases. Reject anything over the threshold, and anything the checker couldn't process.
5. **Pass:** only now does the gateway get quotes, pay and upload.

Rejections tell the publisher which rule failed, but never quote a score or say what was detected. A contact address handles appeals. The temporary copy is deleted after storing or rejecting, unless the law requires keeping it (section 11).

## 6. Abuse limits

| Limit | Starting value (to tune) |
| --- | --- |
| New accounts | 3 uploads and 500 MB a day for the first 14 days |
| Established accounts | 1 GB per file, 10 GB a day |
| Spend per account | Daily cap in credits, set at checkout |
| API rate limit | Per account and per IP |
| Gateway wallet | Small balance only, topped up by hand. Alert when it's low, and alert and pause uploads if daily spend goes over a cap |
| Repeat rejections | Lock the account after 3 rejected uploads in 7 days, pending review |

## 7. Pointers: buttons that can be switched off

- **Every gateway upload gets a pointer.** The gateway creates a pointer with `kind: "chunk"` that targets the file address. The button and link use the pointer: `/d/?p=<pointer address>&n=<name>`.
- **Keys:** the gateway owns every pointer. Each pointer's seed is derived from one master secret and the upload's ID (HKDF-SHA256), so there's nothing per pointer to store. The **master secret is the most sensitive thing the gateway holds**: anyone who has it can redirect every button, for example to malware. Keep it in a separate signing component that only signs pointer writes, with no web access and access logs. Keep an offline backup.
- **Notice files:** a few small, permanent plain-text files, uploaded once, one per reason:
  - `payment-reversed`: "This download was disabled because the payment for it was reversed."
  - `terms-breach`: "This download was removed because it broke the upload rules."
  - `publisher-removed`: "The publisher has withdrawn this download."

  Any Autonomi client that follows the pointer gets a readable explanation. Our download page recognises these addresses and shows the message in the page instead. Fixed reason codes mean nobody ever has to describe what was found.
- **Disabling:** update the pointer to the matching notice. **Re-enabling** (for example, a dispute settled in the publisher's favour): update it back to the file.
- **New versions:** a publisher can replace the file behind a button with a new upload. The pointer can only target files that passed the gateway's own checks.
- **Limits, to state in the terms:**
  - Disabling stops our buttons, not the file. Anyone who already has the file address can still fetch it with any client.
  - Each update is a paid network write.
  - Updates take time to settle across nodes.

## 8. Blocklist

- Pointer updates are slow and paid, and they don't cover links made with a raw file address. A blocklist fills those gaps: it works instantly on our pages and costs nothing.
- `public/blocklist.json` in this repo holds the **SHA-256 of each blocked address**, not the address itself, so the list doesn't become a directory of bad content. It's served as a static file with the site.
- `/d/` checks both the pointer and the file address against it. A match shows the `terms-breach` message.
- **Removal steps:** add to the blocklist and deploy (minutes with the existing GitHub Actions), then update the pointer.
- **Failure behaviour:** if the blocklist can't be loaded, the download continues. An outage shouldn't break every download, and the pointer remains the lasting control.

## 9. Changes to this repo (small PRs, no change in behaviour until the gateway exists)

1. **`/d/` follows pointers:** add the `p` parameter (64 hex characters, validated like `a`) and resolve it with `resolvePointer`. If both `a` and `p` are given, `p` wins. Handle a missing pointer or a target that isn't a chunk with a clear error.
2. **Notices:** a map from notice address to message. A pointer that resolves to a notice shows that message, not a download.
3. **Blocklist:** load `blocklist.json` and check addresses against it as in section 8.
4. **Generator:** accept a pointer address as well as a file address, and produce `?p=` embed code.
5. **Upload page:** a "Pay with credits" option, switched off until the gateway is live. Wallet uploads stay as they are.

Items 1–4 are useful without the gateway, for anyone who publishes through their own pointer.

## 10. Phases

| Phase | What | Needs |
| --- | --- | --- |
| 0 | Approve this spec, create the gateway repo, apply for a hash-matching service | David's review |
| 1 | **Invite only:** the 5–10 publishers from the demand check (SPEC.md section 15). Credits are granted by hand, with no card payments yet. Malware and AI checks, pointers, blocklist | Server, hot wallet, master secret custody |
| 2 | **Open sign-up with card payment** | Hash matching live, Stripe approved, terms and privacy policy, legal check |
| 3 | Other front ends (photo albums, video backup) on the same accounts and credits | Phase 2 stable |

Phase 1 carries very little risk, because everyone uploading is known personally. The safeguards can be finished while real people use the service.

## 11. Legal and policy (get advice before phase 2)

- **Reporting duties for child-abuse material:** depend on where the gateway operates, for example NCMEC reporting in the US, or the IWF and the Online Safety Act in the UK. Some places also require flagged material to be kept securely for a set period. Find out both before launch.
- **Card processor rules:** check that Stripe accepts closed-loop storage credits for this service.
- **Money transmission and e-money:** check whether non-transferable credits that can't be cashed out need a licence. The design aims to avoid needing one.
- **Privacy:** a policy that covers the upload records in section 4, how long they're kept, and when they're shared with law enforcement. GDPR applies if the operator or users are in the UK or EU.
- **Terms:** uploads are permanent and public. The gateway's wallet pays for them. Disabling a button doesn't delete the file. Rules, appeals and how to report abuse.

## 12. Open questions

- Who runs the gateway, and in which country? This drives most of section 11.
- What margin goes on top of network cost, and which price source converts ANT to credits?
- How long are upload records and rejected-file metadata kept?
- Which hash-matching service, and which moderation API?
- Are the launch rules, size cap and abuse limits in sections 5–6 right?
- Which server-side Autonomi client should the gateway use (section 2)?
- What does a pointer write cost on mainnet, and how long does it take to reach `final`?
- Name for the gateway repo and service.
