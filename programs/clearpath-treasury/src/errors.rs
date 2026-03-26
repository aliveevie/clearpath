use anchor_lang::prelude::*;

#[error_code]
pub enum TreasuryError {
    #[msg("Unauthorized — only the vault authority can perform this action")]
    Unauthorized,

    #[msg("Insufficient signers for multi-sig threshold")]
    InsufficientSigners,

    #[msg("Invalid threshold — must be > 0 and <= number of signers")]
    InvalidThreshold,

    #[msg("Insufficient vault balance")]
    InsufficientBalance,

    #[msg("Invalid FX rate — rate must be positive")]
    InvalidFxRate,

    #[msg("Too many signers — maximum is 5")]
    TooManySigners,
}
