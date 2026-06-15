import React from 'react';

export function ResultBox({ data, loading }) {
  if (loading) return <div className="loading">Loading...</div>;
  if (!data) return null;
  const hasError = data.errors;
  return (
    <div className={`result ${hasError ? 'error' : 'success'}`}>
      {JSON.stringify(data, null, 2)}
    </div>
  );
}
