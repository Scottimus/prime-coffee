import type { OrderStatus } from '../types';

const LABELS: Record<OrderStatus, string> = {
  pending: 'Waiting',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`badge badge-${status}`}>{LABELS[status]}</span>;
}
