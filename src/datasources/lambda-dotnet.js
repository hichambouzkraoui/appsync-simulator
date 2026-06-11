const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Build the LambdaHost once on first use
let hostBinaryPath = null;
let hostBuildPromise = null;

/**
 * .NET Lambda datasource.
 *
 * Runs each Lambda as a persistent process using a generic host (LambdaHost)
 * that loads the Lambda DLL via reflection and invokes its handler method.
 *
 * The Lambda code requires NO modifications — it's a standard .NET Lambda with
 * a static handler method. The host manages the stdin/stdout protocol.
 *
 * Process names in the debugger match the Lambda's <AssemblyName> from its .csproj.
 */
class LambdaDotnetDatasource {
  constructor(name, config) {
    this.name = name;
    this.projectPath = config.projectPath;
    this.assembly = config.assembly || path.basename(config.projectPath);
    this.handler = config.handler; // Format: Assembly::Namespace.Class::Method

    this.process = null;
    this.startPromise = null;
    this.pending = null;
    this.buffer = '';
    this.reloading = false;

    console.log(`  [Lambda/.NET] Initialized: ${name} → ${this.projectPath}`);
    this.startPromise = this.launch();
    this.watchForChanges();
  }

  async launch() {
    const projectDir = path.resolve(this.projectPath);

    // Build the Lambda project
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

    // Build the generic LambdaHost (once)
    const hostBinary = await this.ensureHostBuilt();

    // Find the Lambda DLL
    const lambdaDll = this.findDll(projectDir);
    console.log(`  [Lambda/.NET] Launching ${this.name} via LambdaHost`);

    // Launch: LambdaHost <dll> <handler>
    this.process = spawn(hostBinary, [lambdaDll, this.handler], {
      cwd: projectDir,
      env: {
        ...process.env,
        AWS_LAMBDA_FUNCTION_NAME: this.name,
        AWS_REGION: 'us-east-1',
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
      if (!this.reloading) {
        console.log(`  [Lambda/.NET] ${this.name} exited (code: ${code})`);
      }
      this.process = null;
      if (this.pending) {
        this.pending.reject(new Error(`${this.name} process exited (code ${code})`));
        this.pending = null;
      }
    });

    // Wait for __READY__
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`${this.name} did not become ready in 30s`)),
        30000
      );
      const onData = (data) => {
        if (data.toString().includes('__READY__')) {
          if (this.process) {
            this.process.stdout.removeListener('data', onData);
          }
          clearTimeout(timeout);
          resolve();
        }
      };
      if (!this.process) {
        clearTimeout(timeout);
        return reject(new Error(`${this.name} process exited before ready`));
      }
      this.process.stdout.on('data', onData);
    });

    console.log(`  [Lambda/.NET] ${this.name} ready (PID: ${this.process.pid})`);
  }

  /**
   * Watch .cs files in the project directory — rebuild and relaunch on change.
   */
  watchForChanges() {
    const projectDir = path.resolve(this.projectPath);
    let debounce = null;

    fs.watch(projectDir, { recursive: true }, (event, filename) => {
      if (!filename?.endsWith('.cs')) return;
      if (this.reloading) return;

      clearTimeout(debounce);
      debounce = setTimeout(() => this.reload(), 500);
    });
  }

  async reload() {
    this.reloading = true;
    console.log(`  [Lambda/.NET] 🔄 ${this.name} changed — rebuilding...`);

    // Kill the existing process and wait for it to exit
    if (this.process) {
      const proc = this.process;
      this.process = null;
      this.buffer = '';
      this.pending = null;

      await new Promise((resolve) => {
        proc.on('close', resolve);
        proc.kill();
      });
    }

    try {
      this.startPromise = this.launch();
      await this.startPromise;
    } catch (err) {
      console.error(`  [Lambda/.NET] 🔄 ${this.name} reload failed:`, err.message);
    }

    this.reloading = false;
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

      this.process.stdin.write(eventJson.replace(/\n/g, ' ') + '\n');
    });
  }

  /**
   * Build the generic LambdaHost binary (shared across all .NET datasources).
   */
  async ensureHostBuilt() {
    if (hostBinaryPath) return hostBinaryPath;

    if (!hostBuildPromise) {
      hostBuildPromise = (async () => {
        const hostDir = path.resolve(__dirname, '..', 'lambda-host');
        console.log(`  [Lambda/.NET] Building LambdaHost...`);
        try {
          execSync('dotnet build -c Debug --nologo -v quiet', {
            cwd: hostDir,
            stdio: 'pipe',
            timeout: 60000,
          });
        } catch (err) {
          const out = err.stdout?.toString() || err.stderr?.toString() || err.message;
          throw new Error(`Failed to build LambdaHost: ${out}`);
        }

        const ext = process.platform === 'win32' ? '.exe' : '';
        const binDir = path.join(hostDir, 'bin', 'Debug');
        const frameworks = fs.readdirSync(binDir).filter(
          (d) => fs.statSync(path.join(binDir, d)).isDirectory() && d.startsWith('net')
        );
        hostBinaryPath = path.join(binDir, frameworks[0], 'LambdaHost' + ext);

        if (!fs.existsSync(hostBinaryPath)) {
          throw new Error(`LambdaHost binary not found: ${hostBinaryPath}`);
        }

        return hostBinaryPath;
      })();
    }

    return hostBuildPromise;
  }

  /**
   * Find the compiled Lambda DLL in bin/Debug/net{version}/{assembly}.dll
   */
  findDll(projectDir) {
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

    const dllPath = path.join(binDir, frameworks[0], this.assembly + '.dll');
    if (!fs.existsSync(dllPath)) {
      throw new Error(`Lambda DLL not found: ${dllPath}`);
    }

    return dllPath;
  }
}

module.exports = { LambdaDotnetDatasource };
