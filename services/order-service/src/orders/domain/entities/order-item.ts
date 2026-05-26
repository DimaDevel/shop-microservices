export class OrderItem {
  constructor(
    readonly id: string,
    readonly productId: string,
    readonly productName: string,
    readonly quantity: number,
    readonly unitPrice: number,
  ) {}
}
