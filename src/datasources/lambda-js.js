const path = require('path');

/**
 * JavaScript Lambda datasource.
 * Invokes a local JS Lambda function by requiring the module and calling its handler.
 */
class LambdaJsDatasource {
  constructor(name, config) {
    this.name = name;
    this.functionPath = config.functionPath;
    this.handlerName = config.handler || 'handler';
    this.handler = null;

    console.log(`  [Lambda/JS] Initialized: ${name} → ${this.functionPath}::${this.handlerName}`);
  }

  /**
   * Load the Lambda handler function.
   * Reloads on every call in dev mode for hot-reload support.
   */
  loadHandler() {
    const modulePath = path.resolve(this.functionPath);

    // Clear require cache for hot-reload in development
    if (process.env.NODE_ENV !== 'production') {
      delete require.cache[require.resolve(modulePath)];
    }

    const lambdaModule = require(modulePath);
    const handler = lambdaModule[this.handlerName];

    if (!handler || typeof handler !== 'function') {
      throw new Error(
        `Handler '${this.handlerName}' not found in ${this.functionPath}. ` +
        `Available exports: ${Object.keys(lambdaModule).join(', ')}`
      );
    }

    return handler;
  }

  /**
   * Invoke the Lambda function with an AppSync-style event.
   */
  async invoke(request, context) {
    const handler = this.loadHandler();

    // Build Lambda event in AppSync Lambda resolver format
    const event = {
      // AppSync Lambda resolver event format
      typeName: context.info?.parentTypeName || 'Query',
      fieldName: context.info?.fieldName || 'unknown',
      arguments: context.arguments || {},
      source: context.source || null,
      identity: context.identity || null,
      request: context.request || {},
      // Also include the resolver request payload
      payload: request,
    };

    // Build a minimal Lambda context
    const lambdaContext = {
      functionName: this.name,
      functionVersion: '$LATEST',
      memoryLimitInMB: 128,
      logGroupName: `/aws/lambda/${this.name}`,
      logStreamName: `local/${new Date().toISOString()}`,
      invokedFunctionArn: `arn:aws:lambda:us-east-1:000000000000:function:${this.name}`,
      awsRequestId: generateRequestId(),
      getRemainingTimeInMillis: () => 30000,
    };

    console.log(`  [Lambda/JS] Invoking ${this.name} (${context.info?.fieldName})`);

    try {
      const result = await handler(event, lambdaContext);
      console.log(`  [Lambda/JS] ${this.name} returned:`, JSON.stringify(result).substring(0, 200));
      return result;
    } catch (error) {
      console.error(`  [Lambda/JS] ${this.name} error:`, error.message);
      throw new Error(`Lambda invocation failed: ${error.message}`);
    }
  }
}

function generateRequestId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

module.exports = { LambdaJsDatasource };
