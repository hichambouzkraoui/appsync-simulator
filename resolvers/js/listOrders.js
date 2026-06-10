/**
 * APPSYNC_JS resolver for listing orders by userId.
 * Demonstrates a DynamoDB Query with key condition expression.
 */

/**
 * Request handler - builds a DynamoDB Query request.
 */
exports.request = function request(ctx) {
  return {
    operation: 'Query',
    index: 'userId-index',
    expression: 'userId = :userId',
    expressionValues: {
      ':userId': { S: ctx.args.userId },
    },
    limit: 50,
  };
};

/**
 * Response handler - returns the list of orders.
 */
exports.response = function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  return ctx.result || [];
};
