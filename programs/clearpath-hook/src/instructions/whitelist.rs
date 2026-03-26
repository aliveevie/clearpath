use anchor_lang::prelude::*;

use crate::constants::WHITELIST_SEED;
use crate::state::WhitelistEntry;

/// Add a wallet to the KYC whitelist
pub fn add_to_whitelist(
    ctx: Context<AddToWhitelist>,
    kyc_tier: u8,
    kyc_expiry: i64,
    region_code: [u8; 2],
) -> Result<()> {
    let entry = &mut ctx.accounts.whitelist_entry;
    entry.wallet = ctx.accounts.wallet.key();
    entry.kyc_tier = kyc_tier;
    entry.kyc_expiry = kyc_expiry;
    entry.region_code = region_code;
    entry.is_sanctioned = false;
    entry.bump = ctx.bumps.whitelist_entry;

    emit!(WhitelistUpdatedEvent {
        wallet: entry.wallet,
        kyc_tier,
        kyc_expiry,
        region_code,
        action: WhitelistAction::Added,
    });

    Ok(())
}

/// Update an existing whitelist entry
pub fn update_whitelist(
    ctx: Context<UpdateWhitelist>,
    kyc_tier: u8,
    kyc_expiry: i64,
    region_code: [u8; 2],
    is_sanctioned: bool,
) -> Result<()> {
    let entry = &mut ctx.accounts.whitelist_entry;
    entry.kyc_tier = kyc_tier;
    entry.kyc_expiry = kyc_expiry;
    entry.region_code = region_code;
    entry.is_sanctioned = is_sanctioned;

    emit!(WhitelistUpdatedEvent {
        wallet: entry.wallet,
        kyc_tier,
        kyc_expiry,
        region_code,
        action: if is_sanctioned {
            WhitelistAction::Sanctioned
        } else {
            WhitelistAction::Updated
        },
    });

    Ok(())
}

/// Remove a wallet from the whitelist (closes the PDA)
pub fn remove_from_whitelist(ctx: Context<RemoveFromWhitelist>) -> Result<()> {
    emit!(WhitelistUpdatedEvent {
        wallet: ctx.accounts.whitelist_entry.wallet,
        kyc_tier: 0,
        kyc_expiry: 0,
        region_code: [0; 2],
        action: WhitelistAction::Removed,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct AddToWhitelist<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + WhitelistEntry::INIT_SPACE,
        seeds = [WHITELIST_SEED, wallet.key().as_ref()],
        bump,
    )]
    pub whitelist_entry: Account<'info, WhitelistEntry>,

    /// The wallet to whitelist
    /// CHECK: Any valid public key can be whitelisted
    pub wallet: UncheckedAccount<'info>,

    /// Compliance admin authority
    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateWhitelist<'info> {
    #[account(
        mut,
        seeds = [WHITELIST_SEED, whitelist_entry.wallet.as_ref()],
        bump = whitelist_entry.bump,
    )]
    pub whitelist_entry: Account<'info, WhitelistEntry>,

    /// Compliance admin authority
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct RemoveFromWhitelist<'info> {
    #[account(
        mut,
        close = authority,
        seeds = [WHITELIST_SEED, whitelist_entry.wallet.as_ref()],
        bump = whitelist_entry.bump,
    )]
    pub whitelist_entry: Account<'info, WhitelistEntry>,

    /// Compliance admin authority (receives rent back)
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[event]
pub struct WhitelistUpdatedEvent {
    pub wallet: Pubkey,
    pub kyc_tier: u8,
    pub kyc_expiry: i64,
    pub region_code: [u8; 2],
    pub action: WhitelistAction,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum WhitelistAction {
    Added,
    Updated,
    Removed,
    Sanctioned,
}
