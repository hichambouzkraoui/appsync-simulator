/**
 * Setup script for DynamoDB Local tables.
 * Run this after starting DynamoDB Local to create the required tables.
 *
 * Usage: node scripts/setup-dynamodb.js
 *
 * Requires DynamoDB Local running at http://localhost:8000
 * Start with: docker run -p 8000:8000 amazon/dynamodb-local
 */

const { DynamoDBClient, CreateTableCommand, ListTablesCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({
  endpoint: 'http://localhost:8000',
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});

const tables = [
  {
    TableName: 'Users',
    KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },
  {
    TableName: 'Orders',
    KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
    AttributeDefinitions: [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'userId', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'userId-index',
        KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  },
];

async function setup() {
  console.log('Setting up DynamoDB Local tables...\n');

  const existing = await client.send(new ListTablesCommand({}));
  console.log('Existing tables:', existing.TableNames?.join(', ') || 'none');

  for (const table of tables) {
    if (existing.TableNames?.includes(table.TableName)) {
      console.log(`  ✓ Table '${table.TableName}' already exists`);
      continue;
    }

    try {
      await client.send(new CreateTableCommand(table));
      console.log(`  ✓ Created table '${table.TableName}'`);
    } catch (error) {
      console.error(`  ✗ Failed to create '${table.TableName}':`, error.message);
    }
  }

  console.log('\nDone! Tables are ready.');
}

setup().catch(console.error);
