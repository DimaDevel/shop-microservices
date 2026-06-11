export class PaymentDeclinedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'PaymentDeclinedError';
  }
}

export class InsufficientFundsError extends Error {
  constructor(available: number, required: number) {
    super(`Insufficient funds: available ${available}, required ${required}`);
    this.name = 'InsufficientFundsError';
  }
}
