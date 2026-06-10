const fs = require('fs');
const Velocity = require('velocityjs');

/**
 * VTL (Velocity Template Language) resolver engine.
 * Evaluates AppSync VTL request/response mapping templates.
 */
class VtlResolver {
  /**
   * Execute a VTL resolver pair (request + response templates).
   */
  async execute(resolverConfig, datasource, context) {
    // Read templates
    const requestTemplate = fs.readFileSync(resolverConfig.requestTemplate, 'utf-8');
    const responseTemplate = fs.readFileSync(resolverConfig.responseTemplate, 'utf-8');

    // Build VTL context
    const vtlContext = this.buildVtlContext(context);

    // Evaluate request template
    const requestResult = this.evaluateTemplate(requestTemplate, vtlContext);

    let parsedRequest;
    try {
      parsedRequest = JSON.parse(requestResult);
    } catch {
      parsedRequest = requestResult;
    }

    console.log(`  [VTL] Request template result:`, JSON.stringify(parsedRequest).substring(0, 200));

    // Invoke datasource
    const datasourceResult = await datasource.invoke(parsedRequest, context);

    // Build response context with result
    const responseContext = {
      ...vtlContext,
      context: {
        ...vtlContext.context,
        result: datasourceResult,
      },
      ctx: {
        ...vtlContext.ctx,
        result: datasourceResult,
      },
    };

    // Evaluate response template
    const responseResult = this.evaluateTemplate(responseTemplate, responseContext);

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(responseResult);
    } catch {
      parsedResponse = responseResult;
    }

    return parsedResponse;
  }

  /**
   * Build the VTL context object that maps to AppSync's $context / $ctx.
   */
  buildVtlContext(context) {
    const util = this.buildUtilFunctions();

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

    return {
      context: ctxObj,
      ctx: ctxObj,
      util,
      utils: util,
    };
  }

  /**
   * Build AppSync $util helper functions for VTL templates.
   */
  buildUtilFunctions() {
    return {
      autoId: () => generateId(),
      time: {
        nowISO8601: () => new Date().toISOString(),
        nowEpochSeconds: () => Math.floor(Date.now() / 1000),
        nowEpochMilliSeconds: () => Date.now(),
        nowFormatted: (format) => new Date().toISOString(),
      },
      dynamodb: {
        toDynamoDB: (value) => {
          if (typeof value === 'string') return { S: value };
          if (typeof value === 'number') return { N: String(value) };
          if (typeof value === 'boolean') return { BOOL: value };
          if (Array.isArray(value)) return { L: value.map((v) => this.toDynamoDB(v)) };
          if (value === null || value === undefined) return { NULL: true };
          return { S: JSON.stringify(value) };
        },
        toDynamoDBJson: (value) => {
          if (typeof value === 'string') return JSON.stringify({ S: value });
          if (typeof value === 'number') return JSON.stringify({ N: String(value) });
          if (typeof value === 'boolean') return JSON.stringify({ BOOL: value });
          if (value === null || value === undefined) return JSON.stringify({ NULL: true });
          if (Array.isArray(value)) return JSON.stringify({ L: value });
          return JSON.stringify({ S: JSON.stringify(value) });
        },
        toStringJson: (value) => JSON.stringify({ S: String(value) }),
        toNumberJson: (value) => JSON.stringify({ N: String(value) }),
        toBooleanJson: (value) => JSON.stringify({ BOOL: Boolean(value) }),
        toNullJson: () => JSON.stringify({ NULL: true }),
        toMapJson: (value) => JSON.stringify(value),
        toListJson: (value) => JSON.stringify(value),
        toString: (value) => ({ S: String(value) }),
        toNumber: (value) => ({ N: String(value) }),
      },
      toJson: (obj) => JSON.stringify(obj),
      parseJson: (str) => JSON.parse(str),
      qr: () => {},  // quiet reference - no output
      quiet: () => {},
      escapeJavaScript: (str) => str.replace(/'/g, "\\'").replace(/"/g, '\\"'),
      urlEncode: (str) => encodeURIComponent(str),
      urlDecode: (str) => decodeURIComponent(str),
      base64Encode: (str) => Buffer.from(str).toString('base64'),
      base64Decode: (str) => Buffer.from(str, 'base64').toString('utf-8'),
      error: (message, type) => {
        const err = new Error(message);
        err.type = type;
        throw err;
      },
      appendError: (message, type) => {
        console.warn(`[VTL] AppendError: ${type}: ${message}`);
      },
      validate: (condition, message, type) => {
        if (!condition) {
          const err = new Error(message);
          err.type = type || 'ValidationError';
          throw err;
        }
        return '';
      },
    };
  }

  /**
   * Evaluate a VTL template string with the given context.
   */
  evaluateTemplate(template, context) {
    try {
      // velocityjs compile and render
      const result = Velocity.render(template, context, {}, {
        escape: false,
      });
      return result.trim();
    } catch (error) {
      console.error('[VTL] Template evaluation error:', error.message);
      throw new Error(`VTL template evaluation failed: ${error.message}`);
    }
  }
}

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

module.exports = { VtlResolver };
