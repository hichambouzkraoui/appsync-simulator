import React, { useState } from 'react';
import { gql } from '../graphql';
import { ResultBox } from './ResultBox';

export function ProductsCard() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async (query) => {
    setLoading(true);
    setResult(await gql(query));
    setLoading(false);
  };

  return (
    <div className="card">
      <h3>📦 Products (JS Lambda)</h3>
      <button onClick={() => run('{ listProducts { id name price category stock } }')}>List All</button>
      <button onClick={() => run('{ listProducts(category: "Electronics") { id name price } }')}>Electronics</button>
      <button onClick={() => run('{ searchProducts(query: "shoes") { id name price } }')}>Search "shoes"</button>
      <button onClick={() => run('{ getProduct(id: "prod-001") { id name description price stock } }')}>Get prod-001</button>
      <button onClick={() => run(`mutation { createProduct(input: { name: "Bluetooth Speaker", price: 79.99, category: "Electronics", stock: 25 }) { id name price category } }`)}>Create Product</button>
      <ResultBox data={result} loading={loading} />
    </div>
  );
}
