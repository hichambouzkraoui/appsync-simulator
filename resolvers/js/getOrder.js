/**
 * APPSYNC_JS resolver for getting a single order from DynamoDB.
 * Uses the AppSync JavaScript resolver runtime.
 */

/**
 * Request handler - builds the DynamoDB GetItem request.
 * @param {object} ctx - The AppSync context object
 * @returns {object} DynamoDB request payload
 */
exports.request = function request(ctx) {
  return {
    operation: 'GetItem',
    key: {
      id: { S: ctx.args.id },
    },
  };
};

/**
 * Response handler - transforms the DynamoDB result.
 * @param {object} ctx - The AppSync context with result
 * @returns {object|null} The order or null
 */
exports.response = function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  return ctx.result;
};
