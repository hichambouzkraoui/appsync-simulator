import React, { useState } from 'react';
import { gql } from '../graphql';
import { ResultBox } from './ResultBox';

export function NotificationsCard() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async (query) => {
    setLoading(true);
    setResult(await gql(query));
    setLoading(false);
  };

  return (
    <div className="card">
      <h3>🔔 Notifications (Python Lambda)</h3>
      <button onClick={() => run(`mutation { sendNotification(input: { userId: "user-1", channel: EMAIL, subject: "Welcome!", message: "Thanks for signing up" }) { id channel subject status sentAt } }`)}>Send Email</button>
      <button onClick={() => run(`mutation { sendNotification(input: { userId: "user-1", channel: PUSH, message: "Your order has shipped!" }) { id channel status } }`)}>Send Push</button>
      <button onClick={() => run(`mutation { sendNotification(input: { userId: "user-1", channel: SMS, message: "Code: 847291" }) { id channel status } }`)}>Send SMS</button>
      <button onClick={() => run(`{ listNotifications(userId: "user-1") { id channel subject message status sentAt } }`)}>List All</button>
      <ResultBox data={result} loading={loading} />
    </div>
  );
}
