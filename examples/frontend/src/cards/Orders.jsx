import React, { useState } from 'react';
import { gql } from '../graphql';
import { ResultBox } from './ResultBox';

export function OrdersCard() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async (query) => {
    setLoading(true);
    setResult(await gql(query));
    setLoading(false);
  };

  return (
    <div className="card">
      <h3>🛒 Orders (JS + .NET Lambda)</h3>
      <button onClick={() => run(`mutation { createOrder(input: { userId: "user-1", items: [{ productId: "prod-001", quantity: 2, price: 199.99 }, { productId: "prod-003", quantity: 1, price: 49.99 }] }) { id userId total status createdAt } }`)}>Create Order</button>
      <button onClick={() => run(`mutation { processOrder(id: "order-1") { id status createdAt } }`)}>Process Order</button>
      <ResultBox data={result} loading={loading} />
    </div>
  );
}
