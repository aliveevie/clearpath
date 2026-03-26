use anchor_lang::prelude::*;

use crate::errors::TreasuryError;
use crate::state::{TreasuryVault, MAX_SIGNERS};

pub fn init_vault(
    ctx: Context<InitVault>,
    institution_id: Pubkey,
    signers: Vec<Pubkey>,
    threshold: u8,
) -> Result<()> {
    require!(signers.len() <= MAX_SIGNERS, TreasuryError::TooManySigners);
    require!(
        threshold > 0 && (threshold as usize) <= signers.len(),
        TreasuryError::InvalidThreshold
    );

    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;

    vault.institution_id = institution_id;
    vault.authority = ctx.accounts.authority.key();
    vault.signers = signers;
    vault.threshold = threshold;
    vault.total_deposited = 0;
    vault.total_withdrawn = 0;
    vault.last_activity = clock.unix_timestamp;
    vault.bump = ctx.bumps.vault;

    emit!(VaultInitializedEvent {
        institution_id,
        authority: vault.authority,
        threshold,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(institution_id: Pubkey)]
pub struct InitVault<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + TreasuryVault::INIT_SPACE,
        seeds = [b"vault", institution_id.as_ref()],
        bump,
    )]
    pub vault: Account<'info, TreasuryVault>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[event]
pub struct VaultInitializedEvent {
    pub institution_id: Pubkey,
    pub authority: Pubkey,
    pub threshold: u8,
    pub timestamp: i64,
}
