use anchor_lang::prelude::*;

use crate::constants::FX_CONFIG_SEED;
use crate::errors::ClearPathError;
use crate::state::FxConfig;

/// Initialize an FX configuration PDA for a currency pair
pub fn init_fx_config(
    ctx: Context<InitFxConfig>,
    currency_pair: [u8; 6],
    rate: u64,
) -> Result<()> {
    require!(rate > 0, ClearPathError::InvalidFxRate);

    let config = &mut ctx.accounts.fx_config;
    let clock = Clock::get()?;

    config.currency_pair = currency_pair;
    config.rate = rate;
    config.last_updated = clock.unix_timestamp;
    config.authority = ctx.accounts.authority.key();
    config.bump = ctx.bumps.fx_config;

    emit!(FxRateUpdatedEvent {
        currency_pair,
        rate,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

/// Update the FX rate for an existing currency pair
pub fn update_fx_rate(ctx: Context<UpdateFxRate>, rate: u64) -> Result<()> {
    require!(rate > 0, ClearPathError::InvalidFxRate);

    let config = &mut ctx.accounts.fx_config;
    let clock = Clock::get()?;

    config.rate = rate;
    config.last_updated = clock.unix_timestamp;

    emit!(FxRateUpdatedEvent {
        currency_pair: config.currency_pair,
        rate,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(currency_pair: [u8; 6])]
pub struct InitFxConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + FxConfig::INIT_SPACE,
        seeds = [FX_CONFIG_SEED, currency_pair.as_ref()],
        bump,
    )]
    pub fx_config: Account<'info, FxConfig>,

    /// FX rate authority
    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateFxRate<'info> {
    #[account(
        mut,
        has_one = authority @ ClearPathError::Unauthorized,
    )]
    pub fx_config: Account<'info, FxConfig>,

    /// FX rate authority
    pub authority: Signer<'info>,
}

#[event]
pub struct FxRateUpdatedEvent {
    pub currency_pair: [u8; 6],
    pub rate: u64,
    pub timestamp: i64,
}
