# AppSync Local Simulator

A local AWS AppSync simulator for debugging your backend. Supports VTL and JavaScript resolvers with Lambda (JS and .NET) and DynamoDB datasources.

## Features

- GraphQL endpoint with query, mutation, and introspection support
- VTL (Velocity Template Language) resolvers with AppSync `$util` helpers
- JavaScript resolvers (APPSYNC_JS runtime — `request()`/`response()` handlers)
- JS Lambda datasources — loaded in-process, hot-reloadable
- .NET Lambda datasources — persistent processes with shared in-memory state
- DynamoDB datasource with automatic in-memory fallback (no Docker required)
- NONE datasource for local/computed resolvers
- Cross-platform — works on macOS, Linux, and Windows

## Project Structure

```
├── src/
│   ├── server.js              # Express + GraphQL endpoint
│   ├── config-loader.js       # Loads appsync.yaml config
│   ├── resolver-executor.js   # Routes to VTL or JS resolver engine
│   ├── resolvers/
│   │   ├── vtl-resolver.js    # VTL template execution
│   │   └── js-resolver.js     # APPSYNC_JS runtime execution
│   ├── datasources/
│   │   ├── dynamodb.js        # DynamoDB (local or in-memory fallback)
│   │   ├── lambda-js.js       # JS Lambda (in-process via require)
│   │   ├── lambda-dotnet.js   # .NET Lambda (via generic host)
│   │   └── none.js            # Pass-through datasource
│   └── lambda-host/           # Generic .NET host (loads any Lambda DLL via reflection)
├── config/
│   ├── appsync.yaml           # Datasources + resolver mappings
│   └── schema.graphql         # GraphQL schema
├── resolvers/
│   ├── vtl/                   # VTL mapping templates
│   └── js/                    # APPSYNC_JS resolvers
├── examples/
│   ├── js-lambda/             # JS Lambda — order service
│   ├── product-catalog-lambda/# JS Lambda — product catalog
│   ├── dotnet-lambda/         # .NET Lambda — order processor
│   └── payment-lambda/        # .NET Lambda — payment service
├── api.http                   # HTTP file for testing all endpoints
└── scripts/
    ├── setup-dynamodb.js      # Create DynamoDB Local tables
    └── test-queries.sh        # curl-based test runner
```

## Quick Start

```bash
# Install dependencies
npm install

# Start the simulator
npm start
```

The GraphQL endpoint runs at `http://localhost:4000/graphql`.

All datasources work out of the box — DynamoDB falls back to in-memory, Lambda functions are built and launched automatically.

## Configuration

Edit `config/appsync.yaml` to define datasources and resolver mappings.

### Adding a JS Lambda

1. Create a folder in `examples/` with an `index.js` exporting a `handler` function
2. Add a datasource entry in `appsync.yaml`:
   ```yaml
   MyLambda:
     type: AWS_LAMBDA
     config:
       runtime: nodejs
       functionPath: ../examples/my-lambda/index.js
       handler: handler
   ```
3. Add resolver mappings pointing to your JS resolver files

### Adding a .NET Lambda

1. Create a .NET console project in `examples/`
2. Set `<AssemblyName>` in the `.csproj` to the name you want in the debugger process picker
3. Implement a static handler method (e.g., `Function.FunctionHandler(AppSyncEvent input)`)
4. Add a datasource entry in `appsync.yaml`:
   ```yaml
   MyDotnetLambda:
     type: AWS_LAMBDA
     config:
       runtime: dotnet
       projectPath: ../examples/my-dotnet-lambda
       assembly: MyDotnetLambda          # matches <AssemblyName> in .csproj
       handler: MyNamespace::MyNamespace.Function::FunctionHandler
   ```

The simulator handles everything else — it builds the project, loads the DLL via a generic host, and invokes your handler method via reflection. No boilerplate or protocol code needed in your Lambda.

## Debugging

### JS Lambda

```bash
npm run debug
```

Then in Run & Debug → **"Attach JS Lambda"**. Set breakpoints anywhere in your JS Lambda files.

### .NET Lambda

```bash
npm start
```

Then in Run & Debug → **"Attach .NET Lambda"** → pick the process by name (e.g., `OrderProcessorLambda`, `PaymentServiceLambda`).

Set breakpoints in `Function.cs` — they will hit on the next request.

Each .NET Lambda appears in the process picker by its `<AssemblyName>` from the `.csproj`.

### JS Resolvers

Resolvers run inside a sandboxed VM, so IDE breakpoints in resolver files won't bind directly. Three options:

**Option 1 — `debugger` statement (recommended):**

Add `debugger;` in your resolver. The Node.js inspector pauses there when attached:

```javascript
import { util } from '@aws-appsync/utils';

export function request(ctx) {
  debugger; // pauses here when debugger is attached
  return {
    operation: 'getProduct',
    payload: { id: ctx.args.id },
  };
}
```

Run `npm run debug`, attach via "Attach JS Lambda", then send a request — execution pauses at `debugger`.

**Option 2 — Console logging:**

Resolvers have `console.log` available. Output appears in the server terminal prefixed with `[Resolver]`:

```javascript
export function request(ctx) {
  console.log('args:', ctx.args);
  console.log('identity:', ctx.identity);
  return { ... };
}
```

**Option 3 — Break in the resolver engine:**

Set a breakpoint in `src/resolvers/js-resolver.js` on the `return handler(runtime.ctx)` line. You can inspect `runtime.ctx` (the full AppSync context) and step through the handler invocation.

## Resolver Types

### VTL Resolvers

Used for DynamoDB operations. Templates go in `resolvers/vtl/`:

```vtl
{
  "operation": "GetItem",
  "key": {
    "id": $util.dynamodb.toDynamoDBJson($ctx.args.id)
  }
}
```

### JavaScript Resolvers (APPSYNC_JS)

Export `request()` and `response()` functions:

```javascript
exports.request = function request(ctx) {
  return {
    operation: 'getProduct',
    payload: { id: ctx.args.id },
  };
};

exports.response = function response(ctx) {
  if (ctx.error) util.error(ctx.error.message, ctx.error.type);
  return ctx.result;
};
```

## DynamoDB

The simulator connects to DynamoDB Local (`http://localhost:8000`) if running, otherwise falls back to an in-memory store automatically.

To use DynamoDB Local:

```bash
docker run -p 8000:8000 amazon/dynamodb-local
node scripts/setup-dynamodb.js
```

## Testing

Use `api.http` with the REST Client extension to test all endpoints interactively, or run:

```bash
bash scripts/test-queries.sh
```

## Requirements

- Node.js 18+
- .NET SDK 8.0+ (for .NET Lambda datasources)
