import React, { useState } from 'react';
import { gql } from '../graphql';
import { ResultBox } from './ResultBox';

export function PaymentsCard() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [paymentId, setPaymentId] = useState('');

  const run = async (query) => {
    setLoading(true);
    const res = await gql(query);
    setResult(res);
    const id = res?.data?.chargePayment?.id;
    if (id) setPaymentId(id);
    setLoading(false);
  };

  return (
    <div className="card">
      <h3>💳 Payments (.NET Lambda)</h3>
      <button onClick={() => run(`mutation { chargePayment(input: { orderId: "order-1", amount: 99.99, currency: "USD", paymentMethod: "visa_4242" }) { id orderId amount status transactionId createdAt } }`)}>Charge $99.99</button>
      <button onClick={() => run(`{ listPayments(orderId: "order-1") { id amount currency status transactionId } }`)}>List for order-1</button>
      <button disabled={!paymentId} onClick={() => run(`mutation { refundPayment(input: { paymentId: "${paymentId}", reason: "Customer request" }) { id status refundedAt refundReason } }`)}>Refund Last</button>
      <button onClick={() => run(`mutation { chargePayment(input: { orderId: "order-2", amount: 15000, currency: "USD", paymentMethod: "visa" }) { id status } }`)}>Charge $15k (fail)</button>
      <ResultBox data={result} loading={loading} />
    </div>
  );
}
