# ClearPath — Architecture Document
### On-Chain Compliance-Native Cross-Border Treasury on Solana

---

## Overview

ClearPath is a cross-border stablecoin treasury protocol where compliance is enforced at the **token protocol level**, not the application layer. Built on Solana's Token-2022 program, every transfer is gated by an on-chain compliance hook — KYC, AML, and Travel Rule are non-optional by design.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                           │
│   Treasury Dashboard  │  Compliance Console  │  FX Settlement UI    │
└────────────┬──────────┴──────────┬───────────┴──────────┬───────────┘
             │                     │                       │
             ▼                     ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     BACKEND / API LAYER                             │
│   KYC Webhook Handler  │  Travel Rule Engine  │  SIX FX Adapter     │
│          (Node.js / Express)                                        │
└────────────┬──────────┴──────────┬───────────┴──────────┬───────────┘
             │                     │                       │
             ▼                     ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        SOLANA ON-CHAIN                              │
│                                                                     │
│  ┌─────────────────────┐      ┌──────────────────────────────────┐  │
│  │   TOKEN-2022 MINT   │      │     COMPLIANCE HOOK PROGRAM      │  │
│  │                     │─────▶│                                  │  │
│  │  ClearPath USDC     │      │  - execute() called on transfer  │  │
│  │  (Transfer Hook     │      │  - queries Whitelist PDA         │  │
│  │   extension)        │      │  - checks Travel Rule threshold  │  │
│  └─────────────────────┘      │  - emits compliance event log    │  │
│                               └──────────────┬───────────────────┘  │
│                                              │                       │
│              ┌───────────────────────────────┼──────────────────┐   │
│              │                               │                  │   │
│              ▼                               ▼                  ▼   │
│  ┌─────────────────┐         ┌───────────────────┐  ┌─────────────┐ │
│  │  WHITELIST PDA  │         │  TRAVEL RULE PDA  │  │   TREASURY  │ │
│  │                 │         │                   │  │  VAULT PDA  │ │
│  │ wallet → status │         │ encrypted sender/ │  │             │ │
│  │ (KYC tier,      │         │ receiver metadata │  │ multi-sig   │ │
│  │  expiry, region)│         │ above threshold   │  │ time-locks  │ │
│  └─────────────────┘         └───────────────────┘  └─────────────┘ │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    ORACLE LAYER                              │   │
│  │   Pyth Network (FX rates)  │  SIX BFI (FX + Precious Metals)│   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     EXTERNAL INTEGRATIONS                           │
│   Fireblocks MPC Custody  │  KYC Provider (e.g. Sumsub / Synaps)   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Token-2022 Mint with Transfer Hook

The ClearPath stablecoin (pegged to USDC) is deployed as a **Token-2022 mint** with the `TransferHook` extension enabled.

- Every transfer — regardless of which app or wallet initiates it — triggers `execute()` on the Compliance Hook Program
- Transfers that fail compliance checks are **rejected at the runtime level**, not the UI level
- No front-end bypass is possible

**Key accounts on mint:**
```
TransferHookExtension {
    authority: compliance_admin_pubkey,
    program_id: clearpath_hook_program_id
}
```

---

### 2. Compliance Hook Program (Anchor)

The heart of ClearPath. Invoked automatically on every transfer.

**`execute()` logic flow:**
```
1. Load sender_whitelist_account (PDA derived from sender pubkey)
2. Check KYC status → reject if expired or missing
3. Check region/sanctions flag → reject if sanctioned jurisdiction
4. If transfer_amount >= TRAVEL_RULE_THRESHOLD (e.g. 1000 USDC):
     → Write encrypted Travel Rule record to travel_rule_pda
     → Emit on-chain event log for compliance reporting
5. Check receiver_whitelist_account → reject if not whitelisted
6. Allow transfer
```

**PDAs:**
| Account | Seeds | Purpose |
|---|---|---|
| `whitelist_pda` | `["kyc", wallet_pubkey]` | KYC status per wallet |
| `travel_rule_pda` | `["travel", tx_signature]` | Encrypted sender/receiver metadata |
| `treasury_vault_pda` | `["vault", institution_id]` | Institutional treasury account |
| `fx_config_pda` | `["fx", currency_pair]` | Latest FX rate from oracle |

---

### 3. Whitelist Registry

An on-chain PDA store mapping wallet addresses to KYC metadata.

```rust
pub struct WhitelistEntry {
    pub wallet: Pubkey,
    pub kyc_tier: u8,          // 1 = basic, 2 = institutional
    pub kyc_expiry: i64,        // Unix timestamp
    pub region_code: [u8; 2],  // ISO 3166-1 alpha-2
    pub is_sanctioned: bool,
    pub bump: u8,
}
```

**Write path:** KYC provider webhook → Backend API → `update_whitelist` instruction (admin-gated)

**Read path:** Transfer Hook Program reads this PDA synchronously during `execute()`

---

### 4. Travel Rule Engine

When a transfer exceeds the configured threshold, the hook writes a `TravelRuleRecord` PDA:

```rust
pub struct TravelRuleRecord {
    pub tx_signature: [u8; 64],
    pub amount: u64,
    pub currency_pair: [u8; 6],    // e.g. "USDCHF"
    pub sender_vasp: Pubkey,
    pub receiver_vasp: Pubkey,
    pub encrypted_payload: [u8; 256], // AES-256 encrypted sender/receiver PII
    pub timestamp: i64,
    pub bump: u8,
}
```

Authorized VASPs (banks, custodians) can decrypt the payload using their registered keypair — no central database, no honeypot.

---

### 5. Treasury Vault Program

Institutional treasury management layer on top of the compliant token.

**Features:**
- Multi-sig authorization (M-of-N via Squads Protocol)
- Scheduled disbursements (time-locked transfers)
- FX-settled transfers — specify target currency, vault auto-references oracle for settlement amount
- Treasury balance dashboard with real-time FX exposure

---

### 6. Oracle Integration

| Source | Data | Usage |
|---|---|---|
| **SIX BFI** | FX spot rates, precious metals | Settlement calculation, RWA pricing |
| **Pyth Network** | FX rates (backup), crypto prices | Secondary price source, cross-validation |

FX rates are fetched off-chain by the backend and pushed on-chain to `fx_config_pda` via a permissioned `update_fx_rate` instruction. The Treasury Vault reads this PDA at settlement time.

---

### 7. Fireblocks Integration

- Institutional wallets are MPC-custody wallets managed via Fireblocks
- The backend uses Fireblocks SDK to construct and sign transactions on behalf of institutional users
- Whitelist entries reference Fireblocks vault account addresses
- Raw private keys never touch the application layer

---

## Data Flow — Cross-Border Transfer

```
Sender (Institution A, Frankfurt)
        │
        │  initiate_transfer(amount=50,000 USDC, target_currency=CHF)
        ▼
Backend API
        │  1. Look up live USD/CHF from SIX feed
        │  2. Calculate CHF equivalent
        │  3. Build Token-2022 transfer instruction
        │  4. Sign via Fireblocks SDK
        ▼
Solana Runtime
        │  Token-2022 invokes Transfer Hook
        ▼
Compliance Hook Program
        │  ✓ Sender KYC valid (tier 2, region DE)
        │  ✓ Receiver KYC valid (tier 2, region CH)
        │  ✓ Amount ≥ threshold → write TravelRuleRecord PDA
        │  ✓ No sanctions flags
        │  → ALLOW
        ▼
Token transferred to Receiver Vault (Institution B, Zurich)
        │
        ▼
Compliance event log emitted → Backend indexes → Dashboard updated
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Rust, Anchor Framework |
| Token Standard | Solana Token-2022 (Transfer Hook extension) |
| Frontend | Next.js, Tailwind CSS, Wallet Adapter |
| Backend | Node.js, Express |
| MPC Custody | Fireblocks SDK |
| KYC Provider | Sumsub or Synaps (webhook-based) |
| Oracle — Primary | SIX BFI API |
| Oracle — Secondary | Pyth Network |
| Multi-sig | Squads Protocol |
| Testing | Anchor tests, Bankrun (local validator) |
| Deployment | Solana Devnet → Mainnet-Beta |

---

## Security Considerations

- Compliance Hook is the **single source of truth** — UI and backend cannot override it
- Travel Rule payloads are AES-256 encrypted — only authorized VASPs hold decryption keys
- KYC expiry is enforced on-chain — stale entries auto-reject even if never manually revoked
- Admin instructions (whitelist updates, FX updates) are gated behind a multi-sig authority
- Fireblocks ensures no raw key exposure in any backend process

---

## MVP Scope (Hackathon)

| Feature | Status |
|---|---|
| Token-2022 mint with Transfer Hook | ✅ Core |
| Whitelist PDA + KYC enforcement | ✅ Core |
| Travel Rule PDA write on threshold | ✅ Core |
| SIX FX rate feed integration | ✅ Core |
| Treasury Vault (basic multi-sig) | ✅ Core |
| Fireblocks SDK integration | 🟡 Stub/mock acceptable for demo |
| Scheduled disbursements | 🟡 Nice to have |
| Full VASP-to-VASP Travel Rule decryption | 🟡 Nice to have |

---

## Why This Architecture Wins

1. **Compliance is un-bypassable** — Token-2022 hook runs at runtime, not UI. Judges from AMINA Bank will immediately recognize this is how institutional infra actually needs to work.
2. **Solana-native** — Transfer Hooks are a Token-2022 primitive unique to Solana. This isn't an EVM port, it's a Solana-first design.
3. **SIX data is used meaningfully** — FX settlement is a core feature, not a checkbox.
4. **Fireblocks** — AMINA Bank's existing custody stack. Pilot conversation starts the moment they see it in the architecture.
5. **Minimal trust surface** — no centralized compliance database, no admin backdoor on transfers.

---

*Built for StableHacks 2026 — Tenity x Solana Foundation x AMINA Bank*
