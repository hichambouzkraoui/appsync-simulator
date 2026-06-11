const fs = require('fs');
const Velocity = require('velocityjs');
const { generateId } = require('../utils');

/**
 * VTL resolver engine — evaluates AppSync VTL request/response mapping templates.
 */
class VtlResolver {
  async execute(resolverConfig, datasource, context) {
    const requestTemplate = fs.readFileSync(resolverConfig.requestTemplate, 'utf-8');
    const responseTemplate = fs.readFileSync(resolverConfig.responseTemplate, 'utf-8');

    const vtlCtx = this.buildContext(context);

    // Request
    const requestJson = this.render(requestTemplate, vtlCtx);
    let parsedRequest;
    try { parsedRequest = JSON.parse(requestJson); } catch { parsedRequest = requestJson; }

    // Datasource
    const result = await datasource.invoke(parsedRequest, context);

    // Response
    const responseCtx = {
      ...vtlCtx,
      context: { ...vtlCtx.context, result },
      ctx: { ...vtlCtx.ctx, result },
    };
    const responseJson = this.render(responseTemplate, responseCtx);
    try { return JSON.parse(responseJson); } catch { return responseJson; }
  }

  buildContext(context) {
    const ctxObj = {
      arguments: context.arguments || {},
      args: context.arguments || {},
      identity: context.identity || {},
      source: context.source || {},
      request: context.request || {},
      stash: context.stash || {},
      info: context.info || {},
      result: null,
      error: null,
    };

    const util = {
      autoId: () => generateId(),
      time: {
        nowISO8601: () => new Date().toISOString(),
        nowEpochSeconds: () => Math.floor(Date.now() / 1000),
        nowEpochMilliSeconds: () => Date.now(),
        nowFormatted: () => new Date().toISOString(),
      },
      dynamodb: {
        toDynamoDB: (value) => {
          if (typeof value === 'string') return { S: value };
          if (typeof value === 'number') return { N: String(value) };
          if (typeof value === 'boolean') return { BOOL: value };
          if (value == null) return { NULL: true };
          if (Array.isArray(value)) return { L: value };
          return { S: JSON.stringify(value) };
        },
        toDynamoDBJson: (value) => {
          if (typeof value === 'string') return JSON.stringify({ S: value });
          if (typeof value === 'number') return JSON.stringify({ N: String(value) });
          if (typeof value === 'boolean') return JSON.stringify({ BOOL: value });
          if (value == null) return JSON.stringify({ NULL: true });
          if (Array.isArray(value)) return JSON.stringify({ L: value });
          return JSON.stringify({ S: JSON.stringify(value) });
        },
        toStringJson: (v) => JSON.stringify({ S: String(v) }),
        toNumberJson: (v) => JSON.stringify({ N: String(v) }),
        toBooleanJson: (v) => JSON.stringify({ BOOL: Boolean(v) }),
        toNullJson: () => JSON.stringify({ NULL: true }),
        toMapJson: (v) => JSON.stringify(v),
        toListJson: (v) => JSON.stringify(v),
        toString: (v) => ({ S: String(v) }),
        toNumber: (v) => ({ N: String(v) }),
      },
      toJson: (obj) => JSON.stringify(obj),
      parseJson: (str) => JSON.parse(str),
      qr: () => {},
      quiet: () => {},
      escapeJavaScript: (s) => s.replace(/'/g, "\\'").replace(/"/g, '\\"'),
      urlEncode: (s) => encodeURIComponent(s),
      urlDecode: (s) => decodeURIComponent(s),
      base64Encode: (s) => Buffer.from(s).toString('base64'),
      base64Decode: (s) => Buffer.from(s, 'base64').toString('utf-8'),
      error: (message, type) => { const e = new Error(message); e.type = type; throw e; },
      appendError: (message, type) => console.warn(`[VTL] AppendError: ${type}: ${message}`),
      validate: (cond, msg, type) => {
        if (!cond) { const e = new Error(msg); e.type = type || 'ValidationError'; throw e; }
        return '';
      },
    };

    return { context: ctxObj, ctx: ctxObj, util, utils: util };
  }

  render(template, context) {
    try {
      return Velocity.render(template, context, {}, { escape: false }).trim();
    } catch (error) {
      throw new Error(`VTL evaluation failed: ${error.message}`);
    }
  }
}

module.exports = { VtlResolver };
