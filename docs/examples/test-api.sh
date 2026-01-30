#!/bin/bash
# Test script for the API platform
# Run the server with: npm run dev

BASE_URL="http://localhost:3000"

echo "================================"
echo "API Platform - Test Examples"
echo "================================"
echo ""

echo "1. Health Check"
echo "curl $BASE_URL/health"
curl -s $BASE_URL/health | jq .
echo ""
echo ""

echo "2. Valid Request (GET /api/users)"
echo "curl $BASE_URL/api/users?limit=20"
curl -s $BASE_URL/api/users?limit=20 | jq .
echo ""
echo ""

echo "3. Invalid Parameter (limit out of range)"
echo "curl $BASE_URL/api/users?limit=200"
curl -s $BASE_URL/api/users?limit=200 | jq .
echo ""
echo ""

echo "4. Agent Identification"
echo "curl -H 'X-Agent-ID: my-test-agent' -H 'User-Agent: OpenAI-GPT/4.0' $BASE_URL/api/agents/info"
curl -s -H 'X-Agent-ID: my-test-agent' -H 'User-Agent: OpenAI-GPT/4.0' $BASE_URL/api/agents/info | jq .
echo ""
echo ""

echo "5. Deprecated API Version"
echo "curl -H 'API-Version: 2024-12-01' $BASE_URL/health"
curl -s -H 'API-Version: 2024-12-01' -i $BASE_URL/health | grep -E "(API-Version|Deprecation|Sunset|Warning|HTTP)"
echo ""
echo ""

echo "6. POST with Dry-Run Mode"
echo "curl -X POST $BASE_URL/api/users?dry_run=true -H 'Content-Type: application/json' -d '{\"name\":\"Alice\",\"email\":\"alice@example.com\"}'"
curl -s -X POST "$BASE_URL/api/users?dry_run=true" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Alice","email":"alice@example.com"}' | jq .
echo ""
echo ""

echo "7. POST with Validation Error (missing name)"
echo "curl -X POST $BASE_URL/api/users -H 'Content-Type: application/json' -d '{\"email\":\"test@example.com\"}'"
curl -s -X POST "$BASE_URL/api/users" \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com"}' | jq .
echo ""
echo ""

echo "8. POST with Invalid Email"
echo "curl -X POST $BASE_URL/api/users -H 'Content-Type: application/json' -d '{\"name\":\"Bob\",\"email\":\"invalid\"}'"
curl -s -X POST "$BASE_URL/api/users" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Bob","email":"invalid"}' | jq .
echo ""
echo ""

echo "9. Successful POST"
echo "curl -X POST $BASE_URL/api/users -H 'Content-Type: application/json' -d '{\"name\":\"Charlie\",\"email\":\"charlie@example.com\"}'"
curl -s -X POST "$BASE_URL/api/users" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Charlie","email":"charlie@example.com"}' | jq .
echo ""
