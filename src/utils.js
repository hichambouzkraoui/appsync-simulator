/**
 * Generate a UUID v4 string.
 */
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Unmarshall a DynamoDB attribute value to a plain JS value.
 * e.g., { S: "hello" } → "hello", { N: "42" } → 42
 */
function unmarshallValue(v) {
  if (v === null || v === undefined) return v;
  if (typeof v !== 'object') return v;
  if (v.S !== undefined) return v.S;
  if (v.N !== undefined) return Number(v.N);
  if (v.BOOL !== undefined) return v.BOOL;
  if (v.NULL !== undefined) return null;
  if (v.L !== undefined) return v.L;
  if (v.M !== undefined) return v.M;
  return v;
}

/**
 * Unmarshall a map of DynamoDB attributes to plain key-value pairs.
 */
function unmarshallMap(attrs) {
  if (!attrs) return {};
  const result = {};
  for (const [k, v] of Object.entries(attrs)) {
    result[k] = unmarshallValue(v);
  }
  return result;
}

module.exports = { generateId, unmarshallValue, unmarshallMap };
