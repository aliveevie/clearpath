import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import BN from "bn.js";

describe("clearpath-treasury", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ClearpathTreasury as Program<any>;
  const programAccounts = program.account as any;
  const authority = provider.wallet;

  const institutionId = Keypair.generate().publicKey;
  const signer1 = Keypair.generate().publicKey;
  const signer2 = Keypair.generate().publicKey;

  describe("Vault Management", () => {
    it("initializes a treasury vault", async () => {
      await program.methods
        .initVault(institutionId, [signer1, signer2], 2)
        .accountsPartial({
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), institutionId.toBuffer()],
        program.programId
      );

      const vault = await programAccounts.treasuryVault.fetch(vaultPda);
      expect(vault.institutionId.toBase58()).to.equal(
        institutionId.toBase58()
      );
      expect(vault.authority.toBase58()).to.equal(
        authority.publicKey.toBase58()
      );
      expect(vault.threshold).to.equal(2);
      expect(vault.signers.length).to.equal(2);
      expect(vault.totalDeposited.toNumber()).to.equal(0);
      expect(vault.totalWithdrawn.toNumber()).to.equal(0);
    });

    it("rejects invalid threshold", async () => {
      const badInstitutionId = Keypair.generate().publicKey;

      try {
        await program.methods
          .initVault(badInstitutionId, [signer1], 3) // threshold > signers
          .accountsPartial({
            authority: authority.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("InvalidThreshold");
      }
    });
  });
});
