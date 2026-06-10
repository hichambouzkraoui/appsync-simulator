/**
 * APPSYNC_JS resolver for processing an order.
 * This resolver invokes a .NET Lambda datasource that handles
 * order processing (payment validation, inventory check, status update).
 */

/**
 * Request handler - prepares the payload for the .NET Lambda function.
 */
exports.request = function request(ctx) {
  return {
    operation: 'processOrder',
    payload: {
      orderId: ctx.args.id,
      processedAt: util.time.nowISO8601(),
      processedBy: ctx.identity ? ctx.identity.username : 'system',
    },
  };
};

/**
 * Response handler - transforms the .NET Lambda response.
 */
exports.response = function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }

  const result = ctx.result;

  if (!result) {
    util.error('Order processing returned no result', 'ProcessingError');
  }

  // .NET Lambda returns the updated order
  return result;
};
