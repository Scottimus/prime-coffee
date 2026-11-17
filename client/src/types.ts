export type Role = 'cashier' | 'barista' | 'manager';
export type OrderStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  active?: boolean;
}

export interface MenuItem {
  id: number;
  name: string;
  category: string;
  priceCents: number;
  active: boolean;
}

export interface StaffRef {
  id: number;
  name: string;
}

export interface OrderItem {
  id: number;
  menuItemId: number;
  name: string;
  quantity: number;
  unitPriceCents: number;
  notes: string | null;
}

export interface Order {
  id: number;
  customerName: string;
  notes: string | null;
  status: OrderStatus;
  totalCents: number;
  items: OrderItem[];
  createdBy: StaffRef;
  startedBy: StaffRef | null;
  completedBy: StaffRef | null;
  cancelledBy: StaffRef | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
}

export interface OrderEvent {
  orderId: number;
  type: string;
  actor: { id: number; name: string; role: Role };
  at: string;
  meta?: Record<string, unknown>;
}

export interface BaristaStats {
  id: number;
  name: string;
  active: boolean;
  completed: number;
  revenueCents: number;
  avgPrepSeconds: number | null;
  lastCompletedAt: string | null;
}
