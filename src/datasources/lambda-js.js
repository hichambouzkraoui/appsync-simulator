const path = require('path');
const { generateId } = require('../utils');

/**
 * JavaScript Lambda datasource.
 * Loads the Lambda module in-process and invokes its handler on each request.
 */
class LambdaJsDatasource {
  constructor(name, config) {
    this.name = name;
    this.functionPath = config.functionPath;
    this.handlerName = config.handler || 'handler';
    this.envVars = config.env || {};

    try {
      this.loadHandler();
      console.log(`  [Lambda/JS] ${name} ready`);
    } catch (err) {
      console.error(`  [Lambda/JS] ${name} failed to load: ${err.message}`);
    }
  }

  loadHandler() {
    const modulePath = path.resolve(this.functionPath);
    // Clear cache for hot-reload in dev
    if (process.env.NODE_ENV !== 'production') {
      delete require.cache[require.resolve(modulePath)];
    }
    const mod = require(modulePath);
    const handler = mod[this.handlerName];
    if (typeof handler !== 'function') {
      throw new Error(`Handler '${this.handlerName}' not found in ${this.functionPath}`);
    }
    return handler;
  }

  async invoke(request, context) {
    const handler = this.loadHandler();

    // Inject configured env vars for this Lambda
    const envBackup = {};
    for (const [k, v] of Object.entries(this.envVars)) {
      envBackup[k] = process.env[k];
      process.env[k] = v;
    }

    const event = {
      typeName: context.info?.parentTypeName || 'Query',
      fieldName: context.info?.fieldName || 'unknown',
      arguments: context.arguments || {},
      source: context.source || null,
      identity: context.identity || null,
      request: context.request || {},
      payload: request,
    };

    const lambdaContext = {
      functionName: this.name,
      functionVersion: '$LATEST',
      awsRequestId: generateId(),
      getRemainingTimeInMillis: () => 30000,
    };

    const result = await handler(event, lambdaContext);

    // Restore env vars
    for (const [k, v] of Object.entries(envBackup)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }

    return result;
  }
}

module.exports = { LambdaJsDatasource };
