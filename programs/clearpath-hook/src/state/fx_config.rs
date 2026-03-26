use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct FxConfig {
    /// Currency pair identifier (e.g. b"USDCHF")
    pub currency_pair: [u8; 6],

    /// FX rate as fixed-point with 6 decimal places (e.g. 883_450 = 0.883450 CHF/USD)
    pub rate: u64,

    /// Unix timestamp of last rate update
    pub last_updated: i64,

    /// Authority allowed to update the FX rate
    pub authority: Pubkey,

    /// PDA bump seed
    pub bump: u8,
}
