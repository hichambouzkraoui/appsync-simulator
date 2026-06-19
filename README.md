# AppSync Local Simulator

A local AWS AppSync simulator for debugging your backend. Supports VTL and JavaScript resolvers with Lambda (JS, .NET, Java, Python) and DynamoDB datasources.

## Features

- GraphQL endpoint with query, mutation, and introspection support
- AppSync scalar types (`AWSDate`, `AWSDateTime`, `AWSJSON`, etc.) and directives (`@aws_auth`, `@aws_iam`, etc.)
- VTL resolvers with AppSync `$util` helpers
- JavaScript resolvers (APPSYNC_JS runtime with `import { util } from '@aws-appsync/utils'`)
- Lambda datasources: JS, .NET, Java, Python — all persistent with shared in-memory state
- DynamoDB datasource — connects to DynamoDB Local, AWS, or in-memory fallback
- NONE datasource for local/computed resolvers
- Shared and per-Lambda environment variables
- Lambda selection CLI — choose which Lambdas to load at startup
- Hot-reload on file changes (.cs, .java, .py)
- Cross-platform — macOS, Linux, Windows

## Quick Start

```bash
npm install
npm start
```

GraphQL endpoint: `http://localhost:4000/graphql`

## Project Structure

```
├── src/
│   ├── server.js              # Express + GraphQL endpoint
│   ├── config-loader.js       # Loads appsync.yaml config
│   ├── resolver-executor.js   # Routes to VTL or JS resolver engine
│   ├── resolvers/
│   │   ├── vtl-resolver.js    # VTL template execution
│   │   └── js-resolver.js     # APPSYNC_JS runtime (supports import/export)
│   ├── datasources/
│   │   ├── dynamodb.js        # DynamoDB (local, AWS, or in-memory)
│   │   ├── lambda-js.js       # JS Lambda (in-process)
│   │   ├── lambda-dotnet.js   # .NET Lambda (via LambdaHost reflection)
│   │   ├── lambda-java.js     # Java Lambda (via LambdaHost reflection)
│   │   ├── lambda-python.js   # Python Lambda (via lambda_host.py)
│   │   └── none.js            # Pass-through datasource
│   ├── lambda-host/           # Generic .NET host
│   ├── lambda-host-java/      # Generic Java host
│   └── lambda-host-python/    # Generic Python host
├── config/
│   ├── appsync.yaml           # Datasources + resolver mappings + env
│   └── schema.graphql         # GraphQL schema
├── resolvers/
│   ├── vtl/                   # VTL mapping templates
│   └── js/                    # APPSYNC_JS resolvers
├── examples/
│   ├── js-lambda/             # JS — order service
│   ├── product-catalog-lambda/# JS — product catalog
│   ├── dotnet-lambda/         # .NET — order processor
│   ├── payment-lambda/        # .NET — payment service
│   ├── java-lambda/           # Java — inventory service
│   ├── python-lambda/         # Python — notification service
│   └── frontend/              # React app for E2E testing
├── api.http                   # HTTP file for testing endpoints
└── scripts/
```

## Configuration

Edit `config/appsync.yaml`:

```yaml
schema: schema.graphql

# Shared env variables — injected into ALL Lambdas
env:
  STAGE: local
  LOG_LEVEL: debug
  TABLE_PREFIX: dev-

datasources:
  # DynamoDB — local with in-memory fallback
  UsersTable:
    type: AMAZON_DYNAMODB
    config:
      tableName: Users
      endpoint: http://localhost:8000    # omit for real AWS
      region: us-east-1

  # DynamoDB — real AWS (uses your credentials)
  ProdTable:
    type: AMAZON_DYNAMODB
    config:
      tableName: Users-prod
      region: us-east-1

  # JS Lambda
  MyJsLambda:
    type: AWS_LAMBDA
    config:
      runtime: nodejs
      functionPath: ../examples/my-lambda/index.js
      handler: handler
      env:
        MY_VAR: value    # per-Lambda env (overrides shared)

  # .NET Lambda
  MyDotnetLambda:
    type: AWS_LAMBDA
    config:
      runtime: dotnet
      projectPath: ../examples/my-dotnet-lambda
      assembly: MyDotnetLambda
      handler: Namespace::Namespace.Function::FunctionHandler

  # Java Lambda
  MyJavaLambda:
    type: AWS_LAMBDA
    config:
      runtime: java
      projectPath: ../examples/my-java-lambda
      handler: com.example.MyHandler
      buildCommand: mvn package -q -DskipTests   # optional

  # Python Lambda
  MyPythonLambda:
    type: AWS_LAMBDA
    config:
      runtime: python
      functionPath: ../examples/my-python-lambda/handler.py
      handler: handler

resolvers:
  Query.getUser:
    datasource: UsersTable
    type: vtl
    requestTemplate: ../resolvers/vtl/getUser.request.vtl
    responseTemplate: ../resolvers/vtl/getUser.response.vtl

  Query.getProduct:
    datasource: MyJsLambda
    type: js
    code: ../resolvers/js/getProduct.js
```

### Environment Variables

- **Shared `env`** (top-level) — injected into every Lambda process
- **Per-Lambda `env`** (inside `config`) — overrides shared values for that Lambda
- Access via `process.env` (JS), `os.environ` (Python), `System.getenv()` (Java), `Environment.GetEnvironmentVariable()` (.NET)

### Lambda Selection

Choose which Lambdas to load at startup (skips build for unselected):

```bash
npm run start:select      # interactive picker
npm run debug:select      # interactive picker + debuggers
LAMBDAS=OrderProcessorLambda,PaymentServiceLambda npm start  # env var filter
```

## Debugging

```bash
npm run debug    # enables all debuggers
```

Then attach from Run & Debug:

| Config | Runtime | Port/Method |
|---|---|---|
| Attach JS Lambda | Node.js | auto-connect port 9229 |
| Attach .NET Lambda | .NET | pick process by name |
| Attach Java Lambda | Java | auto-connect port 5005 |
| Attach Python Lambda | Python | auto-connect port 5678 |

### JS Lambda
Set breakpoints directly in Lambda files — they work immediately.

### .NET Lambda
Breakpoints in `Function.cs` work after attaching. Process shows by `<AssemblyName>` from `.csproj`.

### Java Lambda
Breakpoints work after attaching. JVM debug on port 5005 (auto-incrementing for multiple Lambdas).

### Python Lambda
Requires `debugpy` in a venv:
```bash
cd examples/python-lambda
python3 -m venv .venv
.venv/bin/pip install debugpy
```
Breakpoints work after attaching via port 5678.

### JS Resolvers

Resolvers run in a sandboxed VM. Use `debugger;` statement:

```javascript
import { util } from '@aws-appsync/utils';

export function request(ctx) {
  debugger; // pauses when JS debugger is attached
  return { operation: 'getProduct', payload: { id: ctx.args.id } };
}
```

### VTL Resolvers

No breakpoint support. Use `$util.toJson($ctx.args)` to inspect values, or break in `src/resolvers/vtl-resolver.js`.

> AWS recommends migrating VTL to JS resolvers for better tooling.

## Resolver Syntax

The simulator supports both styles:

**AppSync native (deploy to AWS as-is):**
```javascript
import { util } from '@aws-appsync/utils';

export function request(ctx) {
  return { operation: 'GetItem', key: { id: util.dynamodb.toDynamoDB(ctx.args.id) } };
}

export function response(ctx) {
  return ctx.result;
}
```

**CommonJS (also works):**
```javascript
exports.request = function(ctx) { ... };
exports.response = function(ctx) { ... };
```

## DynamoDB

| Config | Behavior |
|---|---|
| `endpoint: http://localhost:8000` | DynamoDB Local, in-memory fallback if unreachable |
| No `endpoint` | Real AWS DynamoDB, uses standard credential chain |

```bash
# Optional — run DynamoDB Local
docker run -p 8000:8000 amazon/dynamodb-local
node scripts/setup-dynamodb.js
```

## Frontend E2E Testing

```bash
cd examples/frontend
npm install
npm run dev
```

Opens at `http://localhost:3000` with buttons for every API endpoint. Vite proxies `/graphql` to the simulator.

## Scripts

| Script | What |
|---|---|
| `npm start` | Start simulator |
| `npm run debug` | Start + all debuggers enabled |
| `npm run start:select` | Interactive Lambda picker |
| `npm run debug:select` | Picker + debuggers |
| `npm run dev` | Auto-restart on file changes |
| `npm run dev:debug` | Auto-restart + debuggers |

## Requirements

- Node.js 18+
- .NET SDK 8.0+ (for .NET Lambdas)
- Java 11+ and Maven (for Java Lambdas)
- Python 3.9+ (for Python Lambdas)
- `debugpy` pip package (for Python debugging)
