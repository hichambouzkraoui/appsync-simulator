import { util } from '@aws-appsync/utils';

export function request(ctx) {
  return {
    operation: 'listNotifications',
    payload: {
      userId: ctx.args.userId,
      limit: ctx.args.limit || 20,
    },
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  const result = ctx.result;
  if (result?.error) util.error(result.error, 'NotificationError');
  return result?.items || result || [];
}
