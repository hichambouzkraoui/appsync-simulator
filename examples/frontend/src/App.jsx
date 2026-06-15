import React from 'react';
import { ProductsCard } from './cards/Products';
import { OrdersCard } from './cards/Orders';
import { PaymentsCard } from './cards/Payments';
import { InventoryCard } from './cards/Inventory';
import { NotificationsCard } from './cards/Notifications';
import { UsersCard } from './cards/Users';

export default function App() {
  return (
    <>
      <h1>🚀 AppSync Simulator — E2E Dashboard</h1>
      <div className="grid">
        <ProductsCard />
        <OrdersCard />
        <PaymentsCard />
        <InventoryCard />
        <NotificationsCard />
        <UsersCard />
      </div>
    </>
  );
}
