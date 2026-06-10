/**
 * Local test harness for debugging the JS Lambda function.
 *
 * Usage:
 *   node examples/js-lambda/test-local.js
 *
 * Or with debugger:
 *   Use the "Debug JS Lambda Only" launch configuration
 *   and set breakpoints in index.js
 */

const { handler } = require('./index');

// Simulate the AppSync event that the simulator sends to the Lambda
const testEvents = [
  {
    name: 'Create Order',
    event: {
      typeName: 'Mutation',
      fieldName: 'createOrder',
      arguments: {
        input: {
          userId: 'user-1',
          items: [
            { productId: 'prod-001', quantity: 2, price: 29.99 },
            { productId: 'prod-002', quantity: 1, price: 49.99 },
          ],
        },
      },
      identity: { sub: 'test-user', username: 'debugger' },
      request: { headers: {} },
      payload: {
        operation: 'createOrder',
        payload: {
          userId: 'user-1',
          items: [
            { productId: 'prod-001', quantity: 2, price: 29.99 },
            { productId: 'prod-002', quantity: 1, price: 49.99 },
          ],
          total: 109.97,
          status: 'PENDING',
          createdAt: new Date().toISOString(),
        },
      },
    },
  },
  {
    name: 'Create Order - Missing userId (error case)',
    event: {
      typeName: 'Mutation',
      fieldName: 'createOrder',
      arguments: {},
      identity: null,
      request: {},
      payload: {
        operation: 'createOrder',
        payload: {
          items: [{ productId: 'prod-001', quantity: 1, price: 10 }],
        },
      },
    },
  },
  {
    name: 'Validate User',
    event: {
      typeName: 'Query',
      fieldName: 'validateUser',
      arguments: {},
      identity: null,
      request: {},
      payload: {
        operation: 'validateUser',
        payload: { userId: 'user-123' },
      },
    },
  },
];

const lambdaContext = {
  functionName: 'UserServiceLambda',
  functionVersion: '$LATEST',
  memoryLimitInMB: 128,
  awsRequestId: 'local-debug-request',
  getRemainingTimeInMillis: () => 30000,
};

async function runTests() {
  console.log('=== JS Lambda Debug Test Harness ===\n');

  for (const test of testEvents) {
    console.log(`--- ${test.name} ---`);
    console.log('Input:', JSON.stringify(test.event.payload, null, 2));

    try {
      // Set a breakpoint on the next line to step into the handler
      const result = await handler(test.event, lambdaContext);
      console.log('Output:', JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('Error:', error.message);
    }
    console.log('');
  }
}

runTests();
