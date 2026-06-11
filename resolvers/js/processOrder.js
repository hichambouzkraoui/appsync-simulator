import { util } from '@aws-appsync/utils';

export function request(ctx) {
  return {
    operation: 'processOrder',
    payload: {
      orderId: ctx.args.id,
      processedAt: util.time.nowISO8601(),
      processedBy: ctx.identity ? ctx.identity.username : 'system',
    },
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }

  const result = ctx.result;

  if (!result) {
    util.error('Order processing returned no result', 'ProcessingError');
  }

  // .NET Lambda returns the updated order
  return result;
}
