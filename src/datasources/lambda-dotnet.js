const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * .NET Lambda datasource.
 *
 * Runs each Lambda as a persistent process using a stdin/stdout JSON line protocol.
 * State is preserved across invocations, just like JS Lambdas loaded via require().
 *
 * Each Lambda's .NET project must support persistent mode (LAMBDA_PERSISTENT=1):
 *   - Print __READY__ to stdout on startup
 *   - Read one JSON event per line from stdin
 *   - Write one JSON response per line to stdout
 *
 * The process is launched using the compiled binary directly so the OS process name
 * matches the assembly name (visible in the IDE debugger process picker).
 */
class LambdaDotnetDatasource {
  constructor(name, config) {
    this.name = name;
    this.projectPath = config.projectPath;
    this.assembly = config.assembly || path.basename(config.projectPath);
    this.handler = config.handler;

    this.process = null;
    this.startPromise = null;
    this.pending = null;
    this.buffer = '';

    console.log(`  [Lambda/.NET] Initialized: ${name} → ${this.projectPath}`);
    this.startPromise = this.launch();
  }

  async launch() {
    const projectDir = path.resolve(this.projectPath);

    // Always build Debug for local dev — enables breakpoints and PDB symbols
    console.log(`  [Lambda/.NET] Building ${this.name}...`);
    try {
      execSync('dotnet build -c Debug --nologo -v quiet', {
        cwd: projectDir,
        stdio: 'pipe',
        timeout: 60000,
      });
    } catch (err) {
      const out = err.stdout?.toString() || err.stderr?.toString() || err.message;
      throw new Error(`Failed to build ${this.name}: ${out}`);
    }

    // Launch the compiled binary directly (process name = assembly name)
    const binaryPath = this.findBinary(projectDir);
    console.log(`  [Lambda/.NET] Launching ${path.basename(binaryPath)}`);

    this.process = spawn(binaryPath, [], {
      cwd: projectDir,
      env: {
        ...process.env,
        DOTNET_ROOT: '/usr/local/share/dotnet',
        AWS_LAMBDA_FUNCTION_NAME: this.name,
        AWS_REGION: 'us-east-1',
        LAMBDA_PERSISTENT: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.log(`  [Lambda/.NET/${this.name}] ${msg}`);
    });

    this.process.stdout.on('data', (data) => {
      this.buffer += data.toString();
      let nl;
      while ((nl = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, nl).trim();
        this.buffer = this.buffer.slice(nl + 1);
        if (line === '__READY__') continue;
        if (line && this.pending) {
          const { resolve } = this.pending;
          this.pending = null;
          resolve(line);
        }
      }
    });

    this.process.on('close', (code) => {
      console.log(`  [Lambda/.NET] ${this.name} exited (code: ${code})`);
      this.process = null;
      if (this.pending) {
        this.pending.reject(new Error(`${this.name} process exited (code ${code})`));
        this.pending = null;
      }
    });

    // Wait for __READY__ signal
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`${this.name} did not become ready in 30s`)),
        30000
      );
      const onData = (data) => {
        if (data.toString().includes('__READY__')) {
          this.process.stdout.removeListener('data', onData);
          clearTimeout(timeout);
          resolve();
        }
      };
      this.process.stdout.on('data', onData);
    });

    console.log(`  [Lambda/.NET] ${this.name} ready (PID: ${this.process.pid})`);
  }

  async invoke(request, context) {
    const event = {
      typeName: context.info?.parentTypeName || 'Mutation',
      fieldName: context.info?.fieldName || 'unknown',
      arguments: context.arguments || {},
      source: context.source || null,
      identity: context.identity || null,
      request: context.request || {},
      payload: request,
    };

    const eventJson = JSON.stringify(event);
    console.log(`  [Lambda/.NET] Invoking ${this.name} (${context.info?.fieldName})`);

    try {
      if (this.startPromise) await this.startPromise;

      const raw = await this.sendEvent(eventJson);
      console.log(`  [Lambda/.NET] ${this.name} returned:`, raw.substring(0, 200));
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    } catch (err) {
      console.error(`  [Lambda/.NET] ${this.name} error:`, err.message);
      throw new Error(`Lambda .NET invocation failed: ${err.message}`);
    }
  }

  sendEvent(eventJson) {
    return new Promise((resolve, reject) => {
      if (!this.process) {
        reject(new Error(`${this.name} process is not running`));
        return;
      }

      const timeout = setTimeout(() => {
        this.pending = null;
        reject(new Error(`${this.name} timed out after 30s`));
      }, 30000);

      this.pending = {
        resolve: (v) => { clearTimeout(timeout); resolve(v); },
        reject: (e) => { clearTimeout(timeout); reject(e); },
      };

      // Send event as a single JSON line
      this.process.stdin.write(eventJson.replace(/\n/g, ' ') + '\n');
    });
  }

  /**
   * Find the compiled binary in bin/Debug/net{version}/{assembly}
   */
  findBinary(projectDir) {
    const binDir = path.join(projectDir, 'bin', 'Debug');
    if (!fs.existsSync(binDir)) {
      throw new Error(`Build output not found: ${binDir}`);
    }

    const frameworks = fs.readdirSync(binDir).filter((d) =>
      fs.statSync(path.join(binDir, d)).isDirectory() && d.startsWith('net')
    );

    if (frameworks.length === 0) {
      throw new Error(`No framework folder found in ${binDir}`);
    }

    const binaryPath = path.join(binDir, frameworks[0], this.assembly);
    if (!fs.existsSync(binaryPath)) {
      throw new Error(`Binary not found: ${binaryPath}`);
    }

    return binaryPath;
  }
}

module.exports = { LambdaDotnetDatasource };
