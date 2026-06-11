/**
 * Product Catalog Lambda (JavaScript)
 *
 * Handles all product catalog operations: get, list, search, create, update, delete.
 * Uses an in-memory store for local simulation.
 *
 * Event format from AppSync resolver:
 * {
 *   typeName: "Query" | "Mutation",
 *   fieldName: "getProduct" | "listProducts" | ...,
 *   arguments: { ... },
 *   payload: { operation: "...", payload: { ... } }
 * }
 */

// In-memory product store seeded with sample data
const products = new Map([
  ['prod-001', { id: 'prod-001', name: 'Wireless Headphones', description: 'Premium noise-cancelling headphones', price: 199.99, category: 'Electronics', stock: 50, createdAt: '2026-01-01T00:00:00Z' }],
  ['prod-002', { id: 'prod-002', name: 'Running Shoes', description: 'Lightweight running shoes', price: 89.99, category: 'Sports', stock: 120, createdAt: '2026-01-02T00:00:00Z' }],
  ['prod-003', { id: 'prod-003', name: 'Coffee Maker', description: 'Programmable 12-cup coffee maker', price: 49.99, category: 'Kitchen', stock: 75, createdAt: '2026-01-03T00:00:00Z' }],
  ['prod-004', { id: 'prod-004', name: 'Yoga Mat', description: 'Non-slip yoga mat 6mm thick', price: 29.99, category: 'Sports', stock: 200, createdAt: '2026-01-04T00:00:00Z' }],
]);

exports.handler = async (event, context) => {
  console.log('[ProductCatalog] Invoked:', event.fieldName, event.payload?.operation);

  const { payload } = event;
  if (!payload?.operation) throw new Error('Missing operation');

  switch (payload.operation) {
    case 'getProduct':       return getProduct(payload.payload);
    case 'listProducts':     return listProducts(payload.payload);
    case 'searchProducts':   return searchProducts(payload.payload);
    case 'createProduct':    return createProduct(payload.payload);
    case 'updateProduct':    return updateProduct(payload.payload);
    case 'deleteProduct':    return deleteProduct(payload.payload);
    default:
      throw new Error(`Unknown operation: ${payload.operation}`);
  }
};

function getProduct({ id }) {
  if (!id) return { error: 'id is required' };
  return products.get(id) || null;
}

function listProducts({ category, limit = 50 } = {}) {
  let result = [...products.values()];
  if (category) {
    result = result.filter(p => p.category.toLowerCase() === category.toLowerCase());
  }
  return result.slice(0, limit);
}

function searchProducts({ query, limit = 20 }) {
  if (!query) return { error: 'query is required' };
  const q = query.toLowerCase();
  return [...products.values()]
    .filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    )
    .slice(0, limit);
}

function createProduct(data) {
  const { name, price, category, stock } = data;
  if (!name)     return { error: 'name is required' };
  if (!price)    return { error: 'price is required' };
  if (!category) return { error: 'category is required' };
  if (stock === undefined) return { error: 'stock is required' };

  const product = {
    id: generateId(),
    name,
    description: data.description || null,
    price,
    category,
    stock,
    createdAt: new Date().toISOString(),
    updatedAt: null,
  };

  products.set(product.id, product);
  console.log('[ProductCatalog] Created product:', product.id);
  return product;
}

function updateProduct({ id, input }) {
  if (!id) return { error: 'id is required' };

  const product = products.get(id);
  if (!product) return { error: `Product ${id} not found` };

  const updated = {
    ...product,
    ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined && v !== null)),
    updatedAt: new Date().toISOString(),
  };

  products.set(id, updated);
  console.log('[ProductCatalog] Updated product:', id);
  return updated;
}

function deleteProduct({ id }) {
  if (!id) return { error: 'id is required' };
  const existed = products.delete(id);
  if (!existed) return { error: `Product ${id} not found` };
  console.log('[ProductCatalog] Deleted product:', id);
  return { deleted: true };
}

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
