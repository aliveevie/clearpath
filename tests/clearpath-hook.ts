import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import BN from "bn.js";

describe("clearpath-hook", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ClearpathHook as Program<any>;
  const programAccounts = program.account as any;
  const authority = provider.wallet;

  const testWallet = Keypair.generate();
  const kycExpiry = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;

  describe("Whitelist Management", () => {
    it("adds a wallet to the whitelist", async () => {
      await program.methods
        .addToWhitelist(2, new BN(kycExpiry), [
          ...Buffer.from("CH"),
        ] as unknown as number[])
        .accountsPartial({
          wallet: testWallet.publicKey,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const [whitelistPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("kyc"), testWallet.publicKey.toBuffer()],
        program.programId
      );

      const entry = await programAccounts.whitelistEntry.fetch(whitelistPda);
      expect(entry.wallet.toBase58()).to.equal(testWallet.publicKey.toBase58());
      expect(entry.kycTier).to.equal(2);
      expect(entry.isSanctioned).to.equal(false);
      expect(
        Buffer.from(entry.regionCode as number[]).toString("utf-8")
      ).to.equal("CH");
    });

    it("updates a whitelist entry", async () => {
      const [whitelistPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("kyc"), testWallet.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .updateWhitelist(1, new BN(kycExpiry), [
          ...Buffer.from("DE"),
        ] as unknown as number[], false)
        .accountsPartial({
          whitelistEntry: whitelistPda,
          authority: authority.publicKey,
        })
        .rpc();

      const entry = await programAccounts.whitelistEntry.fetch(whitelistPda);
      expect(entry.kycTier).to.equal(1);
      expect(
        Buffer.from(entry.regionCode as number[]).toString("utf-8")
      ).to.equal("DE");
    });

    it("marks wallet as sanctioned", async () => {
      const [whitelistPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("kyc"), testWallet.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .updateWhitelist(1, new BN(kycExpiry), [
          ...Buffer.from("DE"),
        ] as unknown as number[], true)
        .accountsPartial({
          whitelistEntry: whitelistPda,
          authority: authority.publicKey,
        })
        .rpc();

      const entry = await programAccounts.whitelistEntry.fetch(whitelistPda);
      expect(entry.isSanctioned).to.equal(true);
    });

    it("removes a wallet from the whitelist", async () => {
      const [whitelistPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("kyc"), testWallet.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .removeFromWhitelist()
        .accountsPartial({
          whitelistEntry: whitelistPda,
          authority: authority.publicKey,
        })
        .rpc();

      const entry = await programAccounts.whitelistEntry.fetchNullable(
        whitelistPda
      );
      expect(entry).to.be.null;
    });
  });

  describe("FX Configuration", () => {
    const currencyPair = [...Buffer.from("USDCHF")] as unknown as number[];

    it("initializes FX config", async () => {
      const rate = 883_450; // 0.883450

      await program.methods
        .initFxConfig(currencyPair, new BN(rate))
        .accountsPartial({
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const [fxPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("fx"), Buffer.from("USDCHF")],
        program.programId
      );

      const config = await programAccounts.fxConfig.fetch(fxPda);
      expect(config.rate.toNumber()).to.equal(rate);
    });

    it("updates FX rate", async () => {
      const [fxPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("fx"), Buffer.from("USDCHF")],
        program.programId
      );

      const newRate = 890_000;
      await program.methods
        .updateFxRate(new BN(newRate))
        .accountsPartial({
          fxConfig: fxPda,
          authority: authority.publicKey,
        })
        .rpc();

      const config = await programAccounts.fxConfig.fetch(fxPda);
      expect(config.rate.toNumber()).to.equal(newRate);
    });
  });

  describe("Travel Rule", () => {
    it("records a travel rule entry", async () => {
      const txSig = new Uint8Array(64).fill(42);
      const payload = new Uint8Array(256).fill(0xab);

      const [travelPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("travel"), Buffer.from(txSig.slice(0, 32))],
        program.programId
      );

      await program.methods
        .recordTravelRule(
          Array.from(txSig),
          new BN(5_000_000_000),
          [...Buffer.from("USDCHF")] as unknown as number[],
          authority.publicKey,
          testWallet.publicKey,
          Array.from(payload)
        )
        .accountsPartial({
          travelRuleRecord: travelPda,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const record = await programAccounts.travelRuleRecord.fetch(travelPda);
      expect(record.amount.toNumber()).to.equal(5_000_000_000);
      expect(record.senderVasp.toBase58()).to.equal(
        authority.publicKey.toBase58()
      );
    });
  });
});
