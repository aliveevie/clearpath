use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::errors::TreasuryError;
use crate::state::TreasuryVault;

pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    let vault = &ctx.accounts.vault;

    // Verify the authority is the vault authority
    require!(
        ctx.accounts.authority.key() == vault.authority,
        TreasuryError::Unauthorized
    );

    let mint_decimals = ctx.accounts.mint.decimals;
    let institution_id = vault.institution_id;

    // Transfer tokens from vault to recipient using PDA signer
    let seeds = &[
        b"vault".as_ref(),
        institution_id.as_ref(),
        &[vault.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.vault_token_account.to_account_info(),
        to: ctx.accounts.recipient_token_account.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    token_interface::transfer_checked(
        CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds),
        amount,
        mint_decimals,
    )?;

    // Update vault tracking
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;
    vault.total_withdrawn = vault.total_withdrawn.checked_add(amount).unwrap();
    vault.last_activity = clock.unix_timestamp;

    emit!(WithdrawEvent {
        institution_id: vault.institution_id,
        recipient: ctx.accounts.recipient_token_account.key(),
        amount,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.institution_id.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, TreasuryVault>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    pub authority: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[event]
pub struct WithdrawEvent {
    pub institution_id: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}
