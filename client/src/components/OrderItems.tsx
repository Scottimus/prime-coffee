import type { OrderItem } from '../types';

export function OrderItems({ items }: { items: OrderItem[] }) {
  return (
    <ul className="items">
      {items.map((i) => (
        <li key={i.id}>
          <strong>{i.quantity}×</strong> {i.name}
          {i.notes && <span className="note"> · {i.notes}</span>}
        </li>
      ))}
    </ul>
  );
}
