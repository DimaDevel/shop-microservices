export class OrderNotFoundError extends Error {
  constructor(id: string) {
    super(`Order ${id} not found`);
    this.name = 'OrderNotFoundError';
  }
}

export class ProductServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductServiceError';
  }
}
