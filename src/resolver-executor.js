const { VtlResolver } = require('./resolvers/vtl-resolver');
const { JsResolver } = require('./resolvers/js-resolver');
const { LambdaJsDatasource } = require('./datasources/lambda-js');
const { LambdaDotnetDatasource } = require('./datasources/lambda-dotnet');
const { LambdaJavaDatasource } = require('./datasources/lambda-java');
const { LambdaPythonDatasource } = require('./datasources/lambda-python');
const { DynamoDBDatasource } = require('./datasources/dynamodb');
const { NoneDatasource } = require('./datasources/none');

/**
 * Creates a resolver executor that routes requests to the appropriate
 * resolver type (VTL or JS) and datasource.
 */
function createResolverExecutor(config) {
  const datasourceInstances = {};

  for (const [name, dsConfig] of Object.entries(config.datasources)) {
    switch (dsConfig.type) {
      case 'AMAZON_DYNAMODB':
        datasourceInstances[name] = new DynamoDBDatasource(name, dsConfig.config);
        break;
      case 'AWS_LAMBDA':
        if (dsConfig.config.runtime === 'dotnet') {
          datasourceInstances[name] = new LambdaDotnetDatasource(name, dsConfig.config);
        } else if (dsConfig.config.runtime === 'java') {
          datasourceInstances[name] = new LambdaJavaDatasource(name, dsConfig.config);
        } else if (dsConfig.config.runtime === 'python') {
          datasourceInstances[name] = new LambdaPythonDatasource(name, dsConfig.config);
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

  const vtlResolver = new VtlResolver();
  const jsResolver = new JsResolver();

  return {
    datasources: datasourceInstances,

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
