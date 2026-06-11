import { util } from '@aws-appsync/utils';

export function request(ctx) {
  return {
    operation: 'listProducts',
    payload: {
      category: ctx.args.category || null,
      limit: ctx.args.limit || 50,
    },
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  return ctx.result || [];
}
