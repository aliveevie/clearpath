# ClearPath — Pitch Deck

### Compliance-Native Cross-Border Stablecoin Treasury on Solana

### StableHacks 2026 | Track: Cross-Border Stablecoin Treasury

---

## SLIDE FLOW (5 minutes total)

---

### SLIDE 1 — Title (10 seconds)

**Visual:** Dark background, ClearPath logo (CP badge), tagline

**Content:**

- **ClearPath**
- *Compliance-Native Cross-Border Treasury on Solana*
- Track: Cross-Border Stablecoin Treasury
- Team: \[Your names here\]
- StableHacks 2026

**Speaker notes:** "Hi, we're \[team\]. We built ClearPath — the first cross-border stablecoin treasury where compliance is enforced at the protocol level, not the application layer."

---

### SLIDE 2 — The Problem (45 seconds)

**Visual:** Split layout. Left: traditional compliance stack diagram (app layer). Right: red X showing bypass risk.

**Title:** The $150 Trillion Problem

**Content:**

- Cross-border payments move **$150T/year** but take 3-5 days and cost 1.5-6% in fees

- Banks and institutions **want** to use stablecoins — faster, cheaper, 24/7

- But they **cannot** because:

  1. **Compliance is enforced at the app layer** — any smart contract interaction bypasses KYC/AML checks entirely
  2. **Travel Rule is unsolved on-chain** — no way to attach encrypted sender/receiver metadata to token transfers
  3. **No institutional-grade FX settlement** — stablecoin transfers don't natively handle multi-currency conversion

- Result: **Regulated institutions are locked out of DeFi**. Billions in stablecoin infrastructure sits unused by the institutions that need it most.

**Speaker notes:** "Banks want to use stablecoins. The economics are obvious — instant settlement, near-zero cost. But compliance is the blocker. Today, every stablecoin compliance solution works at the application layer. That means any direct smart contract call bypasses all checks. For a regulated bank, that's a non-starter. They need compliance that is literally impossible to circumvent."

---

### SLIDE 3 — The Insight (30 seconds)

**Visual:** Single powerful statement, large text, minimal design

**Title:** What if compliance was part of the token itself?

**Content:**

- Solana's **Token-2022 Transfer Hooks** allow custom logic to execute on **every token transfer** — at the runtime level
- This means compliance checks can run **inside the Solana validator**, not in your app
- No frontend, no backend, no smart contract can bypass it
- **The token enforces its own rules**

**Speaker notes:** "Our insight was simple. Solana's Token-2022 has a feature called Transfer Hooks. They let you attach custom logic that runs on every single token transfer — inside the Solana runtime itself. Not in your app, not in your backend. In the validator. That means compliance becomes a property of the token, not the application."

---

### SLIDE 4 — The Solution (60 seconds)

**Visual:** Architecture diagram showing Token-2022 Mint → Transfer Hook → KYC/AML/Travel Rule checks → Allow/Reject

**Title:** ClearPath: Protocol-Level Compliance

**Content:**

- **ClearPath USDC** — A Token-2022 mint with a Transfer Hook extension

- Every transfer triggers our **Compliance Hook Program** automatically:

  | Check | Enforcement |
  | --- | --- |
  | **KYC Verification** | On-chain Whitelist PDAs — wallet must have valid KYC tier + region + non-expired status |
  | **Sanctions Screening** | Sanctioned wallets are flagged on-chain — transfers rejected at runtime |
  | **Travel Rule** | Transfers &gt;= 1,000 USDC auto-record encrypted sender/receiver metadata as on-chain PDAs |
  | **FX Settlement** | On-chain FX rates from SIX BFI — settle in CHF, EUR, or GBP |

- Both programs **deployed on Solana Devnet**

- Hook Program: `H1Gnvp...zkem`

- Treasury Program: `HK4Lnu...zeA7`

**Speaker notes:** "ClearPath is a stablecoin where compliance is built into the token itself. We deployed two Solana programs. The Compliance Hook runs on every transfer — it checks the sender and receiver against on-chain KYC whitelists, rejects sanctioned wallets, and automatically creates Travel Rule records for transfers above the 1,000 USDC threshold. The Treasury Program handles institutional vault management and FX-settled cross-border transfers using live rates from SIX BFI."

---

### SLIDE 5 — How It Works (45 seconds)

**Visual:** Step-by-step flow diagram with numbered steps

**Title:** Transfer Flow: Frankfurt to Zurich

**Content:**

```
Institution A (Frankfurt)                    Institution B (Zurich)
       |                                            |
       | 1. Initiate 50,000 USDC → CHF             |
       v                                            |
   [Backend API]                                    |
       | 2. Fetch USD/CHF rate from SIX BFI         |
       | 3. Build Token-2022 transfer instruction   |
       v                                            |
   [Solana Runtime]                                 |
       | 4. Transfer Hook auto-executes:            |
       |    - Sender KYC: Tier 2, DE region  ✓      |
       |    - Receiver KYC: Tier 2, CH region ✓     |
       |    - Sanctions check: Clear ✓              |
       |    - Amount >= 1000: Travel Rule PDA ✓     |
       | 5. Transfer ALLOWED                        |
       |-------------------------------------→      |
       |                                     6. Funds arrive
       |                                     7. Compliance log emitted
```

**Speaker notes:** "Here's a real cross-border transfer. Institution A in Frankfurt sends 50,000 USDC to Institution B in Zurich. The backend fetches the live USD/CHF rate from SIX, builds the transaction. When it hits Solana, the Transfer Hook fires automatically — checks both wallets' KYC status, screens for sanctions, and because it's above 1,000 USDC, creates an encrypted Travel Rule record on-chain. The transfer only goes through if every check passes. No exceptions."

---

### SLIDE 6 — Travel Rule Deep Dive (30 seconds)

**Visual:** Diagram showing encrypted PDA structure, VASP decryption flow

**Title:** Travel Rule: On-Chain, Encrypted, Decentralized

**Content:**

- **FATF Travel Rule** requires VASPs to share sender/receiver identity for transfers &gt; threshold
- ClearPath stores Travel Rule data as **encrypted on-chain PDAs**:

  ```
  TravelRuleRecord {
    tx_signature: [u8; 64]
    amount: u64
    currency_pair: [u8; 6]      // "USDCHF"
    sender_vasp: Pubkey
    receiver_vasp: Pubkey
    encrypted_payload: [u8; 256] // AES-256 encrypted PII
    timestamp: i64
  }
  ```
- Only authorized VASPs hold decryption keys
- **No central database = no honeypot** for attackers
- Regulators can verify records exist without accessing PII

**Speaker notes:** "The Travel Rule is one of the hardest compliance requirements in crypto. ClearPath solves it natively. When a transfer exceeds the threshold, we create an on-chain PDA with encrypted sender and receiver metadata. Only the authorized VASPs hold the decryption keys. There's no central database to hack — the data lives on Solana, encrypted, verifiable, and tamper-proof."

---

### SLIDE 7 — Live Demo (90 seconds)

**Visual:** Screen recording / live walkthrough of the application

**Title:** Live Demo

**Demo script (record this):**

1. **Landing Page** (5s) — Show ClearPath homepage, highlight "Protocol-Level Compliance" tagline

2. **Connect Wallet** (5s) — Connect Phantom wallet, show wallet address

3. **Dashboard** (10s) — Show Treasury Vault with live on-chain balance, recent transfer history

4. **Compliance Console** (15s) — Show:

   - Stats: 5 whitelisted wallets, 1 sanctioned, 2 Travel Rule records
   - KYC Whitelist Registry with on-chain entries (tiers, regions, expiry dates)
   - Add a new wallet to KYC whitelist — show on-chain transaction confirm

5. **Execute Transfer** (25s) — Fill in:

   - Recipient: a different devnet wallet
   - Amount: 1,500 USDC (above Travel Rule threshold)
   - Target Currency: CHF
   - Show Travel Rule warning banner
   - Submit → Phantom popup → Sign → Confirm on-chain
   - Show: balance updated, transaction in history

6. **Compliance Verification** (15s) — Go back to Compliance Console:

   - Show new Travel Rule record appeared (on-chain PDA)
   - Show encrypted payload badge

7. **FX Settlement** (15s) — Go to FX Settlement page:

   - Show live rates (USDCHF, USDEUR, USDGBP) sourced from SIX BFI
   - Enter amount, show converted settlement amount
   - Execute FX settlement → wallet signs → confirmed

**Speaker notes:** "Let me show you ClearPath in action. \[Walk through each step\]. Notice that the compliance checks aren't something we added on top — they're happening inside the Solana runtime on every single transfer. The Travel Rule record was created automatically. The FX rate came from SIX BFI and was verified on-chain."

---

### SLIDE 8 — Tech Stack & Architecture (20 seconds)

**Visual:** Clean tech stack grid

**Title:** Built on Solana, Designed for Institutions

**Content:**

| Layer | Technology |
| --- | --- |
| **On-Chain Programs** | Rust + Anchor Framework (2 programs deployed on Devnet) |
| **Token Standard** | Solana Token-2022 with Transfer Hook extension |
| **Frontend** | Next.js 16 + Tailwind CSS + Solana Wallet Adapter |
| **Backend** | Node.js + Express (KYC webhooks, FX adapter, tx builder) |
| **FX Oracle** | SIX BFI API (live rates pushed on-chain every 60s) |
| **Custody** | Designed for Fireblocks MPC integration |
| **KYC Provider** | Webhook-based (Sumsub/Synaps compatible) |

**Speaker notes:** "Two Solana programs in Rust with Anchor, both deployed on devnet. Next.js frontend with wallet adapter. Express backend handling KYC webhooks and FX rate synchronization from SIX BFI, pushed on-chain every 60 seconds."

---

### SLIDE 9 — Why ClearPath Wins (30 seconds)

**Visual:** Three key differentiators, bold icons, minimal text

**Title:** Key Differentiators

**Content:**

**1. Un-Bypassable Compliance**Every other stablecoin compliance solution works at the app layer. ClearPath enforces it at the Solana runtime. Transfer Hook = no bypass possible. This is what regulators and banks actually need.

**2. Travel Rule Solved On-Chain**Encrypted sender/receiver metadata stored as Solana PDAs. No central database. No honeypot. VASP-to-VASP decryption. Regulators can verify existence without accessing PII.

**3. Institutional-Grade FX Settlement**Live FX rates from SIX BFI stored on-chain. Cross-border transfers settle in target currency (CHF, EUR, GBP) in a single atomic transaction.

**Speaker notes:** "Three things make ClearPath different. First, compliance is un-bypassable — it runs in the Solana validator, not your app. Second, Travel Rule is solved on-chain with encrypted PDAs — no central database to attack. Third, FX settlement uses real rates from SIX, a partner of this hackathon, stored on-chain for verification."

---

### SLIDE 10 — Market & Adoption (20 seconds)

**Visual:** Target market segments, adoption path

**Title:** Who This Is For

**Content:**

- **Crypto Banks** (AMINA, Sygnum, BSDEX) — need protocol-level compliance for stablecoin operations
- **Institutional Custodians** (Fireblocks, Copper) — need compliant transfer rails their clients can trust
- **Corporate Treasuries** — need compliant cross-border stablecoin payments with FX settlement
- **Regulators** — can verify Travel Rule compliance directly on-chain

**Adoption path:**

1. Hackathon MVP (now) → 2. AMINA Bank pilot → 3. Multi-bank consortium → 4. Standard for institutional stablecoins on Solana

**Speaker notes:** "ClearPath is built for regulated institutions — crypto banks like AMINA, custodians like Fireblocks, and corporate treasuries that need compliant cross-border payments. Our adoption path starts with this hackathon, moves to a pilot with AMINA Bank, and scales to a multi-bank consortium."

---

### SLIDE 11 — Closing (15 seconds)

**Visual:** Dark background, ClearPath logo, call to action

**Title:** ClearPath

**Content:**

- *The compliance layer that makes institutional stablecoin adoption possible on Solana*
- GitHub: \[your-repo-url\]
- Deployed on Solana Devnet
- Track: Cross-Border Stablecoin Treasury
- **Built for StableHacks 2026**

**Speaker notes:** "ClearPath makes compliance a property of the token, not the application. We believe this is how institutional stablecoins need to work — and we built it. Thank you."

---

## TIMING BREAKDOWN

| Slide | Content | Time | Cumulative |
| --- | --- | --- | --- |
| 1 | Title | 0:10 | 0:10 |
| 2 | The Problem | 0:45 | 0:55 |
| 3 | The Insight | 0:30 | 1:25 |
| 4 | The Solution | 1:00 | 2:25 |
| 5 | How It Works | 0:45 | 3:10 |
| 6 | Travel Rule | 0:30 | 3:40 |
| 7 | Live Demo | 1:30 | 5:10 |
| 8 | Tech Stack | 0:20 | 5:30 |
| 9 | Differentiators | 0:30 | 6:00 |
| 10 | Market | 0:20 | 6:20 |
| 11 | Close | 0:15 | 6:35 |

**Total: \~5 minutes** (with buffer for demo variations)

> **Tip:** If you need to cut to exactly 5 minutes, trim the demo to 60 seconds (skip FX settlement walkthrough) and merge slides 9+10 into one.

---

## PITCH VIDEO TIPS

1. **Record slides + voiceover separately** — use Loom, OBS, or QuickTime
2. **Demo section:** pre-record a clean walkthrough, don't do it live
3. **Energy:** speak with conviction on slides 2-3 (problem/insight) — this is where judges decide if they care
4. **Close strong:** end on "compliance as a property of the token" — it's your one-liner
5. **Keep slides minimal** — big text, few words per slide, let your voice carry the content

---

## DEMO VIDEO TIPS (separate 2-min recording)

1. **No talking needed** — just screen recording with captions/annotations
2. **Show the full flow:** Connect wallet → KYC → Transfer → Travel Rule → FX Settlement → Compliance dashboard
3. **Highlight the Solana Explorer link** for the on-chain transaction — proves it's real
4. **Show the compliance console with real on-chain data** — proves KYC whitelist entries are PDAs, not a database
5. **End with:** "All compliance checks enforced by Solana Transfer Hook — un-bypassable by design"