exports.request = function request(ctx) {
  return {
    operation: 'deleteProduct',
    payload: { id: ctx.args.id },
  };
};

exports.response = function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  if (ctx.result?.error) util.error(ctx.result.error, 'ProductError');
  return ctx.result?.deleted === true;
};
