use anchor_lang::prelude::*;

use crate::constants::TRAVEL_RULE_SEED;
use crate::state::TravelRuleRecord;

/// Record a Travel Rule entry post-transfer (called by backend after a compliant transfer
/// that exceeded the threshold). This is separated from execute() because the Transfer Hook
/// CPI context cannot create new accounts.
pub fn record_travel_rule(
    ctx: Context<RecordTravelRule>,
    tx_signature: [u8; 64],
    amount: u64,
    currency_pair: [u8; 6],
    sender_vasp: Pubkey,
    receiver_vasp: Pubkey,
    encrypted_payload: [u8; 256],
) -> Result<()> {
    let record = &mut ctx.accounts.travel_rule_record;
    let clock = Clock::get()?;

    record.tx_signature = tx_signature;
    record.amount = amount;
    record.currency_pair = currency_pair;
    record.sender_vasp = sender_vasp;
    record.receiver_vasp = receiver_vasp;
    record.encrypted_payload = encrypted_payload;
    record.timestamp = clock.unix_timestamp;
    record.bump = ctx.bumps.travel_rule_record;

    emit!(TravelRuleRecordedEvent {
        tx_signature,
        amount,
        currency_pair,
        sender_vasp,
        receiver_vasp,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(tx_signature: [u8; 64])]
pub struct RecordTravelRule<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + TravelRuleRecord::INIT_SPACE,
        seeds = [TRAVEL_RULE_SEED, &tx_signature[..32]],
        bump,
    )]
    pub travel_rule_record: Account<'info, TravelRuleRecord>,

    /// Compliance admin authority
    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[event]
pub struct TravelRuleRecordedEvent {
    pub tx_signature: [u8; 64],
    pub amount: u64,
    pub currency_pair: [u8; 6],
    pub sender_vasp: Pubkey,
    pub receiver_vasp: Pubkey,
    pub timestamp: i64,
}
