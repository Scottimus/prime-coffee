import { describe, expect, it } from 'vitest';
import { cartCount, cartReducer, cartTotal } from './cart';
import type { MenuItem } from '../types';

const latte: MenuItem = { id: 1, name: 'Latte', category: 'coffee', priceCents: 475, active: true };
const muffin: MenuItem = { id: 2, name: 'Muffin', category: 'food', priceCents: 350, active: true };

describe('cartReducer', () => {
  it('adds items and bumps quantity on repeat', () => {
    let cart = cartReducer([], { type: 'add', item: latte });
    cart = cartReducer(cart, { type: 'add', item: latte });
    cart = cartReducer(cart, { type: 'add', item: muffin });
    expect(cart).toHaveLength(2);
    expect(cart[0].quantity).toBe(2);
    expect(cartCount(cart)).toBe(3);
    expect(cartTotal(cart)).toBe(475 * 2 + 350);
  });

  it('drops a line when decremented to zero', () => {
    let cart = cartReducer([], { type: 'add', item: latte });
    cart = cartReducer(cart, { type: 'decrement', menuItemId: 1 });
    expect(cart).toEqual([]);
  });

  it('sets notes and clears', () => {
    let cart = cartReducer([], { type: 'add', item: latte });
    cart = cartReducer(cart, { type: 'notes', menuItemId: 1, notes: 'oat milk' });
    expect(cart[0].notes).toBe('oat milk');
    expect(cartReducer(cart, { type: 'clear' })).toEqual([]);
  });
});
