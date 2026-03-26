use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct WhitelistEntry {
    /// The wallet address this KYC entry applies to
    pub wallet: Pubkey,

    /// KYC tier: 1 = basic (individual), 2 = institutional
    pub kyc_tier: u8,

    /// Unix timestamp when KYC verification expires
    pub kyc_expiry: i64,

    /// ISO 3166-1 alpha-2 region code (e.g. b"CH", b"DE", b"US")
    pub region_code: [u8; 2],

    /// Whether the wallet is flagged as sanctioned
    pub is_sanctioned: bool,

    /// PDA bump seed
    pub bump: u8,
}
