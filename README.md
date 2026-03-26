<div align="center">

<img src="https://img.shields.io/badge/Solana-Token_2022-9945FF?style=for-the-badge&logo=solana&logoColor=white" />
<img src="https://img.shields.io/badge/Anchor-0.32.0-blue?style=for-the-badge" />
<img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js&logoColor=white" />
<img src="https://img.shields.io/badge/StableHacks-2026-orange?style=for-the-badge" />

<br/><br/>

# 🏦 ClearPath

### Compliance-Native Cross-Border Stablecoin Treasury on Solana

*The first stablecoin protocol where KYC, AML, and Travel Rule are enforced at the token level — not the application layer. Un-bypassable by design.*

<br/>

[**Live Demo**](https://cleave.ibxlab.com/) &nbsp;&bull;&nbsp; [**Demo Video**](https://youtu.be/fLbX2nhzqLU) &nbsp;&bull;&nbsp; [**Architecture**](./arch.md)

<br/>

---

</div>

<br/>

## The Problem

Cross-border payments move **$150T/year** but remain slow, expensive, and compliance-heavy. Banks want stablecoins — instant settlement, near-zero cost, 24/7 availability — but **cannot use them** because:

| Gap | Why It Blocks Institutions |
|-----|---------------------------|
| **App-layer compliance** | Any direct smart contract call bypasses KYC/AML checks entirely |
| **No on-chain Travel Rule** | No way to attach encrypted sender/receiver metadata to token transfers |
| **No FX settlement** | Stablecoin transfers don't natively handle multi-currency conversion |

**Result:** Regulated institutions are locked out of DeFi.

<br/>

## The Solution

<div align="center">

```
┌──────────────────────────────────────────────────────────────────┐
│                     TOKEN-2022 MINT (ClearPath USDC)             │
│                                                                  │
│  Every transfer auto-triggers the Compliance Hook Program:       │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │  KYC Check  │  │  Sanctions   │  │  Travel Rule (≥1000)   │  │
│  │  Whitelist  │→ │  Screening   │→ │  Encrypted PDA Record  │  │
│  │  PDA Lookup │  │  On-Chain    │  │  AES-256 Payload       │  │
│  └─────────────┘  └──────────────┘  └────────────────────────┘  │
│                         │                                        │
│                    PASS / REJECT                                 │
│              (at Solana runtime level)                           │
└──────────────────────────────────────────────────────────────────┘
```

</div>

ClearPath uses **Solana Token-2022 Transfer Hooks** to execute compliance logic on every token transfer — inside the Solana validator itself. No frontend, backend, or smart contract can bypass it.

<br/>

## Key Features

### Protocol-Level Compliance
- **Transfer Hook** runs on every transfer at the Solana runtime level
- On-chain **KYC Whitelist PDAs** with tier, region, expiry, and sanctions flags
- Transfers are rejected by the validator if compliance checks fail — no bypass possible

### Travel Rule On-Chain
- Transfers ≥ 1,000 USDC auto-create **encrypted TravelRuleRecord PDAs**
- AES-256 encrypted sender/receiver PII — only authorized VASPs hold decryption keys
- **No central database = no honeypot** for attackers
- Regulators can verify records exist without accessing PII

### FX-Settled Cross-Border Transfers
- Live FX rates from **SIX BFI** pushed on-chain every 60 seconds
- Settle in CHF, EUR, or GBP in a single atomic transaction
- On-chain rate verification via FxConfig PDAs

### Institutional Treasury Vaults
- Multi-sig authorization (M-of-N signer list)
- Deposit/withdrawal tracking with on-chain audit trail
- FX settlement using on-chain oracle rates

<br/>

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js 16)                       │
│   Dashboard  │  Compliance Console  │  FX Settlement           │
└──────┬───────┴──────────┬───────────┴──────────┬───────────────┘
       │                  │                       │
       ▼                  ▼                       ▼
┌────────────────────────────────────────────────────────────────┐
│                  BACKEND (Express + Anchor SDK)                │
│   KYC Webhooks  │  Travel Rule Engine  │  SIX BFI FX Adapter  │
└──────┬──────────┴──────────┬───────────┴──────────┬────────────┘
       │                     │                       │
       ▼                     ▼                       ▼
┌────────────────────────────────────────────────────────────────┐
│                      SOLANA ON-CHAIN                           │
│                                                                │
│  ┌──────────────────┐    ┌─────────────────────────────────┐  │
│  │  Token-2022 Mint │───▶│  Compliance Hook Program        │  │
│  │  (Transfer Hook) │    │  KYC ✓  Sanctions ✓  Travel ✓   │  │
│  └──────────────────┘    └─────────────────────────────────┘  │
│                                                                │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │ Whitelist   │  │ Travel Rule  │  │ Treasury Vault      │  │
│  │ PDAs        │  │ PDAs         │  │ PDAs                │  │
│  └─────────────┘  └──────────────┘  └─────────────────────┘  │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  FX Oracle Layer — SIX BFI (rates on-chain every 60s)  │  │
│  └─────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

<br/>

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Smart Contracts** | Rust + Anchor 0.32.0 (2 programs on Devnet) |
| **Token Standard** | Solana Token-2022 with Transfer Hook extension |
| **Frontend** | Next.js 16, Tailwind CSS, Solana Wallet Adapter |
| **Backend** | Node.js, Express, Anchor SDK |
| **FX Oracle** | SIX BFI API (live rates pushed on-chain) |
| **Custody** | Designed for Fireblocks MPC integration |
| **KYC Provider** | Webhook-based (Sumsub/Synaps compatible) |

<br/>

## On-Chain Programs (Devnet)

| Program | ID | Purpose |
|---------|-----|---------|
| **Compliance Hook** | `H1GnvpH6ExjedB3uDsB3UF2aNRKtTj7R7Zp14f4qzkem` | Transfer Hook — KYC, sanctions, Travel Rule |
| **Treasury** | `HK4LnUjmobjbcvhfgEUe3pdnf5N3GHZtqPDVy4TKzeA7` | Institutional vault management, FX settlement |
| **Mint** | `FWSVGnr3ehd9P2nNxwdFwHY88epg6Kc981yinv6DFet1` | ClearPath USDC (Token-2022 + Transfer Hook) |

<br/>

## On-Chain Data Structures

```rust
// KYC Whitelist — checked on every transfer
WhitelistEntry {
    wallet: Pubkey,
    kyc_tier: u8,           // 1 = Basic, 2 = Institutional
    kyc_expiry: i64,        // Unix timestamp — auto-rejects if expired
    region_code: [u8; 2],   // ISO 3166-1 alpha-2
    is_sanctioned: bool,    // Blocks all transfers
}

// Travel Rule — auto-created for transfers ≥ 1,000 USDC
TravelRuleRecord {
    tx_signature: [u8; 64],
    amount: u64,
    currency_pair: [u8; 6],       // e.g. "USDCHF"
    sender_vasp: Pubkey,
    receiver_vasp: Pubkey,
    encrypted_payload: [u8; 256], // AES-256 encrypted PII
    timestamp: i64,
}

// FX Config — rates from SIX BFI, updated every 60s
FxConfig {
    currency_pair: [u8; 6],  // e.g. "USDCHF", "USDEUR", "USDGBP"
    rate: u64,               // Fixed-point (6 decimals)
    last_updated: i64,
}
```

<br/>

## Quick Start

### Prerequisites
- Node.js 18+, Rust, Solana CLI, Anchor 0.32.0
- Phantom or Solflare wallet (set to Devnet)

### Run Locally

```bash
# Clone
git clone https://github.com/aliveevie/clearpath
cd clearpath

# Backend
cd backend
cp .env.example .env
npm install && npm run dev

# Frontend (new terminal)
cd frontend
npm install && npm run dev
```

Open [http://localhost:3000](http://localhost:3000), connect your wallet, and start making compliant transfers.

<br/>

## Transfer Flow

```
Institution A (Frankfurt)                Institution B (Zurich)
       │                                          │
       │  1. Send 50,000 USDC → CHF              │
       ▼                                          │
   Backend API                                    │
       │  2. Fetch USD/CHF from SIX BFI           │
       │  3. Build Token-2022 transfer tx          │
       ▼                                          │
   Solana Runtime — Transfer Hook fires:           │
       │  ✓ Sender KYC valid (Tier 2, DE)         │
       │  ✓ Receiver KYC valid (Tier 2, CH)        │
       │  ✓ No sanctions flags                     │
       │  ✓ Amount ≥ 1000 → Travel Rule PDA       │
       │  → TRANSFER ALLOWED                       │
       ├─────────────────────────────────────→     │
       │                                    Funds arrive
```

<br/>

## Why ClearPath

| | Traditional Stablecoin Compliance | ClearPath |
|---|---|---|
| **Enforcement** | App layer (bypassable) | Solana runtime (un-bypassable) |
| **Travel Rule** | Off-chain database | Encrypted on-chain PDAs |
| **FX Settlement** | Manual / off-chain | Atomic on-chain with SIX BFI rates |
| **KYC Expiry** | Manual revocation | Auto-rejected by Transfer Hook |
| **Sanctions** | API check (optional) | On-chain flag (enforced) |

<br/>

## Hackathon Track

**Cross-Border Stablecoin Treasury** — StableHacks 2026

Built with compliance requirements mandated by the hackathon:
- **KYC** — On-chain whitelist with tier, region, expiry enforcement
- **KYT** — All transfers logged via on-chain compliance events
- **AML** — Sanctions screening enforced at runtime
- **Travel Rule** — Encrypted PDA records for transfers ≥ 1,000 USDC

<br/>

## Links

- **Live Demo:** [https://cleave.ibxlab.com/](https://cleave.ibxlab.com/)
- **Demo Video:** [https://youtu.be/fLbX2nhzqLU](https://youtu.be/fLbX2nhzqLU)
- **Architecture:** [arch.md](./arch.md)

<br/>

---

<div align="center">

*Built for StableHacks 2026 — Tenity x Solana Foundation x AMINA Bank*

**ClearPath** — *Compliance as a property of the token, not the application.*

</div>
