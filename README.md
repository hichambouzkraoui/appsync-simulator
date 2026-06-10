# AppSync Local Simulator

A local AWS AppSync simulator that supports VTL and JavaScript resolvers with Lambda (JS and .NET) and DynamoDB datasources.

## Features

- **GraphQL endpoint** — Full GraphQL execution with query, mutation, and subscription support
- **VTL Resolvers** — Apache Velocity Template Language resolvers with AppSync context utilities
- **JavaScript Resolvers** — APPSYNC_JS runtime resolvers (request/response handlers)
- **Lambda Datasources** — Invoke JS Lambda functions directly, or .NET Lambda functions via process execution
- **DynamoDB Datasources** — Connect to local DynamoDB (e.g., DynamoDB Local or LocalStack)
- **Hot reload** — Watches config and resolver files for changes

## Project Structure

```
├── src/
│   ├── server.js              # Express server + GraphQL endpoint
│   ├── config-loader.js       # Loads appsync config (schema, resolvers, datasources)
│   ├── resolvers/
│   │   ├── vtl-resolver.js    # VTL template execution engine
│   │   └── js-resolver.js     # APPSYNC_JS runtime execution engine
│   ├── datasources/
│   │   ├── lambda-js.js       # JS Lambda function invoker
│   │   ├── lambda-dotnet.js   # .NET Lambda function invoker
│   │   ├── dynamodb.js        # DynamoDB datasource
│   │   └── none.js            # NONE datasource (pass-through)
│   └── utils/
│       ├── vtl-context.js     # AppSync VTL $context utilities
│       └── appsync-js-runtime.js  # AppSync JS runtime utilities
├── config/
│   ├── appsync.yaml           # Main AppSync configuration
│   └── schema.graphql         # GraphQL schema
├── resolvers/
│   ├── vtl/                   # VTL resolver templates
│   └── js/                    # JavaScript resolvers
├── examples/
│   ├── js-lambda/             # Example JS Lambda function
│   └── dotnet-lambda/         # Example .NET Lambda function
└── tests/
```

## Quick Start

```bash
# Install dependencies
npm install

# Start the simulator
npm start

# Or with hot-reload
npm run dev
```

The GraphQL endpoint will be available at `http://localhost:4000/graphql`.

## Configuration

Edit `config/appsync.yaml` to define your datasources and resolver mappings.

## DynamoDB Local

To use DynamoDB datasources, run DynamoDB Local:

```bash
docker run -p 8000:8000 amazon/dynamodb-local
```

## .NET Lambda Functions

To build and run .NET Lambda examples:

```bash
cd examples/dotnet-lambda
dotnet build
```

The simulator will invoke the .NET Lambda by running the compiled assembly.
