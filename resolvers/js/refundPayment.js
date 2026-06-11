exports.request = function request(ctx) {
  return {
    operation: 'refundPayment',
    payload: {
      paymentId: ctx.args.input.paymentId,
      amount:    ctx.args.input.amount || null,
      reason:    ctx.args.input.reason || null,
    },
  };
};

exports.response = function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  const result = ctx.result;
  if (result?.error) util.error(result.error, 'PaymentError');
  return result;
};
