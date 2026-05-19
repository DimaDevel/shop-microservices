export class PaymentDeclinedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'PaymentDeclinedError';
  }
}
