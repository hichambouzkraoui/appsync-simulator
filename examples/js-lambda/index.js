/**
 * Example JavaScript Lambda function for AppSync.
 *
 * This Lambda handles order-related operations invoked by the AppSync resolver.
 * It demonstrates how a JS Lambda datasource receives events from AppSync.
 *
 * Event format from AppSync:
 * {
 *   typeName: "Mutation",
 *   fieldName: "createOrder",
 *   arguments: { input: { ... } },
 *   source: null,
 *   identity: { sub: "...", username: "..." },
 *   request: { headers: { ... } },
 *   payload: { operation: "createOrder", payload: { ... } }
 * }
 */

// Simple in-memory store for demonstration
const orders = new Map();

/**
 * Main Lambda handler.
 * Routes based on the operation field in the payload.
 */
exports.handler = async (event, context) => {
  console.log('Lambda invoked:', JSON.stringify(event, null, 2));

  const { payload } = event;

  if (!payload || !payload.operation) {
    throw new Error('Missing operation in payload');
  }

  switch (payload.operation) {
    case 'createOrder':
      return createOrder(payload.payload, event);

    case 'getOrder':
      return getOrder(payload.payload);

    case 'validateUser':
      return validateUser(payload.payload);

    default:
      throw new Error(`Unknown operation: ${payload.operation}`);
  }
};

/**
 * Creates a new order.
 * Validates the input, generates an ID, and stores it.
 */
async function createOrder(data, event) {
  // Validate required fields
  if (!data.userId) {
    return { error: 'userId is required' };
  }

  if (!data.items || data.items.length === 0) {
    return { error: 'At least one item is required' };
  }

  // Validate each item
  for (const item of data.items) {
    if (!item.productId || !item.quantity || !item.price) {
      return { error: 'Each item must have productId, quantity, and price' };
    }
    if (item.quantity <= 0) {
      return { error: 'Item quantity must be positive' };
    }
    if (item.price <= 0) {
      return { error: 'Item price must be positive' };
    }
  }

  // Generate order ID
  const orderId = generateId();

  // Calculate total
  const total = data.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const order = {
    id: orderId,
    userId: data.userId,
    items: data.items,
    total: Math.round(total * 100) / 100,
    status: 'PENDING',
    createdAt: data.createdAt || new Date().toISOString(),
  };

  // Store the order (in-memory for demo; in production this would be DynamoDB)
  orders.set(orderId, order);

  console.log('Order created:', orderId);
  return order;
}

/**
 * Retrieves an order by ID.
 */
async function getOrder(data) {
  const order = orders.get(data.orderId);
  if (!order) {
    return { error: `Order ${data.orderId} not found` };
  }
  return order;
}

/**
 * Validates that a user exists and is active.
 * In a real app, this would check a user database.
 */
async function validateUser(data) {
  // Simulate user validation
  if (!data.userId) {
    return { valid: false, reason: 'userId is required' };
  }

  // For demo, all users with non-empty IDs are valid
  return {
    valid: true,
    userId: data.userId,
    checkedAt: new Date().toISOString(),
  };
}

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
