export const ROLES = ['cashier', 'barista', 'manager'] as const;
export type Role = (typeof ROLES)[number];

export const ORDER_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}
