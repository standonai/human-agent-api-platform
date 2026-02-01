#!/bin/bash

# OWASP API1 & API3 Compliance Test
# Tests object-level and field-level authorization

set -e

BASE_URL="http://localhost:3000"

echo "🔐 OWASP API1 & API3 Authorization Tests"
echo "========================================"
echo ""

# Test counters
PASS=0
FAIL=0

pass() { echo "✅ PASS: $1"; ((PASS++)); }
fail() { echo "❌ FAIL: $1"; ((FAIL++)); }
info() { echo "ℹ️  INFO: $1"; }

# Get admin token
echo "Step 1: Authenticate as admin"
ADMIN_LOGIN=$(curl -s -X POST "${BASE_URL}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"admin123"}')
ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['accessToken'])")
info "Admin authenticated"
echo ""

# Create User 1
echo "Step 2: Create test users"
USER1=$(curl -s -X POST "${BASE_URL}/api/v2/users" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -d '{"email":"testuser1@test.com","password":"test123","name":"User One","role":"developer"}')
USER1_ID=$(echo "$USER1" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['id'])")

# Create User 2
USER2=$(curl -s -X POST "${BASE_URL}/api/v2/users" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -d '{"email":"testuser2@test.com","password":"test123","name":"User Two","role":"developer"}')
USER2_ID=$(echo "$USER2" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['id'])")

info "User 1 ID: ${USER1_ID}, User 2 ID: ${USER2_ID}"
echo ""

# Login as users
echo "Step 3: Authenticate users"
U1_LOGIN=$(curl -s -X POST "${BASE_URL}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"testuser1@test.com","password":"test123"}')
U1_TOKEN=$(echo "$U1_LOGIN" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['accessToken'])")

U2_LOGIN=$(curl -s -X POST "${BASE_URL}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"testuser2@test.com","password":"test123"}')
U2_TOKEN=$(echo "$U2_LOGIN" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['accessToken'])")

info "Users authenticated"
echo ""

echo "=========================================="
echo "🧪 OWASP API1: Object-Level Authorization"
echo "=========================================="
echo ""

# Test 1.1: User 1 creates a task
echo "Test 1.1: User 1 creates a task"
TASK=$(curl -s -X POST "${BASE_URL}/api/v2/tasks" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${U1_TOKEN}" \
  -d '{"title":"User 1 Private Task","status":"todo"}')
TASK_ID=$(echo "$TASK" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null || echo "")

if [ -n "$TASK_ID" ]; then
  pass "User 1 created task: $TASK_ID"
else
  fail "User 1 failed to create task"
fi
echo ""

# Test 1.2: User 1 can read their own task
echo "Test 1.2: User 1 reads their own task"
READ=$(curl -s -w "\n%{http_code}" -X GET "${BASE_URL}/api/v2/tasks/${TASK_ID}" \
  -H "Authorization: Bearer ${U1_TOKEN}")
CODE=$(echo "$READ" | tail -n1)

if [ "$CODE" = "200" ]; then
  pass "User 1 can read their own task (HTTP 200)"
else
  fail "User 1 cannot read their own task (HTTP $CODE)"
fi
echo ""

# Test 1.3: User 2 CANNOT read User 1's task (OWASP API1)
echo "Test 1.3: User 2 attempts to read User 1's task (should fail)"
READ=$(curl -s -w "\n%{http_code}" -X GET "${BASE_URL}/api/v2/tasks/${TASK_ID}" \
  -H "Authorization: Bearer ${U2_TOKEN}")
CODE=$(echo "$READ" | tail -n1)

if [ "$CODE" = "403" ]; then
  pass "✅ OWASP API1 PROTECTED: User 2 blocked (HTTP 403)"
else
  fail "❌ OWASP API1 VULN: User 2 accessed task (HTTP $CODE)"
fi
echo ""

# Test 1.4: User 2 CANNOT update User 1's task
echo "Test 1.4: User 2 attempts to update User 1's task (should fail)"
UPDATE=$(curl -s -w "\n%{http_code}" -X PUT "${BASE_URL}/api/v2/tasks/${TASK_ID}" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${U2_TOKEN}" \
  -d '{"status":"done"}')
CODE=$(echo "$UPDATE" | tail -n1)

if [ "$CODE" = "403" ]; then
  pass "✅ OWASP API1 PROTECTED: User 2 blocked from update (HTTP 403)"
else
  fail "❌ OWASP API1 VULN: User 2 updated task (HTTP $CODE)"
fi
echo ""

# Test 1.5: User 2 CANNOT delete User 1's task
echo "Test 1.5: User 2 attempts to delete User 1's task (should fail)"
DELETE=$(curl -s -w "\n%{http_code}" -X DELETE "${BASE_URL}/api/v2/tasks/${TASK_ID}" \
  -H "Authorization: Bearer ${U2_TOKEN}")
CODE=$(echo "$DELETE" | tail -n1)

if [ "$CODE" = "403" ]; then
  pass "✅ OWASP API1 PROTECTED: User 2 blocked from delete (HTTP 403)"
else
  fail "❌ OWASP API1 VULN: User 2 deleted task (HTTP $CODE)"
fi
echo ""

# Test 1.6: Admin CAN access any task
echo "Test 1.6: Admin reads any task"
READ=$(curl -s -w "\n%{http_code}" -X GET "${BASE_URL}/api/v2/tasks/${TASK_ID}" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}")
CODE=$(echo "$READ" | tail -n1)

if [ "$CODE" = "200" ]; then
  pass "Admin can read any task (HTTP 200)"
else
  fail "Admin cannot read task (HTTP $CODE)"
fi
echo ""

echo "=========================================="
echo "🧪 OWASP API3: Field-Level Authorization"
echo "=========================================="
echo ""

# Test 3.1: User 1 can update allowed fields
echo "Test 3.1: User 1 updates allowed fields (title, status)"
UPDATE=$(curl -s -w "\n%{http_code}" -X PUT "${BASE_URL}/api/v2/tasks/${TASK_ID}" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${U1_TOKEN}" \
  -d '{"title":"Updated Title","status":"in_progress"}')
CODE=$(echo "$UPDATE" | tail -n1)

if [ "$CODE" = "200" ]; then
  pass "User 1 can update allowed fields (HTTP 200)"
else
  fail "User 1 cannot update allowed fields (HTTP $CODE)"
fi
echo ""

# Test 3.2: User CANNOT change ownerId (OWASP API3)
echo "Test 3.2: User 1 attempts to change ownerId (should fail)"
UPDATE=$(curl -s -w "\n%{http_code}" -X PUT "${BASE_URL}/api/v2/tasks/${TASK_ID}" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${U1_TOKEN}" \
  -d "{\"ownerId\":\"${USER2_ID}\"}")
CODE=$(echo "$UPDATE" | tail -n1)

if [ "$CODE" = "403" ]; then
  pass "✅ OWASP API3 PROTECTED: ownerId change blocked (HTTP 403)"
else
  fail "❌ OWASP API3 VULN: ownerId changed (HTTP $CODE)"
fi
echo ""

# Test 3.3: User CANNOT change createdBy
echo "Test 3.3: User 1 attempts to change createdBy (should fail)"
UPDATE=$(curl -s -w "\n%{http_code}" -X PUT "${BASE_URL}/api/v2/tasks/${TASK_ID}" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${U1_TOKEN}" \
  -d "{\"createdBy\":\"${USER2_ID}\"}")
CODE=$(echo "$UPDATE" | tail -n1)

if [ "$CODE" = "403" ]; then
  pass "✅ OWASP API3 PROTECTED: createdBy change blocked (HTTP 403)"
else
  fail "❌ OWASP API3 VULN: createdBy changed (HTTP $CODE)"
fi
echo ""

# Test 3.4: Admin CAN modify any field
echo "Test 3.4: Admin modifies fields"
UPDATE=$(curl -s -w "\n%{http_code}" -X PUT "${BASE_URL}/api/v2/tasks/${TASK_ID}" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -d '{"title":"Admin Updated","status":"done"}')
CODE=$(echo "$UPDATE" | tail -n1)

if [ "$CODE" = "200" ]; then
  pass "Admin can modify any field (HTTP 200)"
else
  fail "Admin cannot modify fields (HTTP $CODE)"
fi
echo ""

echo "=========================================="
echo "📊 Test Summary"
echo "=========================================="
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo ""

if [ $FAIL -eq 0 ]; then
  echo "✅ ALL TESTS PASSED!"
  echo "✅ OWASP API1 (Broken Object Level Authorization) - PROTECTED"
  echo "✅ OWASP API3 (Broken Property Level Authorization) - PROTECTED"
  exit 0
else
  echo "❌ SOME TESTS FAILED"
  exit 1
fi
