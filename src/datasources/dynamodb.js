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

/**
 * In-memory DynamoDB mock for standalone operation without DynamoDB Local.
 * Supports GetItem, PutItem, DeleteItem, Query, and Scan.
 */
class InMemoryDynamoDB {
  constructor() {
    // tables[tableName] = Map<compositeKey, item>
    this.tables = {};
  }

  ensureTable(tableName) {
    if (!this.tables[tableName]) {
      this.tables[tableName] = [];
    }
    return this.tables[tableName];
  }

  getItem(tableName, key) {
    const items = this.ensureTable(tableName);
    return items.find((item) => this.matchesKey(item, key)) || null;
  }

  putItem(tableName, item) {
    const items = this.ensureTable(tableName);
    // Replace existing item with same key or insert
    const idx = items.findIndex((existing) => existing.id === item.id);
    if (idx >= 0) {
      items[idx] = item;
    } else {
      items.push(item);
    }
    return item;
  }

  deleteItem(tableName, key) {
    const items = this.ensureTable(tableName);
    const idx = items.findIndex((item) => this.matchesKey(item, key));
    if (idx >= 0) {
      items.splice(idx, 1);
    }
  }

  query(tableName, keyCondition, expressionValues, indexName) {
    const items = this.ensureTable(tableName);

    // Parse simple key condition: "fieldName = :value"
    const match = keyCondition?.match(/(\w+)\s*=\s*:(\w+)/);
    if (!match) return items;

    const [, field, valueName] = match;
    const targetValue = expressionValues?.[`:${valueName}`];

    return items.filter((item) => item[field] === targetValue);
  }

  scan(tableName, limit) {
    const items = this.ensureTable(tableName);
    return limit ? items.slice(0, limit) : [...items];
  }

  updateItem(tableName, key, updateExpression, expressionValues, expressionNames) {
    const items = this.ensureTable(tableName);
    let item = items.find((i) => this.matchesKey(i, key));

    if (!item) {
      item = { ...key };
      items.push(item);
    }

    // Parse SET expression: "SET #name = :val, #email = :email"
    if (updateExpression) {
      const setMatch = updateExpression.match(/SET\s+(.+)/i);
      if (setMatch) {
        const assignments = setMatch[1].split(',').map((s) => s.trim());
        for (const assignment of assignments) {
          const [lhs, rhs] = assignment.split('=').map((s) => s.trim());
          const fieldName = expressionNames?.[lhs] || lhs.replace('#', '');
          const value = expressionValues?.[rhs] ?? rhs;
          item[fieldName] = value;
        }
      }
    }

    return item;
  }

  matchesKey(item, key) {
    for (const [k, v] of Object.entries(key)) {
      if (item[k] !== v) return false;
    }
    return true;
  }
}

// Shared in-memory store across all DynamoDB datasources
const inMemoryStore = new InMemoryDynamoDB();

/**
 * DynamoDB datasource that connects to a local DynamoDB instance.
 * Falls back to an in-memory mock if DynamoDB Local is unavailable.
 */
class DynamoDBDatasource {
  constructor(name, config) {
    this.name = name;
    this.tableName = config.tableName;
    this.endpoint = config.endpoint || 'http://localhost:8000';
    this.region = config.region || 'us-east-1';
    this.useInMemory = false;

    const client = new DynamoDBClient({
      endpoint: this.endpoint,
      region: this.region,
      credentials: {
        accessKeyId: 'local',
        secretAccessKey: 'local',
      },
    });

    this.docClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });

    this.inMemory = inMemoryStore;

    console.log(`  [DynamoDB] Initialized: ${name} → ${this.tableName} @ ${this.endpoint}`);
  }

  /**
   * Invoke a DynamoDB operation based on the request payload.
   * Supports AppSync DynamoDB resolver request format.
   * Falls back to in-memory if DynamoDB Local is unreachable.
   */
  async invoke(request, context) {
    if (!request || !request.operation) {
      return request;
    }

    const operation = request.operation;
    const tableName = request.tableName || this.tableName;

    console.log(`  [DynamoDB] ${this.name}: ${operation} on ${tableName}`);

    try {
      if (this.useInMemory) {
        return this.invokeInMemory(operation, tableName, request);
      }

      const result = await this.invokeDynamo(operation, tableName, request);
      return result;
    } catch (error) {
      // If connection refused, fall back to in-memory
      if (error.message.includes('ECONNREFUSED') || error.code === 'ECONNREFUSED') {
        if (!this.useInMemory) {
          console.warn(`  [DynamoDB] ⚠️  Cannot reach DynamoDB Local at ${this.endpoint}`);
          console.warn(`  [DynamoDB] ⚠️  Falling back to in-memory store for ${this.name}`);
          this.useInMemory = true;
        }
        return this.invokeInMemory(operation, tableName, request);
      }

      console.error(`  [DynamoDB] Error in ${operation}:`, error.message);
      throw error;
    }
  }

  /**
   * Execute against the real DynamoDB Local instance.
   */
  async invokeDynamo(operation, tableName, request) {
    switch (operation) {
      case 'GetItem':
        return this.getItem(tableName, request.key);
      case 'PutItem':
        return this.putItem(tableName, request.key, request.attributeValues);
      case 'DeleteItem':
        return this.deleteItem(tableName, request.key);
      case 'Query':
        return this.query(tableName, request.query || request);
      case 'Scan':
        return this.scan(tableName, request.filter, request.limit);
      case 'UpdateItem':
        return this.updateItem(tableName, request.key, request.update);
      default:
        throw new Error(`Unsupported DynamoDB operation: ${operation}`);
    }
  }

  /**
   * Execute against the in-memory fallback store.
   */
  invokeInMemory(operation, tableName, request) {
    const tag = `[DynamoDB/Memory]`;

    switch (operation) {
      case 'GetItem': {
        const key = this.unmarshallKey(request.key);
        console.log(`  ${tag} GetItem key:`, key);
        return this.inMemory.getItem(tableName, key);
      }

      case 'PutItem': {
        const item = {
          ...this.unmarshallKey(request.key),
          ...this.unmarshallAttributes(request.attributeValues),
        };
        console.log(`  ${tag} PutItem:`, item);
        return this.inMemory.putItem(tableName, item);
      }

      case 'DeleteItem': {
        const key = this.unmarshallKey(request.key);
        console.log(`  ${tag} DeleteItem key:`, key);
        this.inMemory.deleteItem(tableName, key);
        return { id: Object.values(key)[0] };
      }

      case 'Query': {
        const queryParams = request.query || request;
        const expressionValues = this.unmarshallAttributes(queryParams.expressionValues);
        console.log(`  ${tag} Query: ${queryParams.expression}`);
        return this.inMemory.query(
          tableName,
          queryParams.expression,
          expressionValues,
          queryParams.index
        );
      }

      case 'Scan': {
        console.log(`  ${tag} Scan (limit: ${request.limit || 'none'})`);
        return this.inMemory.scan(tableName, request.limit);
      }

      case 'UpdateItem': {
        const key = this.unmarshallKey(request.key);
        const update = request.update || {};
        const expressionValues = this.unmarshallAttributes(update.expressionValues);
        console.log(`  ${tag} UpdateItem key:`, key);
        return this.inMemory.updateItem(
          tableName,
          key,
          update.expression,
          expressionValues,
          update.expressionNames
        );
      }

      default:
        throw new Error(`Unsupported DynamoDB operation: ${operation}`);
    }
  }

  // --- Real DynamoDB methods ---

  async getItem(tableName, key) {
    const command = new GetCommand({
      TableName: tableName,
      Key: this.unmarshallKey(key),
    });
    const result = await this.docClient.send(command);
    return result.Item || null;
  }

  async putItem(tableName, key, attributeValues) {
    const item = {
      ...this.unmarshallKey(key),
      ...this.unmarshallAttributes(attributeValues),
    };
    const command = new PutCommand({
      TableName: tableName,
      Item: item,
    });
    await this.docClient.send(command);
    return item;
  }

  async deleteItem(tableName, key) {
    const command = new DeleteCommand({
      TableName: tableName,
      Key: this.unmarshallKey(key),
    });
    await this.docClient.send(command);
    return { id: Object.values(this.unmarshallKey(key))[0] };
  }

  async query(tableName, queryParams) {
    const params = { TableName: tableName };

    if (queryParams.expression) {
      params.KeyConditionExpression = queryParams.expression;
    }
    if (queryParams.expressionValues) {
      params.ExpressionAttributeValues = this.unmarshallAttributes(queryParams.expressionValues);
    }
    if (queryParams.expressionNames) {
      params.ExpressionAttributeNames = queryParams.expressionNames;
    }
    if (queryParams.index) {
      params.IndexName = queryParams.index;
    }
    if (queryParams.limit) {
      params.Limit = queryParams.limit;
    }

    const command = new QueryCommand(params);
    const result = await this.docClient.send(command);
    return result.Items || [];
  }

  async scan(tableName, filter, limit) {
    const params = { TableName: tableName };

    if (filter) {
      params.FilterExpression = filter.expression;
      if (filter.expressionValues) {
        params.ExpressionAttributeValues = this.unmarshallAttributes(filter.expressionValues);
      }
    }
    if (limit) {
      params.Limit = limit;
    }

    const command = new ScanCommand(params);
    const result = await this.docClient.send(command);
    return result.Items || [];
  }

  async updateItem(tableName, key, update) {
    const params = {
      TableName: tableName,
      Key: this.unmarshallKey(key),
      ReturnValues: 'ALL_NEW',
    };

    if (update.expression) {
      params.UpdateExpression = update.expression;
    }
    if (update.expressionValues) {
      params.ExpressionAttributeValues = this.unmarshallAttributes(update.expressionValues);
    }
    if (update.expressionNames) {
      params.ExpressionAttributeNames = update.expressionNames;
    }

    const command = new UpdateCommand(params);
    const result = await this.docClient.send(command);
    return result.Attributes;
  }

  // --- Unmarshalling helpers ---

  unmarshallKey(key) {
    if (!key) return {};
    const result = {};
    for (const [k, v] of Object.entries(key)) {
      if (typeof v === 'object' && v !== null) {
        if (v.S !== undefined) result[k] = v.S;
        else if (v.N !== undefined) result[k] = Number(v.N);
        else if (v.BOOL !== undefined) result[k] = v.BOOL;
        else result[k] = v;
      } else {
        result[k] = v;
      }
    }
    return result;
  }

  unmarshallAttributes(attrs) {
    if (!attrs) return {};
    const result = {};
    for (const [k, v] of Object.entries(attrs)) {
      if (typeof v === 'object' && v !== null) {
        if (v.S !== undefined) result[k] = v.S;
        else if (v.N !== undefined) result[k] = Number(v.N);
        else if (v.BOOL !== undefined) result[k] = v.BOOL;
        else if (v.L !== undefined) result[k] = v.L;
        else if (v.M !== undefined) result[k] = v.M;
        else if (v.NULL !== undefined) result[k] = null;
        else result[k] = v;
      } else {
        result[k] = v;
      }
    }
    return result;
  }
}

module.exports = { DynamoDBDatasource };
