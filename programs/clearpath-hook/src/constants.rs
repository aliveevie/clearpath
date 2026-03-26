/// Travel Rule threshold in lamports (1,000 USDC = 1_000 * 10^6)
pub const TRAVEL_RULE_THRESHOLD: u64 = 1_000_000_000;

/// PDA seed prefixes
pub const WHITELIST_SEED: &[u8] = b"kyc";
pub const TRAVEL_RULE_SEED: &[u8] = b"travel";
pub const FX_CONFIG_SEED: &[u8] = b"fx";
pub const EXTRA_ACCOUNT_METAS_SEED: &[u8] = b"extra-account-metas";
