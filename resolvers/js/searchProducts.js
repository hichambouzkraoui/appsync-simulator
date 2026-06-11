import { util } from '@aws-appsync/utils';

export function request(ctx) {
  return {
    operation: 'searchProducts',
    payload: {
      query: ctx.args.query,
      limit: ctx.args.limit || 20,
    },
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  if (ctx.result?.error) util.error(ctx.result.error, 'SearchError');
  return ctx.result || [];
}
