#!/bin/bash
# Test the observability dashboard

echo "🚀 Starting server..."
npm run dev > /tmp/api-server.log 2>&1 &
SERVER_PID=$!

# Wait for server to start
sleep 5

echo ""
echo "📊 Testing metrics API..."
echo ""

# Check health
echo "Metrics system health:"
curl -s http://localhost:3000/api/metrics/health | jq
echo ""

# Generate some test traffic
echo "Generating test traffic..."
for i in {1..10}; do
  curl -s http://localhost:3000/health > /dev/null
  curl -s http://localhost:3000/api/v2/users > /dev/null
  curl -s -H "User-Agent: OpenAI-Agent" http://localhost:3000/api/agents/info > /dev/null
  curl -s -H "X-Agent-ID: test-agent-$i" http://localhost:3000/api/v2/users > /dev/null
done

sleep 2

echo ""
echo "✅ Metrics Summary:"
curl -s http://localhost:3000/api/metrics | jq '.data.summary'

echo ""
echo "🤖 By Agent Type:"
curl -s http://localhost:3000/api/metrics | jq '.data.byAgentType'

echo ""
echo "📋 Top Endpoints:"
curl -s http://localhost:3000/api/metrics | jq '.data.byEndpoint[0:3]'

echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "✨ Dashboard is running!"
echo ""
echo "   🌐 Open in browser: http://localhost:3000/dashboard.html"
echo ""
echo "   The dashboard will auto-refresh every 5 seconds"
echo "   showing real-time metrics for human vs. agent traffic."
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Wait for user to stop
wait $SERVER_PID
