use anchor_lang::prelude::*;
use spl_discriminator::SplDiscriminate;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("H1GnvpH6ExjedB3uDsB3UF2aNRKtTj7R7Zp14f4qzkem");

#[program]
pub mod clearpath_hook {
    use super::*;

    // ── Transfer Hook (called by Token-2022 runtime) ──

    #[instruction(discriminator = spl_transfer_hook_interface::instruction::ExecuteInstruction::SPL_DISCRIMINATOR_SLICE)]
    pub fn execute(ctx: Context<TransferHookExecute>, amount: u64) -> Result<()> {
        instructions::transfer_hook::execute_transfer_hook(ctx, amount)
    }

    pub fn initialize_extra_account_metas(
        ctx: Context<InitializeExtraAccountMetas>,
    ) -> Result<()> {
        instructions::transfer_hook::initialize_extra_account_metas(ctx)
    }

    // ── Whitelist Management (admin-gated) ──

    pub fn add_to_whitelist(
        ctx: Context<AddToWhitelist>,
        kyc_tier: u8,
        kyc_expiry: i64,
        region_code: [u8; 2],
    ) -> Result<()> {
        instructions::whitelist::add_to_whitelist(ctx, kyc_tier, kyc_expiry, region_code)
    }

    pub fn update_whitelist(
        ctx: Context<UpdateWhitelist>,
        kyc_tier: u8,
        kyc_expiry: i64,
        region_code: [u8; 2],
        is_sanctioned: bool,
    ) -> Result<()> {
        instructions::whitelist::update_whitelist(ctx, kyc_tier, kyc_expiry, region_code, is_sanctioned)
    }

    pub fn remove_from_whitelist(ctx: Context<RemoveFromWhitelist>) -> Result<()> {
        instructions::whitelist::remove_from_whitelist(ctx)
    }

    // ── Travel Rule (post-transfer recording) ──

    pub fn record_travel_rule(
        ctx: Context<RecordTravelRule>,
        tx_signature: [u8; 64],
        amount: u64,
        currency_pair: [u8; 6],
        sender_vasp: Pubkey,
        receiver_vasp: Pubkey,
        encrypted_payload: [u8; 256],
    ) -> Result<()> {
        instructions::travel_rule::record_travel_rule(
            ctx,
            tx_signature,
            amount,
            currency_pair,
            sender_vasp,
            receiver_vasp,
            encrypted_payload,
        )
    }

    // ── FX Configuration ──

    pub fn init_fx_config(
        ctx: Context<InitFxConfig>,
        currency_pair: [u8; 6],
        rate: u64,
    ) -> Result<()> {
        instructions::fx_config::init_fx_config(ctx, currency_pair, rate)
    }

    pub fn update_fx_rate(ctx: Context<UpdateFxRate>, rate: u64) -> Result<()> {
        instructions::fx_config::update_fx_rate(ctx, rate)
    }
}

/// Transfer Hook fallback — required for Token-2022 to route CPI calls to execute().
/// Token-2022 calls the hook program with the spl-transfer-hook-interface discriminator.
/// This fallback catches those calls and dispatches to our execute handler.
pub fn fallback<'info>(
    program_id: &Pubkey,
    accounts: &'info [AccountInfo<'info>],
    data: &[u8],
) -> Result<()> {
    use spl_transfer_hook_interface::instruction::ExecuteInstruction;
    use spl_discriminator::SplDiscriminate;

    let instruction_discriminator = &data[..8];

    // Check if this is the spl-transfer-hook-interface execute instruction
    if instruction_discriminator == ExecuteInstruction::SPL_DISCRIMINATOR_SLICE {
        // Route to our execute handler via Anchor's instruction dispatch
        return __private::__global::execute(program_id, accounts, &data[8..]);
    }

    Err(ProgramError::InvalidInstructionData.into())
}
