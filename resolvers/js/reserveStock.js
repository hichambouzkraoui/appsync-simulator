import { util } from '@aws-appsync/utils';

export function request(ctx) {
  return {
    operation: 'reserveStock',
    payload: {
      productId: ctx.args.input.productId,
      orderId: ctx.args.input.orderId,
      quantity: ctx.args.input.quantity,
    },
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  const result = ctx.result;
  if (result?.error) util.error(result.error, 'InventoryError');
  return result;
}
