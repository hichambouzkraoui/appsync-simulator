#!/bin/bash
# Test script for the AppSync Local Simulator
# Run this after starting the simulator with `npm start`

BASE_URL="http://localhost:4000/graphql"

echo "=== AppSync Local Simulator - Test Queries ==="
echo ""

# Health check
echo "1. Health check:"
curl -s http://localhost:4000/health | jq .
echo ""

# Create a user (VTL resolver → DynamoDB)
echo "2. Create User (VTL + DynamoDB):"
curl -s -X POST $BASE_URL \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { createUser(input: { name: \"John Doe\", email: \"john@example.com\" }) { id name email createdAt } }"
  }' | jq .
echo ""

# List users (VTL resolver → DynamoDB)
echo "3. List Users (VTL + DynamoDB):"
curl -s -X POST $BASE_URL \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ listUsers { id name email createdAt } }"
  }' | jq .
echo ""

# Create order (JS resolver → JS Lambda)
echo "4. Create Order (JS resolver + JS Lambda):"
curl -s -X POST $BASE_URL \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { createOrder(input: { userId: \"user-1\", items: [{ productId: \"prod-1\", quantity: 2, price: 29.99 }] }) { id userId items { productId quantity price } total status createdAt } }"
  }' | jq .
echo ""

# Process order (JS resolver → .NET Lambda)
echo "5. Process Order (JS resolver + .NET Lambda):"
curl -s -X POST $BASE_URL \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { processOrder(id: \"order-123\") { id status createdAt } }"
  }' | jq .
echo ""

# Update user (JS resolver → NONE datasource)
echo "6. Update User (JS resolver + NONE datasource):"
curl -s -X POST $BASE_URL \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { updateUser(id: \"user-1\", input: { name: \"Jane Doe\", email: \"jane@example.com\" }) { id name email updatedAt } }"
  }' | jq .
echo ""

echo "=== Done ==="
