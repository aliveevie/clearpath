# ClearPath Dev Run Failure Report

Date: 2026-03-20
Environment: `/Users/macbookair/clearpath`
Requested run sequence:

```bash
anchor deploy
npx ts-node scripts/init-mint.ts
npx ts-node scripts/demo-transfer.ts
cd backend && npm run dev
cd frontend && npm run dev
```

## Summary

The current repo does not run end to end.

- `anchor deploy` fails on the treasury program account on devnet.
- Both root TypeScript scripts fail at compile time before any chain interaction.
- The backend starts, but its FX updater immediately fails at runtime.
- The frontend starts successfully, with only a non-blocking Next.js warning.

## Findings

### 1. `anchor deploy` fails on missing treasury program account

Command:

```bash
anchor deploy
```

Observed error:

```text
Deploying cluster: https://api.devnet.solana.com
Upgrade authority: /Users/macbookair/.config/solana/id.json
Deploying program "clearpath_treasury"...
Program path: /Users/macbookair/clearpath/target/deploy/clearpath_treasury.so...
Error: AccountNotFound: pubkey=6bmyy9Uto6s9PbRAjVQtwdFivTTus7yXwGpVDdRYW9T9: HTTP status client error (400 Bad request) for url (https://api.devnet.solana.com/)
There was a problem deploying: Output { status: ExitStatus(unix_wait_status(256)), stdout: "", stderr: "" }.
```

Relevant config:

- [Anchor.toml](/Users/macbookair/clearpath/Anchor.toml#L8)
- `clearpath_treasury = "6bmyy9Uto6s9PbRAjVQtwdFivTTus7yXwGpVDdRYW9T9"`

Verification:

- Local deploy keypair resolves to the same address:
  - `target/deploy/clearpath_treasury-keypair.json` -> `6bmyy9Uto6s9PbRAjVQtwdFivTTus7yXwGpVDdRYW9T9`
- `solana program show 6bmyy9Uto6s9PbRAjVQtwdFivTTus7yXwGpVDdRYW9T9` returns the same `AccountNotFound`.

Impact:

- The deploy pipeline stops before the treasury program is deployed or upgraded.

Likely fix area:

- Devnet deployment state and/or program-id alignment for `clearpath_treasury`.
- Confirm whether the configured program id is supposed to exist already on devnet or whether a fresh deploy/program id is required.

### 2. Root TS scripts fail because Node typings are missing in the root TS config

Commands:

```bash
npx ts-node scripts/init-mint.ts
npx ts-node scripts/demo-transfer.ts
```

Observed error pattern:

```text
TSError: ⨯ Unable to compile TypeScript:
Cannot find module 'fs'
Cannot find name 'process'
Cannot find name 'console'
Cannot find name 'Buffer'
```

Relevant config:

- [tsconfig.json](/Users/macbookair/clearpath/tsconfig.json#L2)

Current compiler settings include:

```json
{
  "types": ["mocha", "chai"],
  "lib": ["es2015"]
}
```

Problem:

- The root `tsconfig.json` is used for `scripts/**/*.ts`.
- It includes test typings only and excludes Node typings.
- As a result, `ts-node` cannot typecheck built-in Node globals/modules used by:
  - [scripts/init-mint.ts](/Users/macbookair/clearpath/scripts/init-mint.ts)
  - [scripts/demo-transfer.ts](/Users/macbookair/clearpath/scripts/demo-transfer.ts)

Impact:

- Neither script reaches runtime.
- Mint initialization and demo transfer validation cannot be executed.

Likely fix area:

- Add Node types to the root TypeScript config used by scripts, or split test and script configs.

### 3. Backend starts but fails immediately in FX updater due to invalid program id input

Command:

```bash
cd backend && npm run dev
```

Observed startup output:

```text
Solana program clients initialized
FX rate updater started
FX rate update failed: Error: Invalid public key input
    at new constructor (.../backend/node_modules/@solana/web3.js/src/publickey.ts:65:17)
    at getFxConfigPda (.../backend/src/services/solana.ts:60:5)
    at pushFxRateOnChain (.../backend/src/services/fx-adapter.ts:81:25)
    at update (.../backend/src/services/fx-adapter.ts:120:15)
ClearPath Backend running on port 3001
Health check: http://localhost:3001/health
```

Relevant files:

- [backend/src/config.ts](/Users/macbookair/clearpath/backend/src/config.ts#L9)
- [backend/src/services/solana.ts](/Users/macbookair/clearpath/backend/src/services/solana.ts#L55)
- [backend/src/services/fx-adapter.ts](/Users/macbookair/clearpath/backend/src/services/fx-adapter.ts#L79)

Root cause:

- In [backend/src/config.ts](/Users/macbookair/clearpath/backend/src/config.ts#L14), program ids default to empty strings:

```ts
hookProgramId: process.env.HOOK_PROGRAM_ID || "",
treasuryProgramId: process.env.TREASURY_PROGRAM_ID || "",
```

- In [backend/src/services/solana.ts](/Users/macbookair/clearpath/backend/src/services/solana.ts#L60), the code constructs:

```ts
new PublicKey(config.hookProgramId)
```

- If `.env` is missing or not populated, this becomes `new PublicKey("")`, which throws `Invalid public key input`.

Supporting context:

- [backend/.env.example](/Users/macbookair/clearpath/backend/.env.example#L5) already defines expected values for:
  - `HOOK_PROGRAM_ID`
  - `TREASURY_PROGRAM_ID`

Impact:

- Backend process boots, but FX sync is broken on startup.
- Any feature depending on on-chain FX config PDAs will fail or be unreliable.

Likely fix area:

- Ensure backend env loading is mandatory or validated at boot.
- Fail fast with a clear config error if required program ids are unset.

### 4. Frontend starts successfully; only a workspace-root warning was observed

Command:

```bash
cd frontend && npm run dev
```

Observed output:

```text
▲ Next.js 16.2.0 (Turbopack)
- Local:         http://localhost:3000
- Network:       http://10.253.102.162:3000
✓ Ready in 299ms
⚠ Warning: Next.js inferred your workspace root, but it may not be correct.
Detected additional lockfiles:
  * /Users/macbookair/clearpath/frontend/package-lock.json
```

Relevant file:

- [frontend/next.config.ts](/Users/macbookair/clearpath/frontend/next.config.ts#L1)

Impact:

- Not a blocker for local boot.
- May cause confusing workspace-root behavior in Turbopack if left unresolved.

Likely fix area:

- Set `turbopack.root` explicitly or remove unnecessary extra lockfile layout if intentional monorepo behavior is not needed.

## Priority Order

1. Fix the root TypeScript config so `init-mint.ts` and `demo-transfer.ts` can run.
2. Fix backend config validation so required program ids are loaded before startup logic runs.
3. Resolve devnet treasury deployment state for `anchor deploy`.
4. Clean up the frontend Turbopack root warning.

## Suggested Acceptance Checks

The following should all succeed without manual patching during runtime:

```bash
anchor deploy
npx ts-node scripts/init-mint.ts
npx ts-node scripts/demo-transfer.ts
cd backend && npm run dev
cd frontend && npm run dev
```

Expected outcome after fixes:

- `anchor deploy` completes on devnet.
- `init-mint.ts` creates a mint and writes `mint-info.json`.
- `demo-transfer.ts` runs the intended transfer flow without TS compile failure.
- Backend starts without `Invalid public key input`.
- Frontend starts without critical errors.
