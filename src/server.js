const express = require('express');
const cors = require('cors');
const { graphql } = require('graphql');
const { makeExecutableSchema } = require('@graphql-tools/schema');
const { loadConfig } = require('./config-loader');
const { createResolverExecutor } = require('./resolver-executor');

const PORT = process.env.PORT || 4000;
const CONFIG_DIR = process.env.CONFIG_DIR || './config';

async function startServer() {
  console.log('🚀 AppSync Local Simulator starting...');
  console.log(`📁 Config directory: ${CONFIG_DIR}`);

  // Load configuration
  const config = await loadConfig(CONFIG_DIR);
  console.log(`📋 Schema loaded: ${config.schemaPath}`);
  console.log(`📦 Datasources: ${Object.keys(config.datasources).join(', ')}`);
  console.log(`🔗 Resolvers: ${Object.keys(config.resolvers).length} mappings`);

  // Build the resolver executor
  const executor = createResolverExecutor(config);

  // Build GraphQL resolvers from config
  const resolvers = buildResolvers(config, executor);

  // Create executable schema
  const schema = makeExecutableSchema({
    typeDefs: config.schema,
    resolvers,
  });

  // Set up Express
  const app = express();
  app.use(cors());
  app.use(express.json());

  // GraphQL endpoint
  app.post('/graphql', async (req, res) => {
    const { query, variables, operationName } = req.body;

    const context = {
      identity: req.headers['x-appsync-identity']
        ? JSON.parse(req.headers['x-appsync-identity'])
        : { sub: 'local-user', username: 'localdev' },
      request: {
        headers: req.headers,
      },
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
      console.error('GraphQL execution error:', error);
      res.status(500).json({
        errors: [{ message: error.message }],
      });
    }
  });

  // Introspection endpoint for tooling
  app.get('/graphql', (req, res) => {
    res.json({
      message: 'AppSync Local Simulator - Use POST for GraphQL queries',
      endpoint: '/graphql',
      docs: 'Send POST requests with { query, variables, operationName }',
    });
  });

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', resolvers: Object.keys(config.resolvers).length });
  });

  app.listen(PORT, () => {
    console.log(`\n✅ AppSync Local Simulator running at http://localhost:${PORT}/graphql`);
    console.log(`   Health check: http://localhost:${PORT}/health\n`);
  });
}

function buildResolvers(config, executor) {
  const resolvers = { Query: {}, Mutation: {} };

  for (const [fieldPath, resolverConfig] of Object.entries(config.resolvers)) {
    const [typeName, fieldName] = fieldPath.split('.');

    if (!resolvers[typeName]) {
      resolvers[typeName] = {};
    }

    resolvers[typeName][fieldName] = async (parent, args, context, info) => {
      const appSyncContext = {
        arguments: args,
        source: parent,
        identity: context.identity,
        request: context.request,
        stash: context.stash,
        info: {
          fieldName,
          parentTypeName: typeName,
          selectionSetList: [],
        },
      };

      try {
        const result = await executor.execute(fieldPath, resolverConfig, appSyncContext);
        return result;
      } catch (error) {
        console.error(`[${fieldPath}] Resolver error:`, error.message);
        throw error;
      }
    };
  }

  return resolvers;
}

startServer().catch((err) => {
  console.error('Failed to start AppSync simulator:', err);
  process.exit(1);
});
