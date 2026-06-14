#!/usr/bin/env node

/**
 * Interactive CLI launcher — lets you select which Lambdas to load.
 * Usage: node src/cli.mjs
 *
 * Displays a checkbox list of all Lambda datasources found in config.
 * Selected Lambdas get built and launched; unselected ones are skipped.
 * Press Enter to start the simulator with your selection.
 */

import { checkbox } from '@inquirer/prompts';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { loadConfig } = require('./config-loader.js');

const CONFIG_DIR = process.env.CONFIG_DIR || './config';

async function main() {
  const config = await loadConfig(CONFIG_DIR);

  // Collect all Lambda datasources
  const lambdas = Object.entries(config.datasources)
    .filter(([, ds]) => ds.type === 'AWS_LAMBDA')
    .map(([name, ds]) => ({
      name: `${name} (${ds.config.runtime})`,
      value: name,
      checked: true, // all selected by default
    }));

  if (lambdas.length === 0) {
    console.log('No Lambda datasources found in config.');
    process.env.LAMBDAS = '';
    startServer();
    return;
  }

  console.log('');
  const selected = await checkbox({
    message: 'Select Lambdas to load (↑↓ navigate, Space toggle, Enter confirm):',
    choices: lambdas,
  });

  // Pass selection as env var and start the server
  process.env.LAMBDAS = selected.join(',');

  console.log('');
  if (selected.length < lambdas.length) {
    const skipped = lambdas
      .filter((l) => !selected.includes(l.value))
      .map((l) => l.value);
    console.log(`Skipping: ${skipped.join(', ')}\n`);
  }

  await startServer();
}

async function startServer() {
  const { spawn } = await import('child_process');
  const useInspect = process.argv.includes('--inspect');
  const args = useInspect ? ['--inspect', 'src/server.js'] : ['src/server.js'];

  // Enable all debug ports when using --inspect
  if (useInspect) {
    process.env.JAVA_LAMBDA_DEBUG = process.env.JAVA_LAMBDA_DEBUG || '5005';
    process.env.PYTHON_LAMBDA_DEBUG = process.env.PYTHON_LAMBDA_DEBUG || '5678';
  }

  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });

  child.on('close', (code) => process.exit(code));
  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
}

main().catch((err) => {
  // Handle Ctrl+C gracefully
  if (err.name === 'ExitPromptError') {
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});
