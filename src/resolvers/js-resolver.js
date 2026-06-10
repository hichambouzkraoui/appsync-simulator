const fs = require('fs');
const vm = require('vm');
const path = require('path');

/**
 * JavaScript resolver engine (APPSYNC_JS runtime).
 * Executes AppSync JS resolvers that export request() and response() functions.
 */
class JsResolver {
  constructor() {
    this.resolverCache = new Map();
  }

  /**
   * Execute a JS resolver with request/response handlers.
   */
  async execute(resolverConfig, datasource, context) {
    const codePath = resolverConfig.code;
    const resolverCode = this.loadResolver(codePath);

    // Build the AppSync JS runtime context
    const runtime = this.buildRuntime(context);

    // Execute request handler
    const requestResult = this.executeHandler(resolverCode, 'request', runtime, context);
    console.log(`  [JS] Request handler result:`, JSON.stringify(requestResult).substring(0, 200));

    // Invoke datasource with the request result
    const datasourceResult = await datasource.invoke(requestResult, context);

    // Execute response handler with datasource result
    const responseCtx = {
      ...context,
      result: datasourceResult,
    };
    const responseRuntime = this.buildRuntime(responseCtx);
    const responseResult = this.executeHandler(resolverCode, 'response', responseRuntime, responseCtx);

    return responseResult;
  }

  /**
   * Load and cache resolver code from file.
   */
  loadResolver(codePath) {
    const resolved = path.resolve(codePath);

    // In dev mode, always reload; in prod, use cache
    if (process.env.NODE_ENV !== 'production' || !this.resolverCache.has(resolved)) {
      if (!fs.existsSync(resolved)) {
        throw new Error(`JS resolver file not found: ${resolved}`);
      }
      const code = fs.readFileSync(resolved, 'utf-8');
      this.resolverCache.set(resolved, code);
    }

    return this.resolverCache.get(resolved);
  }

  /**
   * Execute a specific handler (request or response) from resolver code.
   */
  executeHandler(code, handlerName, runtime, context) {
    // Create a sandboxed module environment
    const moduleExports = {};
    const moduleObj = { exports: moduleExports };

    const sandbox = {
      exports: moduleExports,
      module: moduleObj,
      require: () => { throw new Error('require is not available in APPSYNC_JS runtime'); },
      console: {
        log: (...args) => console.log(`    [Resolver]`, ...args),
        error: (...args) => console.error(`    [Resolver]`, ...args),
      },
      // AppSync JS runtime utilities
      util: runtime.util,
      runtime: runtime.runtime,
      ctx: runtime.ctx,
      context: runtime.ctx,
    };

    try {
      const vmContext = vm.createContext(sandbox);

      // Wrap code in a function to allow exports.x = ... pattern
      const wrappedCode = `
        (function(exports, module, util, runtime, ctx, context, console) {
          ${code}
        })(exports, module, util, runtime, ctx, context, console);
      `;

      const script = new vm.Script(wrappedCode, { filename: 'resolver.js' });
      script.runInContext(vmContext);

      // Get the handler function - check module.exports first, then exports
      const resolvedExports = (typeof sandbox.module.exports === 'function' || 
        (sandbox.module.exports && sandbox.module.exports !== moduleExports))
          ? sandbox.module.exports
          : sandbox.exports;

      const handler = resolvedExports[handlerName];

      if (!handler || typeof handler !== 'function') {
        const available = Object.keys(resolvedExports).join(', ') || 'none';
        throw new Error(
          `Handler '${handlerName}' not found or not a function in resolver. Available exports: ${available}`
        );
      }

      // Execute the handler
      const result = handler(runtime.ctx);
      return result;
    } catch (error) {
      if (error.message.includes('Handler') || error.message.includes('not found')) throw error;
      throw new Error(`JS resolver ${handlerName}() execution failed: ${error.message}`);
    }
  }

  /**
   * Build the APPSYNC_JS runtime context with util helpers.
   */
  buildRuntime(context) {
    const ctx = {
      args: context.arguments || {},
      arguments: context.arguments || {},
      identity: context.identity || {},
      source: context.source || {},
      request: context.request || {},
      stash: context.stash || {},
      info: context.info || {},
      result: context.result || null,
      error: context.error || null,
      prev: context.prev || null,
    };

    const util = {
      autoId: () => generateId(),
      time: {
        nowISO8601: () => new Date().toISOString(),
        nowEpochSeconds: () => Math.floor(Date.now() / 1000),
        nowEpochMilliSeconds: () => Date.now(),
      },
      dynamodb: {
        toMapValues: (obj) => {
          const result = {};
          for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') result[key] = { S: value };
            else if (typeof value === 'number') result[key] = { N: String(value) };
            else if (typeof value === 'boolean') result[key] = { BOOL: value };
            else if (value === null) result[key] = { NULL: true };
            else if (Array.isArray(value)) result[key] = { L: value };
            else result[key] = { S: JSON.stringify(value) };
          }
          return result;
        },
        fromMapValues: (obj) => {
          const result = {};
          for (const [key, attr] of Object.entries(obj)) {
            if (attr.S !== undefined) result[key] = attr.S;
            else if (attr.N !== undefined) result[key] = Number(attr.N);
            else if (attr.BOOL !== undefined) result[key] = attr.BOOL;
            else if (attr.NULL) result[key] = null;
            else if (attr.L) result[key] = attr.L;
            else if (attr.M) result[key] = attr.M;
          }
          return result;
        },
      },
      error: (message, type, data) => {
        const err = new Error(message);
        err.type = type;
        err.data = data;
        throw err;
      },
      appendError: (message, type) => {
        console.warn(`[JS Runtime] AppendError: ${type}: ${message}`);
      },
      toJson: (obj) => JSON.stringify(obj),
      parseJson: (str) => JSON.parse(str),
      urlEncode: (str) => encodeURIComponent(str),
      urlDecode: (str) => decodeURIComponent(str),
      base64Encode: (str) => Buffer.from(str).toString('base64'),
      base64Decode: (str) => Buffer.from(str, 'base64').toString('utf-8'),
      validate: (condition, message, type) => {
        if (!condition) {
          const err = new Error(message);
          err.type = type || 'ValidationError';
          throw err;
        }
      },
    };

    const runtime = {
      earlyReturn: (result) => {
        return { __earlyReturn: true, result };
      },
    };

    return { ctx, util, runtime };
  }
}

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

module.exports = { JsResolver };
