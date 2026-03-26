use anchor_lang::prelude::*;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta,
    seeds::Seed,
    state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

use crate::constants::*;
use crate::errors::ClearPathError;
use crate::state::WhitelistEntry;

/// Called by Token-2022 on every transfer. Enforces KYC, sanctions, and travel rule.
pub fn execute_transfer_hook(ctx: Context<TransferHookExecute>, amount: u64) -> Result<()> {
    let sender_whitelist = &ctx.accounts.sender_whitelist;
    let receiver_whitelist = &ctx.accounts.receiver_whitelist;
    let clock = Clock::get()?;
    let destination_data = ctx.accounts.destination.try_borrow_data()?;

    require!(
        destination_data.len() >= 64,
        ClearPathError::InvalidExtraAccountMetas
    );

    let destination_owner = Pubkey::new_from_array(
        destination_data[32..64]
            .try_into()
            .map_err(|_| error!(ClearPathError::InvalidExtraAccountMetas))?,
    );

    // 1. Verify sender KYC
    require!(!sender_whitelist.is_sanctioned, ClearPathError::SanctionedRegion);
    require!(
        sender_whitelist.kyc_expiry > clock.unix_timestamp,
        ClearPathError::KycExpired
    );
    require_keys_eq!(
        sender_whitelist.wallet,
        ctx.accounts.owner.key(),
        ClearPathError::InvalidExtraAccountMetas
    );

    // 2. Verify receiver KYC
    require!(!receiver_whitelist.is_sanctioned, ClearPathError::SanctionedRegion);
    require!(
        receiver_whitelist.kyc_expiry > clock.unix_timestamp,
        ClearPathError::KycExpired
    );
    require_keys_eq!(
        receiver_whitelist.wallet,
        destination_owner,
        ClearPathError::InvalidExtraAccountMetas
    );

    // 3. Travel Rule — emit event if amount exceeds threshold
    //    (Record creation happens post-transfer via backend calling record_travel_rule)
    if amount >= TRAVEL_RULE_THRESHOLD {
        emit!(ComplianceTransferEvent {
            sender: sender_whitelist.wallet,
            receiver: receiver_whitelist.wallet,
            amount,
            sender_region: sender_whitelist.region_code,
            receiver_region: receiver_whitelist.region_code,
            requires_travel_rule: true,
            timestamp: clock.unix_timestamp,
        });
    } else {
        emit!(ComplianceTransferEvent {
            sender: sender_whitelist.wallet,
            receiver: receiver_whitelist.wallet,
            amount,
            sender_region: sender_whitelist.region_code,
            receiver_region: receiver_whitelist.region_code,
            requires_travel_rule: false,
            timestamp: clock.unix_timestamp,
        });
    }

    Ok(())
}

/// Initialize the ExtraAccountMeta list — tells Token-2022 which additional accounts
/// the hook needs when `execute` is called.
pub fn initialize_extra_account_metas(
    ctx: Context<InitializeExtraAccountMetas>,
) -> Result<()> {
    let extra_metas = vec![
        // Sender whitelist PDA: seeds = ["kyc", source_token_account_owner]
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal { bytes: WHITELIST_SEED.to_vec() },
                Seed::AccountKey { index: 3 }, // owner/source authority
            ],
            false, // is_signer
            false, // is_writable
        )?,
        // Receiver whitelist PDA: derive from the destination token account owner.
        // SPL token account layout stores owner at byte offset 32..64, so we
        // resolve that 32-byte slice from account data rather than the token
        // account pubkey itself.
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal { bytes: WHITELIST_SEED.to_vec() },
                Seed::AccountData {
                    account_index: 2, // destination token account
                    data_index: 32,   // token account owner offset
                    length: 32,
                },
            ],
            false,
            false,
        )?,
    ];

    let account_info = ctx.accounts.extra_account_metas.to_account_info();
    let mut data = account_info.try_borrow_mut_data()?;

    ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &extra_metas)?;

    Ok(())
}

#[derive(Accounts)]
pub struct TransferHookExecute<'info> {
    /// Source token account
    /// CHECK: Token-2022 validates this
    pub source: UncheckedAccount<'info>,

    /// The Token-2022 mint
    /// CHECK: Token-2022 validates this
    pub mint: UncheckedAccount<'info>,

    /// Destination token account
    /// CHECK: Token-2022 validates this
    pub destination: UncheckedAccount<'info>,

    /// Source token account owner/authority
    /// CHECK: Token-2022 validates this
    pub owner: UncheckedAccount<'info>,

    /// Extra account metas PDA
    /// CHECK: Validated by Token-2022 transfer hook infrastructure
    #[account(
        seeds = [EXTRA_ACCOUNT_METAS_SEED, mint.key().as_ref()],
        bump,
    )]
    pub extra_account_metas: UncheckedAccount<'info>,

    /// Sender's whitelist entry PDA
    #[account(
        seeds = [WHITELIST_SEED, owner.key().as_ref()],
        bump = sender_whitelist.bump,
    )]
    pub sender_whitelist: Account<'info, WhitelistEntry>,

    /// Receiver's whitelist entry PDA
    pub receiver_whitelist: Account<'info, WhitelistEntry>,
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetas<'info> {
    /// The extra account metas PDA to initialize
    /// CHECK: We initialize this account with ExtraAccountMetaList data
    #[account(
        init,
        payer = payer,
        seeds = [EXTRA_ACCOUNT_METAS_SEED, mint.key().as_ref()],
        bump,
        space = ExtraAccountMetaList::size_of(2)? + 8, // 2 extra metas
    )]
    pub extra_account_metas: UncheckedAccount<'info>,

    /// The Token-2022 mint
    /// CHECK: Used as seed for the extra account metas PDA
    pub mint: UncheckedAccount<'info>,

    /// Authority / payer
    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[event]
pub struct ComplianceTransferEvent {
    pub sender: Pubkey,
    pub receiver: Pubkey,
    pub amount: u64,
    pub sender_region: [u8; 2],
    pub receiver_region: [u8; 2],
    pub requires_travel_rule: bool,
    pub timestamp: i64,
}
