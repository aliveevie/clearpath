use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct TravelRuleRecord {
    /// Transaction signature that triggered this record
    pub tx_signature: [u8; 64],

    /// Transfer amount in token lamports
    pub amount: u64,

    /// Currency pair (e.g. b"USDCHF")
    pub currency_pair: [u8; 6],

    /// Sender VASP (bank/custodian) public key
    pub sender_vasp: Pubkey,

    /// Receiver VASP (bank/custodian) public key
    pub receiver_vasp: Pubkey,

    /// AES-256 encrypted sender/receiver PII payload
    pub encrypted_payload: [u8; 256],

    /// Unix timestamp of the record creation
    pub timestamp: i64,

    /// PDA bump seed
    pub bump: u8,
}
