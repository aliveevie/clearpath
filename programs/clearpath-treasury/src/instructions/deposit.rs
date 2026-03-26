use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::errors::TreasuryError;
use crate::state::TreasuryVault;

pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    let mint_decimals = ctx.accounts.mint.decimals;

    // Transfer tokens from depositor to vault token account
    let cpi_accounts = TransferChecked {
        from: ctx.accounts.depositor_token_account.to_account_info(),
        to: ctx.accounts.vault_token_account.to_account_info(),
        authority: ctx.accounts.depositor.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    token_interface::transfer_checked(CpiContext::new(cpi_program, cpi_accounts), amount, mint_decimals)?;

    // Update vault tracking
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;
    vault.total_deposited = vault.total_deposited.checked_add(amount).unwrap();
    vault.last_activity = clock.unix_timestamp;

    emit!(DepositEvent {
        institution_id: vault.institution_id,
        depositor: ctx.accounts.depositor.key(),
        amount,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.institution_id.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, TreasuryVault>,

    /// The Token-2022 mint
    pub mint: InterfaceAccount<'info, Mint>,

    /// Vault's token account (receives the deposit)
    #[account(mut)]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Depositor's token account
    #[account(mut)]
    pub depositor_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Depositor authority
    pub depositor: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[event]
pub struct DepositEvent {
    pub institution_id: Pubkey,
    pub depositor: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}
