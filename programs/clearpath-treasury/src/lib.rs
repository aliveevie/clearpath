use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("HK4LnUjmobjbcvhfgEUe3pdnf5N3GHZtqPDVy4TKzeA7");

#[program]
pub mod clearpath_treasury {
    use super::*;

    pub fn init_vault(
        ctx: Context<InitVault>,
        institution_id: Pubkey,
        signers: Vec<Pubkey>,
        threshold: u8,
    ) -> Result<()> {
        instructions::init_vault::init_vault(ctx, institution_id, signers, threshold)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit::deposit(ctx, amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        instructions::withdraw::withdraw(ctx, amount)
    }

    pub fn fx_settle(ctx: Context<FxSettle>, target_amount: u64) -> Result<()> {
        instructions::fx_settle::fx_settle(ctx, target_amount)
    }
}
