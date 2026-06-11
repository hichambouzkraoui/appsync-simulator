import { util } from '@aws-appsync/utils';

export function request(ctx) {
  return {
    operation: 'getPayment',
    payload: { paymentId: ctx.args.id },
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  const result = ctx.result;
  if (result?.error) util.error(result.error, 'PaymentError');
  return result;
}
