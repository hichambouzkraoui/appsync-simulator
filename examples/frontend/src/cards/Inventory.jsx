import React, { useState } from 'react';
import { gql } from '../graphql';
import { ResultBox } from './ResultBox';

export function InventoryCard() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reservationId, setReservationId] = useState('');

  const run = async (query) => {
    setLoading(true);
    const res = await gql(query);
    setResult(res);
    const id = res?.data?.reserveStock?.reservationId;
    if (id) setReservationId(id);
    setLoading(false);
  };

  return (
    <div className="card">
      <h3>📊 Inventory (Java Lambda)</h3>
      <button onClick={() => run(`{ checkStock(productId: "prod-001") { productId productName totalStock reserved available inStock } }`)}>Check prod-001</button>
      <button onClick={() => run(`{ checkStock(productId: "prod-002") { productId productName available inStock } }`)}>Check prod-002</button>
      <button onClick={() => run(`mutation { reserveStock(input: { productId: "prod-001", orderId: "order-99", quantity: 5 }) { reservationId productId quantity status createdAt } }`)}>Reserve 5</button>
      <button disabled={!reservationId} onClick={() => run(`mutation { releaseStock(reservationId: "${reservationId}") { reservationId status releasedAt } }`)}>Release Last</button>
      <button onClick={() => run(`mutation { adjustStock(input: { productId: "prod-003", adjustment: 10, reason: "Restock delivery" }) { productId previousStock adjustment currentStock reason } }`)}>Adjust +10</button>
      <ResultBox data={result} loading={loading} />
    </div>
  );
}
