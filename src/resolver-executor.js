const { VtlResolver } = require('./resolvers/vtl-resolver');
const { JsResolver } = require('./resolvers/js-resolver');
const { LambdaJsDatasource } = require('./datasources/lambda-js');
const { LambdaDotnetDatasource } = require('./datasources/lambda-dotnet');
const { DynamoDBDatasource } = require('./datasources/dynamodb');
const { NoneDatasource } = require('./datasources/none');

/**
 * Creates a resolver executor that routes requests to the appropriate
 * resolver type (VTL or JS) and datasource.
 */
function createResolverExecutor(config) {
  // Initialize datasource instances
  const datasourceInstances = {};
  const readyPromises = [];

  for (const [name, dsConfig] of Object.entries(config.datasources)) {
    switch (dsConfig.type) {
      case 'AMAZON_DYNAMODB':
        datasourceInstances[name] = new DynamoDBDatasource(name, dsConfig.config);
        break;
      case 'AWS_LAMBDA':
        if (dsConfig.config.runtime === 'dotnet') {
          const ds = new LambdaDotnetDatasource(name, dsConfig.config);
          datasourceInstances[name] = ds;
          if (ds.debugReady) readyPromises.push(ds.debugReady);
        } else {
          datasourceInstances[name] = new LambdaJsDatasource(name, dsConfig.config);
        }
        break;
      case 'NONE':
        datasourceInstances[name] = new NoneDatasource(name);
        break;
      default:
        console.warn(`Unknown datasource type: ${dsConfig.type} for ${name}`);
        datasourceInstances[name] = new NoneDatasource(name);
    }
  }

  // Initialize resolver engines
  const vtlResolver = new VtlResolver();
  const jsResolver = new JsResolver();

  return {
    /**
     * Wait for all datasources to be ready (e.g. debug hosts starting up).
     */
    ready: () => Promise.all(readyPromises),

    /**
     * Execute a resolver for a given field.
     */
    async execute(fieldPath, resolverConfig, context) {
      const datasource = datasourceInstances[resolverConfig.datasource];
      if (!datasource) {
        throw new Error(`Datasource '${resolverConfig.datasource}' not found for ${fieldPath}`);
      }

      console.log(`[${fieldPath}] Executing ${resolverConfig.type} resolver → ${resolverConfig.datasource}`);

      if (resolverConfig.type === 'vtl') {
        return vtlResolver.execute(resolverConfig, datasource, context);
      } else if (resolverConfig.type === 'js') {
        return jsResolver.execute(resolverConfig, datasource, context);
      } else {
        throw new Error(`Unknown resolver type: ${resolverConfig.type}`);
      }
    },
  };
}

module.exports = { createResolverExecutor };
