use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    NegativeSupply = 3,
    CapBelowSupply = 4,
    Paused = 5,
    InvalidAmount = 6,
    SelfTransfer = 7,
    InsufficientBalance = 8,
    BalanceOverflow = 9,
    SupplyOverflow = 10,
    SupplyUnderflow = 11,
    SupplyCapExceeded = 12,
    NegativeAllowance = 13,
    SelfApprove = 14,
    InsufficientAllowance = 15,
    AllowanceUnderflow = 16,
    Unauthorized = 17,
    NoPendingAdmin = 18,
    // Metadata errors
    EmptyMetadata = 19,
    // Allowance errors
    AllowanceDecreaseExceedsCurrent = 20,
    AllowanceOverflow = 21,
}