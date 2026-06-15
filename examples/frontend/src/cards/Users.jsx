import React, { useState } from 'react';
import { gql } from '../graphql';
import { ResultBox } from './ResultBox';

export function UsersCard() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async (query) => {
    setLoading(true);
    setResult(await gql(query));
    setLoading(false);
  };

  return (
    <div className="card">
      <h3>👤 Users (VTL + DynamoDB)</h3>
      <button onClick={() => run(`mutation { createUser(input: { name: "Alice Smith", email: "alice@example.com" }) { id name email createdAt } }`)}>Create User</button>
      <button onClick={() => run(`{ listUsers { id name email createdAt } }`)}>List Users</button>
      <button onClick={() => run(`mutation { updateUser(id: "user-1", input: { name: "Updated Name", email: "new@email.com" }) { id name email updatedAt } }`)}>Update User</button>
      <ResultBox data={result} loading={loading} />
    </div>
  );
}
