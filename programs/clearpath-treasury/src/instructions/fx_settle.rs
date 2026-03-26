use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use clearpath_hook::state::FxConfig;
use crate::errors::TreasuryError;
use crate::state::TreasuryVault;

/// Execute an FX-settled transfer: send USDC equivalent of a target currency amount
/// using the on-chain FX rate from the oracle.
pub fn fx_settle(
    ctx: Context<FxSettle>,
    target_amount: u64, // Amount in target currency (6 decimal fixed point)
) -> Result<()> {
    let fx_config = &ctx.accounts.fx_config;
    let vault = &ctx.accounts.vault;

    require!(
        ctx.accounts.authority.key() == vault.authority,
        TreasuryError::Unauthorized
    );
    require!(fx_config.rate > 0, TreasuryError::InvalidFxRate);

    // Calculate USDC amount: target_amount / fx_rate
    // fx_rate is stored as fixed-point with 6 decimals
    // e.g., 883_450 means 0.883450 target_currency per 1 USD
    // USDC needed = target_amount * 1_000_000 / fx_rate
    let usdc_amount = (target_amount as u128)
        .checked_mul(1_000_000)
        .unwrap()
        .checked_div(fx_config.rate as u128)
        .unwrap() as u64;

    let mint_decimals = ctx.accounts.mint.decimals;
    let institution_id = vault.institution_id;

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
        usdc_amount,
        mint_decimals,
    )?;

    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;
    vault.total_withdrawn = vault.total_withdrawn.checked_add(usdc_amount).unwrap();
    vault.last_activity = clock.unix_timestamp;

    emit!(FxSettlementEvent {
        institution_id: vault.institution_id,
        target_amount,
        usdc_amount,
        fx_rate: fx_config.rate,
        currency_pair: fx_config.currency_pair,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct FxSettle<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.institution_id.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, TreasuryVault>,

    /// On-chain FX rate from the oracle
    pub fx_config: Account<'info, FxConfig>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    pub authority: Signer<'info>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[event]
pub struct FxSettlementEvent {
    pub institution_id: Pubkey,
    pub target_amount: u64,
    pub usdc_amount: u64,
    pub fx_rate: u64,
    pub currency_pair: [u8; 6],
    pub timestamp: i64,
}
