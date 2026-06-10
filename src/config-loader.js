const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Loads the AppSync simulator configuration from the config directory.
 */
async function loadConfig(configDir) {
  const configPath = path.resolve(configDir, 'appsync.yaml');

  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  const rawConfig = yaml.load(fs.readFileSync(configPath, 'utf-8'));

  // Load GraphQL schema
  const schemaPath = path.resolve(configDir, rawConfig.schema);
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found: ${schemaPath}`);
  }
  const schema = fs.readFileSync(schemaPath, 'utf-8');

  // Process datasources
  const datasources = {};
  for (const [name, dsConfig] of Object.entries(rawConfig.datasources || {})) {
    datasources[name] = {
      ...dsConfig,
      // Resolve relative paths
      config: resolvePaths(dsConfig.config || {}, configDir),
    };
  }

  // Process resolvers
  const resolvers = {};
  for (const [fieldPath, resolverConfig] of Object.entries(rawConfig.resolvers || {})) {
    resolvers[fieldPath] = {
      ...resolverConfig,
      // Resolve file paths in resolver config
      ...(resolverConfig.requestTemplate && {
        requestTemplate: path.resolve(configDir, resolverConfig.requestTemplate),
      }),
      ...(resolverConfig.responseTemplate && {
        responseTemplate: path.resolve(configDir, resolverConfig.responseTemplate),
      }),
      ...(resolverConfig.code && {
        code: path.resolve(configDir, resolverConfig.code),
      }),
    };
  }

  return {
    schema,
    schemaPath,
    datasources,
    resolvers,
    configDir,
  };
}

function resolvePaths(config, configDir) {
  const resolved = { ...config };

  if (resolved.functionPath) {
    resolved.functionPath = path.resolve(configDir, resolved.functionPath);
  }
  if (resolved.projectPath) {
    resolved.projectPath = path.resolve(configDir, resolved.projectPath);
  }

  return resolved;
}

module.exports = { loadConfig };
