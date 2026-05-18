export interface CreateProductInput {
  name: string;
  description?: string;
  price: number;
  stock: number;
}

export interface UpdateProductInput {
  name?: string;
  description?: string;
  price?: number;
  stock?: number;
}

export interface ReserveStockItem {
  productId: string;
  quantity: number;
}

export interface ReserveStockInput {
  items: ReserveStockItem[];
}
