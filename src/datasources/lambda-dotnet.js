const { execSync, spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

/**
 * .NET Lambda datasource.
 *
 * Normal mode: spawns `dotnet run` per invocation.
 *
 * Debug mode (DOTNET_LAMBDA_DEBUG_PORT env var):
 *   Waits for an external .NET debug server (launched by the IDE with debugger
 *   attached) and routes all invocations to it via HTTP.
 *   The IDE compound config handles launching both processes.
 */
class LambdaDotnetDatasource {
  constructor(name, config) {
    this.name = name;
    this.projectPath = config.projectPath;
    this.assembly = config.assembly || path.basename(config.projectPath);
    this.handler = config.handler;
    this.built = false;
    this.debugPort = process.env.DOTNET_LAMBDA_DEBUG_PORT || null;
    this.debugReady = null;

    console.log(`  [Lambda/.NET] Initialized: ${name} → ${this.projectPath}`);

    if (this.debugPort) {
      console.log(`  [Lambda/.NET] 🐛 Debug mode on port ${this.debugPort}`);
      this.debugConnected = false;
      this.debugReady = this.launchAndWait();
    }
  }

  /**
   * Build, launch, and wait for the debug host to be ready.
   */
  async launchAndWait() {
    const hostDir = path.resolve(__dirname, '..', 'debug-host');

    // Build
    console.log(`  [Lambda/.NET] Building debug host...`);
    try {
      execSync('dotnet build -c Debug --nologo -v quiet', {
        cwd: hostDir,
        stdio: 'pipe',
        timeout: 60000,
      });
    } catch (error) {
      const output = error.stdout?.toString() || error.stderr?.toString() || error.message;
      console.error(`  [Lambda/.NET] Build failed:`, output);
      this.debugPort = null;
      return;
    }

    // Launch
    const binaryPath = path.join(hostDir, 'bin', 'Debug', 'net8.0', 'DebugHost');
    this.debugProcess = spawn(binaryPath, [], {
      cwd: hostDir,
      env: {
        ...process.env,
        DOTNET_ROOT: '/usr/local/share/dotnet',
        LAMBDA_DEBUG_PORT: this.debugPort,
        ASPNETCORE_URLS: `http://localhost:${this.debugPort}`,
        DEBUGHOST_PID_FILE: path.resolve('.debughost.pid'),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.debugProcess.stdout.on('data', (data) => {
      console.log(`  [Lambda/.NET/host] ${data.toString().trim()}`);
    });
    this.debugProcess.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.log(`  [Lambda/.NET/host] ${msg}`);
    });
    this.debugProcess.on('close', (code) => {
      console.log(`  [Lambda/.NET] Debug host exited (code: ${code})`);
      this.debugProcess = null;
      this.debugConnected = false;
    });

    // Wait for health
    await this.waitForReady();
    this.debugConnected = true;
    // Print PID so user can attach debugger
    console.log(`  [Lambda/.NET] 🐛 Debug host PID: ${this.debugProcess.pid}`);
    console.log(`  [Lambda/.NET]    Attach debugger: Run & Debug → "Attach to .NET Lambda"`);
  }

  /**
   * Poll the health endpoint until the debug server is ready.
   */
  waitForReady() {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 60; // 30 seconds

      const check = () => {
        attempts++;
        const req = http.get(`http://localhost:${this.debugPort}/health`, (res) => {
          if (res.statusCode === 200) {
            console.log(`  [Lambda/.NET] 🐛 Debug server ready on port ${this.debugPort}`);
            resolve();
          } else if (attempts < maxAttempts) {
            setTimeout(check, 500);
          } else {
            reject(new Error('Debug host did not become ready'));
          }
        });
        req.on('error', () => {
          if (attempts < maxAttempts) {
            setTimeout(check, 500);
          } else {
            reject(new Error(`Debug host not reachable on port ${this.debugPort}`));
          }
        });
        req.end();
      };

      check();
    });
  }

  /**
   * Ensure the .NET project is built (normal mode only).
   */
  ensureBuilt() {
    if (this.built) return;

    const projectDir = path.resolve(this.projectPath);
    const csprojFiles = fs.readdirSync(projectDir).filter(f => f.endsWith('.csproj'));

    if (csprojFiles.length === 0) {
      throw new Error(`No .csproj file found in ${projectDir}`);
    }

    console.log(`  [Lambda/.NET] Building ${this.name}...`);

    try {
      execSync('dotnet build -c Release --nologo -v quiet', {
        cwd: projectDir,
        stdio: 'pipe',
        timeout: 60000,
      });
      this.built = true;
      console.log(`  [Lambda/.NET] Build successful`);
    } catch (error) {
      const output = error.stdout?.toString() || error.stderr?.toString() || error.message;
      throw new Error(`Failed to build .NET Lambda: ${output}`);
    }
  }

  /**
   * Invoke the .NET Lambda function.
   */
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
      let result;

      if (this.debugPort) {
        if (this.debugReady) await this.debugReady;
        result = await this.invokeViaHttp(eventJson);
      } else {
        this.ensureBuilt();
        result = await this.executeDotnet(path.resolve(this.projectPath), eventJson);
      }

      console.log(`  [Lambda/.NET] ${this.name} returned:`, result.substring(0, 200));

      try {
        return JSON.parse(result);
      } catch {
        return result;
      }
    } catch (error) {
      console.error(`  [Lambda/.NET] ${this.name} error:`, error.message);
      throw new Error(`Lambda .NET invocation failed: ${error.message}`);
    }
  }

  /**
   * Send event to the debug HTTP server via POST.
   * Timeout is long (120s) because the user may be paused at a breakpoint.
   */
  invokeViaHttp(eventJson) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port: parseInt(this.debugPort),
        path: '/invoke',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(eventJson),
        },
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(data);
          } else {
            reject(new Error(`Debug server returned ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        if (error.code === 'ECONNREFUSED') {
          reject(new Error(`.NET debug server disconnected on port ${this.debugPort}.`));
        } else {
          reject(error);
        }
      });

      req.setTimeout(120000, () => {
        req.destroy();
        reject(new Error('Request timed out (120s) — still paused at breakpoint?'));
      });

      req.write(eventJson);
      req.end();
    });
  }

  /**
   * Normal mode: spawn dotnet run per invocation.
   */
  executeDotnet(projectDir, eventJson) {
    return new Promise((resolve, reject) => {
      const proc = spawn('dotnet', ['run', '--no-build', '-c', 'Release'], {
        cwd: projectDir,
        env: {
          ...process.env,
          LAMBDA_EVENT: eventJson,
          AWS_LAMBDA_FUNCTION_NAME: this.name,
          AWS_REGION: 'us-east-1',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.stdin.write(eventJson);
      proc.stdin.end();

      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error('Lambda .NET execution timed out (30s)'));
      }, 30000);

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`Process exited with code ${code}: ${stderr}`));
          return;
        }
        const lines = stdout.trim().split('\n');
        resolve(lines[lines.length - 1]);
      });

      proc.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }
}

module.exports = { LambdaDotnetDatasource };
