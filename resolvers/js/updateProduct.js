import { util } from '@aws-appsync/utils';

export function request(ctx) {
  return {
    operation: 'updateProduct',
    payload: {
      id: ctx.args.id,
      input: ctx.args.input,
    },
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  if (ctx.result?.error) util.error(ctx.result.error, 'ProductError');
  return ctx.result;
}
