import { util } from '@aws-appsync/utils';

export function request(ctx) {
  return {
    operation: 'sendNotification',
    payload: {
      userId: ctx.args.input.userId,
      channel: ctx.args.input.channel.toLowerCase(),
      subject: ctx.args.input.subject || '',
      message: ctx.args.input.message,
    },
  };
}

export function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  const result = ctx.result;
  if (result?.error) util.error(result.error, 'NotificationError');
  return result;
}
