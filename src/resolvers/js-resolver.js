const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { generateId } = require('../utils');

/**
 * APPSYNC_JS resolver engine.
 *
 * Supports both resolver styles:
 *   1. CommonJS:  exports.request = function(ctx) { ... }
 *   2. AppSync native (ESM-like):
 *        import { util } from '@aws-appsync/utils';
 *        export function request(ctx) { ... }
 *
 * The @aws-appsync/utils import is stripped and replaced with the simulator's
 * built-in util/runtime globals (same as the real APPSYNC_JS runtime does).
 */
class JsResolver {
  async execute(resolverConfig, datasource, context) {
    const rawCode = this.loadCode(resolverConfig.code);
    const code = this.transformCode(rawCode);
    const runtime = this.buildRuntime(context);

    // Request
    const requestResult = this.runHandler(code, 'request', runtime);

    // Datasource
    const datasourceResult = await datasource.invoke(requestResult, context);

    // Response
    const responseRuntime = this.buildRuntime({ ...context, result: datasourceResult });
    return this.runHandler(code, 'response', responseRuntime);
  }

  loadCode(codePath) {
    const resolved = path.resolve(codePath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`JS resolver file not found: ${resolved}`);
    }
    return fs.readFileSync(resolved, 'utf-8');
  }

  /**
   * Transform APPSYNC_JS-style code to CommonJS that runs in our VM sandbox:
   *   - Strip: import { util, runtime } from '@aws-appsync/utils'
   *   - Strip: import * as ddb from '@aws-appsync/utils/dynamodb'
   *   - Convert: export function request(ctx) → exports.request = function request(ctx)
   *   - Convert: export default function request(ctx) → exports.request = function request(ctx)
   */
  transformCode(code) {
    let transformed = code;

    // Remove import statements from @aws-appsync/*
    // Handles: import { util } from '@aws-appsync/utils'
    //          import { util, runtime } from '@aws-appsync/utils'
    //          import * as ddb from '@aws-appsync/utils/dynamodb'
    transformed = transformed.replace(
      /^\s*import\s+.*from\s+['"]@aws-appsync\/[^'"]+['"]\s*;?\s*$/gm,
      ''
    );

    // Convert: export function name(...)  →  exports.name = function name(...)
    transformed = transformed.replace(
      /^\s*export\s+function\s+(\w+)/gm,
      'exports.$1 = function $1'
    );

    // Convert: export const name = (...)  →  exports.name = (...)
    transformed = transformed.replace(
      /^\s*export\s+const\s+(\w+)\s*=/gm,
      'exports.$1 ='
    );

    // Convert: export default function name(...)  →  exports.name = function name(...)
    transformed = transformed.replace(
      /^\s*export\s+default\s+function\s+(\w+)/gm,
      'exports.$1 = function $1'
    );

    return transformed;
  }

  runHandler(code, handlerName, runtime) {
    const moduleExports = {};
    const moduleObj = { exports: moduleExports };

    const sandbox = {
      exports: moduleExports,
      module: moduleObj,
      require: () => { throw new Error('require is not available in APPSYNC_JS runtime'); },
      console: {
        log: (...a) => console.log('    [Resolver]', ...a),
        error: (...a) => console.error('    [Resolver]', ...a),
      },
      // APPSYNC_JS runtime globals
      util: runtime.util,
      runtime: runtime.runtime,
      ctx: runtime.ctx,
      context: runtime.ctx,
    };

    const vmContext = vm.createContext(sandbox);
    const wrapped = `(function(exports,module,util,runtime,ctx,context,console){${code}})(exports,module,util,runtime,ctx,context,console);`;
    new vm.Script(wrapped, { filename: 'resolver.js' }).runInContext(vmContext);

    // Resolve exports (handle both module.exports = {...} and exports.x = ...)
    const resolved = (sandbox.module.exports && sandbox.module.exports !== moduleExports)
      ? sandbox.module.exports
      : sandbox.exports;

    const handler = resolved[handlerName];
    if (typeof handler !== 'function') {
      const available = Object.keys(resolved).join(', ') || 'none';
      throw new Error(`Handler '${handlerName}' not found. Available: ${available}`);
    }

    return handler(runtime.ctx);
  }

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
        toDynamoDB: (value) => {
          if (typeof value === 'string') return { S: value };
          if (typeof value === 'number') return { N: String(value) };
          if (typeof value === 'boolean') return { BOOL: value };
          if (value == null) return { NULL: true };
          if (Array.isArray(value)) return { L: value };
          return { S: JSON.stringify(value) };
        },
        toMapValues: (obj) => {
          const r = {};
          for (const [k, v] of Object.entries(obj)) {
            if (typeof v === 'string') r[k] = { S: v };
            else if (typeof v === 'number') r[k] = { N: String(v) };
            else if (typeof v === 'boolean') r[k] = { BOOL: v };
            else if (v === null) r[k] = { NULL: true };
            else if (Array.isArray(v)) r[k] = { L: v };
            else r[k] = { S: JSON.stringify(v) };
          }
          return r;
        },
        fromMapValues: (obj) => {
          const r = {};
          for (const [k, a] of Object.entries(obj)) {
            if (a.S !== undefined) r[k] = a.S;
            else if (a.N !== undefined) r[k] = Number(a.N);
            else if (a.BOOL !== undefined) r[k] = a.BOOL;
            else if (a.NULL) r[k] = null;
            else if (a.L) r[k] = a.L;
            else if (a.M) r[k] = a.M;
          }
          return r;
        },
      },
      error: (message, type) => { const e = new Error(message); e.type = type; throw e; },
      appendError: (msg, type) => console.warn(`[JS] AppendError: ${type}: ${msg}`),
      toJson: (obj) => JSON.stringify(obj),
      parseJson: (str) => JSON.parse(str),
      urlEncode: (s) => encodeURIComponent(s),
      urlDecode: (s) => decodeURIComponent(s),
      base64Encode: (s) => Buffer.from(s).toString('base64'),
      base64Decode: (s) => Buffer.from(s, 'base64').toString('utf-8'),
      validate: (cond, msg, type) => {
        if (!cond) { const e = new Error(msg); e.type = type || 'ValidationError'; throw e; }
      },
    };

    const runtime = { earlyReturn: (result) => ({ __earlyReturn: true, result }) };

    return { ctx, util, runtime };
  }
}

module.exports = { JsResolver };
