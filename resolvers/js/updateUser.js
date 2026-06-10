/**
 * APPSYNC_JS resolver for updating a user.
 * Uses the NONE datasource - demonstrates local resolution without a backend.
 * In a real app, you'd use a DynamoDB datasource, but this shows
 * how NONE datasources work for computed/mock data.
 */

/**
 * Request handler - performs validation and builds the update payload.
 */
exports.request = function request(ctx) {
  const { id } = ctx.args;
  const input = ctx.args.input;

  // Validate input
  if (!input.name && !input.email) {
    util.error('At least one field (name or email) must be provided', 'ValidationError');
  }

  if (input.email && !input.email.includes('@')) {
    util.error('Invalid email format', 'ValidationError');
  }

  // Build the update payload - with NONE datasource this becomes the result
  return {
    id,
    ...input,
    updatedAt: util.time.nowISO8601(),
  };
};

/**
 * Response handler - returns the result from the NONE datasource.
 * Since NONE datasource passes the request through as the result,
 * ctx.result contains what we returned from request().
 */
exports.response = function response(ctx) {
  return ctx.result;
};
