/**
 * APPSYNC_JS resolver for creating an order.
 * This resolver invokes a JS Lambda datasource that handles order creation logic.
 */

/**
 * Request handler - prepares the payload for the Lambda function.
 * The Lambda will validate the user, calculate totals, and create the order.
 */
exports.request = function request(ctx) {
  const { userId, items } = ctx.args.input;

  // Calculate the order total
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return {
    operation: 'createOrder',
    payload: {
      userId,
      items,
      total: Math.round(total * 100) / 100,
      status: 'PENDING',
      createdAt: util.time.nowISO8601(),
    },
  };
};

/**
 * Response handler - returns the Lambda result as the order.
 */
exports.response = function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }

  const result = ctx.result;

  // If Lambda returned an error field, propagate it
  if (result && result.error) {
    util.error(result.error, 'LambdaError');
  }

  return result;
};
