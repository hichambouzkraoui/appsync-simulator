import { util } from '@aws-appsync/utils';

export function request(ctx) {
  return {
    operation: 'Query',
    index: 'userId-index',
    expression: 'userId = :userId',
    expressionValues: {
      ':userId': { S: ctx.args.userId },
    },
    limit: 50,
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  return ctx.result || [];
}
