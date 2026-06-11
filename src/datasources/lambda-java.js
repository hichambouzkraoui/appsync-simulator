const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Auto-increment debug ports for multiple Java Lambdas
let javaDebugPortOffset = 0;

/**
 * Java Lambda datasource.
 *
 * Runs each Lambda as a persistent process using a generic host (LambdaHost.java)
 * that loads the Lambda handler class via reflection and invokes its handleRequest method.
 *
 * The Lambda code requires NO modifications — it's a standard AWS Lambda with
 * a handler class implementing RequestHandler or a POJO handler method.
 *
 * Config in appsync.yaml:
 *   runtime: java
 *   projectPath: ../examples/java-lambda
 *   handler: com.example.MyHandler       # fully qualified class name
 *   buildCommand: mvn package -q         # optional, defaults to 'mvn package -q'
 */
class LambdaJavaDatasource {
  constructor(name, config) {
    this.name = name;
    this.projectPath = config.projectPath;
    this.handler = config.handler; // Fully qualified class name
    this.buildCommand = config.buildCommand || 'mvn package -q -DskipTests';

    this.process = null;
    this.startPromise = null;
    this.pending = null;
    this.buffer = '';
    this.reloading = false;

    console.log(`  [Lambda/Java] Initialized: ${name} → ${this.projectPath}`);
    this.startPromise = this.launch();
    this.watchForChanges();
  }

  async launch() {
    const projectDir = path.resolve(this.projectPath);

    // Build
    console.log(`  [Lambda/Java] Building ${this.name}...`);
    try {
      execSync(this.buildCommand, {
        cwd: projectDir,
        stdio: 'pipe',
        timeout: 120000,
      });
    } catch (err) {
      const out = err.stdout?.toString() || err.stderr?.toString() || err.message;
      throw new Error(`Failed to build ${this.name}: ${out}`);
    }

    // Find the JAR
    const jarPath = this.findJar(projectDir);

    // Find the LambdaHost.java host
    const hostJar = await this.ensureHostBuilt();

    // Launch: java -cp host.jar:lambda.jar LambdaHost <handlerClass>
    const cpSep = process.platform === 'win32' ? ';' : ':';
    const classpath = `${hostJar}${cpSep}${jarPath}${cpSep}${path.dirname(jarPath)}/*`;

    const javaArgs = ['-cp', classpath];

    // If JAVA_LAMBDA_DEBUG is set, enable remote debugging
    const debugPort = process.env.JAVA_LAMBDA_DEBUG;
    if (debugPort) {
      const port = parseInt(debugPort) + javaDebugPortOffset++;
      javaArgs.unshift(`-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:${port}`);
      console.log(`  [Lambda/Java]   🐛 Debug port: ${port}`);
    }

    javaArgs.push('LambdaHost', this.handler);

    console.log(`  [Lambda/Java] Launching ${this.name}`);

    this.process = spawn('java', javaArgs, {
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
      if (msg) console.log(`  [Lambda/Java/${this.name}] ${msg}`);
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
        console.log(`  [Lambda/Java] ${this.name} exited (code: ${code})`);
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
        () => reject(new Error(`${this.name} did not become ready in 60s`)),
        60000
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

    console.log(`  [Lambda/Java] ${this.name} ready (PID: ${this.process.pid})`);
  }

  watchForChanges() {
    const projectDir = path.resolve(this.projectPath);
    const srcDir = path.join(projectDir, 'src');
    if (!fs.existsSync(srcDir)) return;

    let debounce = null;
    fs.watch(srcDir, { recursive: true }, (event, filename) => {
      if (!filename?.endsWith('.java')) return;
      if (this.reloading) return;
      clearTimeout(debounce);
      debounce = setTimeout(() => this.reload(), 500);
    });
  }

  async reload() {
    this.reloading = true;
    console.log(`  [Lambda/Java] 🔄 ${this.name} changed — rebuilding...`);

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
      console.error(`  [Lambda/Java] 🔄 ${this.name} reload failed:`, err.message);
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
    console.log(`  [Lambda/Java] Invoking ${this.name} (${context.info?.fieldName})`);

    try {
      if (this.startPromise) await this.startPromise;

      const raw = await this.sendEvent(eventJson);
      console.log(`  [Lambda/Java] ${this.name} returned:`, raw.substring(0, 200));
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    } catch (err) {
      console.error(`  [Lambda/Java] ${this.name} error:`, err.message);
      throw new Error(`Lambda Java invocation failed: ${err.message}`);
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
   * Build the generic Java LambdaHost (shared across all Java datasources).
   */
  async ensureHostBuilt() {
    const hostDir = path.resolve(__dirname, '..', 'lambda-host-java');
    const hostClass = path.join(hostDir, 'LambdaHost.class');

    if (!fs.existsSync(hostClass)) {
      console.log(`  [Lambda/Java] Compiling LambdaHost...`);
      execSync('javac LambdaHost.java', { cwd: hostDir, stdio: 'pipe', timeout: 30000 });
    }

    return hostDir;
  }

  /**
   * Find the compiled JAR in target/ (Maven) or build/libs/ (Gradle).
   */
  findJar(projectDir) {
    // Maven: target/*.jar
    const targetDir = path.join(projectDir, 'target');
    if (fs.existsSync(targetDir)) {
      const jars = fs.readdirSync(targetDir).filter(
        (f) => f.endsWith('.jar') && !f.endsWith('-sources.jar') && !f.includes('original')
      );
      if (jars.length > 0) {
        return path.join(targetDir, jars[0]);
      }
    }

    // Gradle: build/libs/*.jar
    const libsDir = path.join(projectDir, 'build', 'libs');
    if (fs.existsSync(libsDir)) {
      const jars = fs.readdirSync(libsDir).filter(
        (f) => f.endsWith('.jar') && !f.endsWith('-sources.jar')
      );
      if (jars.length > 0) {
        return path.join(libsDir, jars[0]);
      }
    }

    throw new Error(`No JAR found in ${projectDir}. Run the build command first.`);
  }
}

module.exports = { LambdaJavaDatasource };
