const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Auto-increment debug ports for multiple Python Lambdas
let pythonDebugPortOffset = 0;

/**
 * Python Lambda datasource.
 *
 * Runs each Lambda as a persistent process using a generic host (lambda_host.py)
 * that imports the handler module and invokes it repeatedly via stdin/stdout.
 *
 * The Lambda code requires NO modifications — standard AWS Lambda handler signature:
 *   def handler(event, context): ...
 *
 * Config in appsync.yaml:
 *   runtime: python
 *   functionPath: ../examples/python-lambda/handler.py
 *   handler: handler          # function name in the module
 */
class LambdaPythonDatasource {
  constructor(name, config) {
    this.name = name;
    this.functionPath = config.functionPath;
    this.handlerName = config.handler || 'handler';

    this.process = null;
    this.startPromise = null;
    this.pending = null;
    this.buffer = '';
    this.reloading = false;

    console.log(`  [Lambda/Python] Initialized: ${name} → ${this.functionPath}`);
    this.startPromise = this.launch();
    this.watchForChanges();
  }

  async launch() {
    const functionPath = path.resolve(this.functionPath);
    if (!fs.existsSync(functionPath)) {
      throw new Error(`Python Lambda not found: ${functionPath}`);
    }

    const hostScript = path.resolve(__dirname, '..', 'lambda-host-python', 'lambda_host.py');
    const python = this.findPython(path.dirname(functionPath));

    // Assign debug port if PYTHON_LAMBDA_DEBUG is set
    const baseDebugPort = process.env.PYTHON_LAMBDA_DEBUG;
    let debugPort = null;
    if (baseDebugPort) {
      debugPort = parseInt(baseDebugPort) + pythonDebugPortOffset++;
    }

    console.log(`  [Lambda/Python] Launching ${this.name}`);
    if (debugPort) {
      console.log(`  [Lambda/Python]   🐛 Debug port: ${debugPort}`);
    }

    this.process = spawn(python, [hostScript, functionPath, this.handlerName], {
      cwd: path.dirname(functionPath),
      env: {
        ...process.env,
        AWS_LAMBDA_FUNCTION_NAME: this.name,
        AWS_REGION: 'us-east-1',
        PYTHONDONTWRITEBYTECODE: '1',
        ...(debugPort && { PYTHON_LAMBDA_DEBUG: String(debugPort) }),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.log(`  [Lambda/Python/${this.name}] ${msg}`);
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
        console.log(`  [Lambda/Python] ${this.name} exited (code: ${code})`);
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
        () => reject(new Error(`${this.name} did not become ready in 15s`)),
        15000
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

    console.log(`  [Lambda/Python] ${this.name} ready (PID: ${this.process.pid})`);
  }

  watchForChanges() {
    const dir = path.dirname(path.resolve(this.functionPath));
    let debounce = null;

    fs.watch(dir, { recursive: true }, (event, filename) => {
      if (!filename?.endsWith('.py')) return;
      if (this.reloading) return;
      clearTimeout(debounce);
      debounce = setTimeout(() => this.reload(), 500);
    });
  }

  async reload() {
    this.reloading = true;
    console.log(`  [Lambda/Python] 🔄 ${this.name} changed — reloading...`);

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
      console.error(`  [Lambda/Python] 🔄 ${this.name} reload failed:`, err.message);
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
    console.log(`  [Lambda/Python] Invoking ${this.name} (${context.info?.fieldName})`);

    try {
      if (this.startPromise) await this.startPromise;

      const raw = await this.sendEvent(eventJson);
      console.log(`  [Lambda/Python] ${this.name} returned:`, raw.substring(0, 200));
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    } catch (err) {
      console.error(`  [Lambda/Python] ${this.name} error:`, err.message);
      throw new Error(`Lambda Python invocation failed: ${err.message}`);
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
   * Find the best Python executable — prefer a local .venv if it exists.
   */
  findPython(dir) {
    // Check for .venv in the Lambda directory
    const venvPython = process.platform === 'win32'
      ? path.join(dir, '.venv', 'Scripts', 'python.exe')
      : path.join(dir, '.venv', 'bin', 'python3');

    if (fs.existsSync(venvPython)) {
      return venvPython;
    }

    return process.platform === 'win32' ? 'python' : 'python3';
  }
}

module.exports = { LambdaPythonDatasource };
