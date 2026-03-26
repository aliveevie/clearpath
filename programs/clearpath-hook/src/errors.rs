use anchor_lang::prelude::*;

#[error_code]
pub enum ClearPathError {
    #[msg("Wallet is not whitelisted — KYC required")]
    NotWhitelisted,

    #[msg("KYC verification has expired")]
    KycExpired,

    #[msg("Transfer rejected — sanctioned jurisdiction")]
    SanctionedRegion,

    #[msg("Travel Rule record required for this transfer amount")]
    TravelRuleViolation,

    #[msg("Unauthorized — admin signature required")]
    Unauthorized,

    #[msg("Invalid FX rate data")]
    InvalidFxRate,

    #[msg("Insufficient signers for multi-sig authorization")]
    InsufficientSigners,

    #[msg("Timelock has not expired")]
    TimelockNotExpired,

    #[msg("Invalid extra account metas")]
    InvalidExtraAccountMetas,
}
