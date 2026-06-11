import { util } from '@aws-appsync/utils';

export function request(ctx) {
  const { id } = ctx.args;
  const input = ctx.args.input;

  // Validate input
  if (!input.name && !input.email) {
    util.error('At least one field (name or email) must be provided', 'ValidationError');
  }

  if (input.email && !input.email.includes('@')) {
    util.error('Invalid email format', 'ValidationError');
  }

  // Build the update payload - with NONE datasource this becomes the result
  return {
    id,
    ...input,
    updatedAt: util.time.nowISO8601(),
  };
}

export function response(ctx) {
  return ctx.result;
}
