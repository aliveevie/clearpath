use anchor_lang::prelude::*;

pub const MAX_SIGNERS: usize = 5;

#[account]
#[derive(InitSpace)]
pub struct TreasuryVault {
    /// Institution identifier (could be a hash of institution name or registration)
    pub institution_id: Pubkey,

    /// Primary authority for the vault
    pub authority: Pubkey,

    /// Multi-sig signers (up to 5)
    #[max_len(5)]
    pub signers: Vec<Pubkey>,

    /// Required number of signers for withdrawals
    pub threshold: u8,

    /// Total deposited amount tracked off-chain reconciliation
    pub total_deposited: u64,

    /// Total withdrawn amount
    pub total_withdrawn: u64,

    /// Unix timestamp of last activity
    pub last_activity: i64,

    /// PDA bump seed
    pub bump: u8,
}
