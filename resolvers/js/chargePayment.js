exports.request = function request(ctx) {
  return {
    operation: 'chargePayment',
    payload: {
      orderId:       ctx.args.input.orderId,
      amount:        ctx.args.input.amount,
      currency:      ctx.args.input.currency,
      paymentMethod: ctx.args.input.paymentMethod,
    },
  };
};

exports.response = function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  const result = ctx.result;
  if (result?.error) util.error(result.error, 'PaymentError');
  return result;
};
