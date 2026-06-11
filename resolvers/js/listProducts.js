exports.request = function request(ctx) {
  return {
    operation: 'listProducts',
    payload: {
      category: ctx.args.category || null,
      limit: ctx.args.limit || 50,
    },
  };
};

exports.response = function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  return ctx.result || [];
};
