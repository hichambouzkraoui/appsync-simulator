const express = require('express');
const cors = require('cors');
const { graphql } = require('graphql');
const { makeExecutableSchema } = require('@graphql-tools/schema');
const { loadConfig } = require('./config-loader');
const { createResolverExecutor } = require('./resolver-executor');

const PORT = process.env.PORT || 4000;
const CONFIG_DIR = process.env.CONFIG_DIR || './config';

async function startServer() {
  const config = await loadConfig(CONFIG_DIR);

  console.log('🚀 AppSync Local Simulator');
  console.log(`   Schema: ${config.schemaPath}`);
  console.log(`   Datasources: ${Object.keys(config.datasources).length}`);
  console.log(`   Resolvers: ${Object.keys(config.resolvers).length} mappings`);
  if (process.env.LAMBDAS) {
    console.log(`   Filter: ${process.env.LAMBDAS}`);
  }

  const executor = createResolverExecutor(config);
  const resolvers = buildResolvers(config, executor);
  const schema = makeExecutableSchema({ typeDefs: config.schema, resolvers });

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.post('/graphql', async (req, res) => {
    const { query, variables, operationName } = req.body;
    const context = {
      identity: req.headers['x-appsync-identity']
        ? JSON.parse(req.headers['x-appsync-identity'])
        : { sub: 'local-user', username: 'localdev' },
      request: { headers: req.headers },
      stash: {},
    };

    try {
      const result = await graphql({
        schema,
        source: query,
        variableValues: variables,
        operationName,
        contextValue: context,
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ errors: [{ message: error.message }] });
    }
  });

  app.get('/graphql', (req, res) => {
    res.json({ message: 'AppSync Local Simulator — POST to /graphql' });
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', resolvers: Object.keys(config.resolvers).length });
  });

  app.listen(PORT, () => {
    console.log(`\n✅ http://localhost:${PORT}/graphql\n`);
  });

  // Print summary after all async datasources are ready
  const pending = Object.values(executor.datasources)
    .filter((ds) => ds.startPromise)
    .map((ds) => ds.startPromise);

  Promise.all(pending).then(() => {
    const lambdaFilter = process.env.LAMBDAS
      ? process.env.LAMBDAS.split(',').map((s) => s.trim())
      : null;

    const lines = Object.entries(config.datasources)
      .filter(([, ds]) => ds.type !== 'NONE')
      .map(([name, ds]) => {
        let label;
        if (ds.type === 'AWS_LAMBDA') label = `${name} (${ds.config.runtime})`;
        else if (ds.type === 'AMAZON_DYNAMODB') label = `${name} (dynamodb → ${ds.config.tableName})`;
        else label = `${name} (${ds.type})`;

        // Show skip indicator for filtered-out Lambdas
        if (ds.type === 'AWS_LAMBDA' && lambdaFilter && !lambdaFilter.includes(name)) {
          return `   ○ ${label} — skipped`;
        }
        return `   ● ${label}`;
      });

    console.log('📦 Datasources:');
    lines.forEach((l) => console.log(l));
    console.log('');
  }).catch(() => {});
}

function buildResolvers(config, executor) {
  const resolvers = {};

  for (const [fieldPath, resolverConfig] of Object.entries(config.resolvers)) {
    const [typeName, fieldName] = fieldPath.split('.');
    if (!resolvers[typeName]) resolvers[typeName] = {};

    resolvers[typeName][fieldName] = async (parent, args, context) => {
      const appSyncContext = {
        arguments: args,
        source: parent,
        identity: context.identity,
        request: context.request,
        stash: context.stash,
        info: { fieldName, parentTypeName: typeName, selectionSetList: [] },
      };

      try {
        return await executor.execute(fieldPath, resolverConfig, appSyncContext);
      } catch (error) {
        console.error(`[${fieldPath}] Resolver error:`, error.message);
        throw error;
      }
    };
  }

  return resolvers;
}

startServer().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
