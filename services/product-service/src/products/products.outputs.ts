export interface ProductResult {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  stock: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReservedItemResult {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

export interface ReserveStockResult {
  items: ReservedItemResult[];
}
