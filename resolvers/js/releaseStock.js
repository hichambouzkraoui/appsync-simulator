import { util } from '@aws-appsync/utils';

export function request(ctx) {
  return {
    operation: 'releaseStock',
    payload: { reservationId: ctx.args.reservationId },
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  const result = ctx.result;
  if (result?.error) util.error(result.error, 'InventoryError');
  return result;
}
