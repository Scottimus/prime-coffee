import type { MenuItem } from '../types';

export interface CartLine {
  menuItemId: number;
  name: string;
  unitPriceCents: number;
  quantity: number;
  notes: string;
}

export type CartAction =
  | { type: 'add'; item: MenuItem }
  | { type: 'decrement'; menuItemId: number }
  | { type: 'remove'; menuItemId: number }
  | { type: 'notes'; menuItemId: number; notes: string }
  | { type: 'clear' };

export function cartReducer(cart: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case 'add': {
      const existing = cart.find((l) => l.menuItemId === action.item.id);
      if (existing) {
        return cart.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...cart,
        { menuItemId: action.item.id, name: action.item.name, unitPriceCents: action.item.priceCents, quantity: 1, notes: '' },
      ];
    }
    case 'decrement':
      return cart
        .map((l) => (l.menuItemId === action.menuItemId ? { ...l, quantity: l.quantity - 1 } : l))
        .filter((l) => l.quantity > 0);
    case 'remove':
      return cart.filter((l) => l.menuItemId !== action.menuItemId);
    case 'notes':
      return cart.map((l) => (l.menuItemId === action.menuItemId ? { ...l, notes: action.notes } : l));
    case 'clear':
      return [];
  }
}

export const cartTotal = (cart: CartLine[]) => cart.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
export const cartCount = (cart: CartLine[]) => cart.reduce((s, l) => s + l.quantity, 0);
