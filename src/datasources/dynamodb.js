const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const { unmarshallMap } = require('../utils');

/** Shared in-memory store (fallback when DynamoDB Local is unreachable). */
const memoryStore = {};

function getTable(tableName) {
  if (!memoryStore[tableName]) memoryStore[tableName] = [];
  return memoryStore[tableName];
}

/**
 * DynamoDB datasource — connects to DynamoDB Local, with automatic
 * in-memory fallback if unreachable.
 */
class DynamoDBDatasource {
  constructor(name, config) {
    this.name = name;
    this.tableName = config.tableName;
    this.endpoint = config.endpoint || null;
    this.useInMemory = false;

    // Build client config — only add endpoint/dummy creds for local DynamoDB
    const clientConfig = { region: config.region || 'us-east-1' };

    if (this.endpoint) {
      clientConfig.endpoint = this.endpoint;
      clientConfig.credentials = { accessKeyId: 'local', secretAccessKey: 'local' };
    }

    this.docClient = DynamoDBDocumentClient.from(
      new DynamoDBClient(clientConfig),
      { marshallOptions: { removeUndefinedValues: true } }
    );

    const target = this.endpoint || `dynamodb.${clientConfig.region}.amazonaws.com`;
    console.log(`  [DynamoDB] Initialized: ${name} → ${this.tableName} @ ${target}`);
  }

  async invoke(request) {
    if (!request?.operation) return request;

    const { operation } = request;
    const tableName = request.tableName || this.tableName;

    try {
      return this.useInMemory
        ? this.memoryOp(operation, tableName, request)
        : await this.remoteOp(operation, tableName, request);
    } catch (error) {
      // Only fall back to in-memory for local endpoints (not real AWS)
      if (this.endpoint && (error.message.includes('ECONNREFUSED') || error.code === 'ECONNREFUSED')) {
        if (!this.useInMemory) {
          console.warn(`  [DynamoDB] ⚠️  Falling back to in-memory for ${this.name}`);
          this.useInMemory = true;
        }
        return this.memoryOp(operation, tableName, request);
      }
      throw error;
    }
  }

  // ─── Remote (DynamoDB Local) ──────────────────────────────────────────────

  async remoteOp(op, table, req) {
    switch (op) {
      case 'GetItem': {
        const { Item } = await this.docClient.send(new GetCommand({ TableName: table, Key: unmarshallMap(req.key) }));
        return Item || null;
      }
      case 'PutItem': {
        const item = { ...unmarshallMap(req.key), ...unmarshallMap(req.attributeValues) };
        await this.docClient.send(new PutCommand({ TableName: table, Item: item }));
        return item;
      }
      case 'DeleteItem': {
        const key = unmarshallMap(req.key);
        await this.docClient.send(new DeleteCommand({ TableName: table, Key: key }));
        return { id: Object.values(key)[0] };
      }
      case 'Query': {
        const q = req.query || req;
        const params = { TableName: table };
        if (q.expression) params.KeyConditionExpression = q.expression;
        if (q.expressionValues) params.ExpressionAttributeValues = unmarshallMap(q.expressionValues);
        if (q.expressionNames) params.ExpressionAttributeNames = q.expressionNames;
        if (q.index) params.IndexName = q.index;
        if (q.limit) params.Limit = q.limit;
        const { Items } = await this.docClient.send(new QueryCommand(params));
        return Items || [];
      }
      case 'Scan': {
        const params = { TableName: table };
        if (req.filter) {
          params.FilterExpression = req.filter.expression;
          if (req.filter.expressionValues) params.ExpressionAttributeValues = unmarshallMap(req.filter.expressionValues);
        }
        if (req.limit) params.Limit = req.limit;
        const { Items } = await this.docClient.send(new ScanCommand(params));
        return Items || [];
      }
      case 'UpdateItem': {
        const params = { TableName: table, Key: unmarshallMap(req.key), ReturnValues: 'ALL_NEW' };
        const u = req.update || {};
        if (u.expression) params.UpdateExpression = u.expression;
        if (u.expressionValues) params.ExpressionAttributeValues = unmarshallMap(u.expressionValues);
        if (u.expressionNames) params.ExpressionAttributeNames = u.expressionNames;
        const { Attributes } = await this.docClient.send(new UpdateCommand(params));
        return Attributes;
      }
      default:
        throw new Error(`Unsupported DynamoDB operation: ${op}`);
    }
  }

  // ─── In-Memory fallback ───────────────────────────────────────────────────

  memoryOp(op, table, req) {
    const items = getTable(table);

    switch (op) {
      case 'GetItem': {
        const key = unmarshallMap(req.key);
        return items.find((i) => matchesKey(i, key)) || null;
      }
      case 'PutItem': {
        const item = { ...unmarshallMap(req.key), ...unmarshallMap(req.attributeValues) };
        const idx = items.findIndex((i) => i.id === item.id);
        if (idx >= 0) items[idx] = item; else items.push(item);
        return item;
      }
      case 'DeleteItem': {
        const key = unmarshallMap(req.key);
        const idx = items.findIndex((i) => matchesKey(i, key));
        if (idx >= 0) items.splice(idx, 1);
        return { id: Object.values(key)[0] };
      }
      case 'Query': {
        const q = req.query || req;
        const vals = unmarshallMap(q.expressionValues);
        const match = q.expression?.match(/(\w+)\s*=\s*:(\w+)/);
        if (!match) return items;
        const [, field, valName] = match;
        return items.filter((i) => i[field] === vals[`:${valName}`]);
      }
      case 'Scan': {
        return req.limit ? items.slice(0, req.limit) : [...items];
      }
      case 'UpdateItem': {
        const key = unmarshallMap(req.key);
        let item = items.find((i) => matchesKey(i, key));
        if (!item) { item = { ...key }; items.push(item); }
        const u = req.update || {};
        const vals = unmarshallMap(u.expressionValues);
        const setMatch = u.expression?.match(/SET\s+(.+)/i);
        if (setMatch) {
          for (const assignment of setMatch[1].split(',').map((s) => s.trim())) {
            const [lhs, rhs] = assignment.split('=').map((s) => s.trim());
            const field = u.expressionNames?.[lhs] || lhs.replace('#', '');
            item[field] = vals[rhs] ?? rhs;
          }
        }
        return item;
      }
      default:
        throw new Error(`Unsupported DynamoDB operation: ${op}`);
    }
  }
}

function matchesKey(item, key) {
  return Object.entries(key).every(([k, v]) => item[k] === v);
}

module.exports = { DynamoDBDatasource };
