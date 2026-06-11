import { util } from '@aws-appsync/utils';

export function request(ctx) {
  return {
    operation: 'adjustStock',
    payload: {
      productId: ctx.args.input.productId,
      adjustment: ctx.args.input.adjustment,
      reason: ctx.args.input.reason || null,
    },
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  const result = ctx.result;
  if (result?.error) util.error(result.error, 'InventoryError');
  return result;
}
