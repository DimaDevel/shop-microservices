import { Order, OrderStatus } from './order';
import { OrderItem } from './order-item';
import { InvalidOrderTransitionError } from '../errors/orders.errors';

const makeOrder = (status: OrderStatus = OrderStatus.PENDING): Order =>
  new Order('order-1', 'user-1', 'user@example.com', status, 0, [
    new OrderItem('item-1', 'prod-1', '', 2, 0),
  ], new Date(), new Date());

describe('Order', () => {
  describe('create', () => {
    it('produces PENDING status and zero total', () => {
      const data = Order.create('user-1', 'user@example.com', [{ productId: 'prod-1', quantity: 2 }]);
      expect(data.status).toBe(OrderStatus.PENDING);
      expect(data.total).toBe(0);
      expect(data.items).toHaveLength(1);
      expect(data.items[0].productName).toBe('');
      expect(data.items[0].unitPrice).toBe(0);
    });
  });

  describe('confirm', () => {
    it('transitions PENDING → CONFIRMED and fills in item details', () => {
      const order = makeOrder(OrderStatus.PENDING);
      const confirmed = order.confirm(49.98, [{ productId: 'prod-1', name: 'Widget', unitPrice: 24.99 }]);

      expect(confirmed.status).toBe(OrderStatus.CONFIRMED);
      expect(confirmed.total).toBe(49.98);
      expect(confirmed.items[0].productName).toBe('Widget');
      expect(confirmed.items[0].unitPrice).toBe(24.99);
    });

    it('returns a new Order instance (immutability)', () => {
      const order = makeOrder();
      const confirmed = order.confirm(10, [{ productId: 'prod-1', name: 'Widget', unitPrice: 10 }]);
      expect(confirmed).not.toBe(order);
      expect(order.status).toBe(OrderStatus.PENDING);
    });

    it('throws InvalidOrderTransitionError when not PENDING', () => {
      const order = makeOrder(OrderStatus.CONFIRMED);
      expect(() => order.confirm(10, [])).toThrow(InvalidOrderTransitionError);
    });

    it('throws when already CANCELLED', () => {
      const order = makeOrder(OrderStatus.CANCELLED);
      expect(() => order.confirm(10, [])).toThrow(InvalidOrderTransitionError);
    });
  });

  describe('cancel', () => {
    it('transitions PENDING → CANCELLED', () => {
      const order = makeOrder(OrderStatus.PENDING);
      const cancelled = order.cancel();
      expect(cancelled.status).toBe(OrderStatus.CANCELLED);
    });

    it('returns a new Order instance (immutability)', () => {
      const order = makeOrder();
      const cancelled = order.cancel();
      expect(cancelled).not.toBe(order);
      expect(order.status).toBe(OrderStatus.PENDING);
    });

    it('throws InvalidOrderTransitionError when CONFIRMED', () => {
      const order = makeOrder(OrderStatus.CONFIRMED);
      expect(() => order.cancel()).toThrow(InvalidOrderTransitionError);
    });

    it('throws InvalidOrderTransitionError when COMPLETED', () => {
      const order = makeOrder(OrderStatus.COMPLETED);
      expect(() => order.cancel()).toThrow(InvalidOrderTransitionError);
    });
  });

  describe('compensate', () => {
    it('transitions CONFIRMED → CANCELLED (saga compensation path)', () => {
      const order = makeOrder(OrderStatus.CONFIRMED);
      const cancelled = order.compensate();
      expect(cancelled.status).toBe(OrderStatus.CANCELLED);
    });

    it('transitions PENDING → CANCELLED', () => {
      const order = makeOrder(OrderStatus.PENDING);
      const cancelled = order.compensate();
      expect(cancelled.status).toBe(OrderStatus.CANCELLED);
    });

    it('throws InvalidOrderTransitionError when COMPLETED', () => {
      const order = makeOrder(OrderStatus.COMPLETED);
      expect(() => order.compensate()).toThrow(InvalidOrderTransitionError);
    });

    it('throws InvalidOrderTransitionError when already CANCELLED', () => {
      const order = makeOrder(OrderStatus.CANCELLED);
      expect(() => order.compensate()).toThrow(InvalidOrderTransitionError);
    });
  });
});
