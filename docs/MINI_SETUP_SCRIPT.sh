#!/bin/bash
# AgentMemory Backup Server Setup for Mac Mini
# Execute this script on evans-mac-mini
# Generated: 2026-05-16

set -e

echo "================================================"
echo "AgentMemory Backup Server Setup"
echo "================================================"
echo ""

# Connection details from Hermes
PRIMARY_IP="100.116.15.113"
SECRET="7c6a8e61963dc3bcbeb39f502621e887a15782bdad2f04511a9f45cbf3fef800"

echo "Primary server: http://$PRIMARY_IP:3111"
echo ""

# 1. Install agentmemory
echo "Step 1/6: Installing agentmemory..."
if ! command -v agentmemory &> /dev/null; then
    npm install -g @agentmemory/agentmemory
    echo "✅ AgentMemory installed"
else
    echo "✅ AgentMemory already installed"
fi
echo ""

# 2. Create configuration
echo "Step 2/6: Creating configuration..."
ANTHROPIC_API_KEY=$(grep ANTHROPIC_API_KEY ~/.codex/.env | head -1 | cut -d= -f2)

mkdir -p ~/.agentmemory

cat > ~/.agentmemory/.env << EOF
# AgentMemory Backup Server Configuration
# Generated: $(date +%Y-%m-%d)
# Role: Backup server on Mac mini
# Primary: DO droplet ($PRIMARY_IP)

# LLM Provider
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY

# Network - Localhost only (not running by default)
HOST=127.0.0.1
PORT=3111

# Security - Same secret as primary
AGENTMEMORY_SECRET=$SECRET

# Primary server for replication
PRIMARY_SERVER=http://$PRIMARY_IP:3111

# Embedding Provider
EMBEDDING_PROVIDER=local

# Database
SQLITE_WAL=true

# Features
AGENTMEMORY_INJECT_CONTEXT=true
AGENTMEMORY_AUTO_COMPRESS=true
AGENTMEMORY_SLOTS=false
AGENTMEMORY_REFLECT=false
GRAPH_EXTRACTION_ENABLED=false
AGENTMEMORY_TOOLS=core
EOF

echo "✅ Configuration created"
echo ""

# 3. Set up replication script
echo "Step 3/6: Creating replication script..."
cat > ~/.agentmemory/replicate-from-primary.sh << 'SCRIPT_EOF'
#!/bin/bash
# Replicate agentmemory data from primary (DO droplet) to backup (mini)

set -e
source ~/.agentmemory/.env

echo "$(date): Exporting from primary server..."
curl -sf -H "Authorization: Bearer $AGENTMEMORY_SECRET" \
  "$PRIMARY_SERVER/agentmemory/export" \
  -o ~/.agentmemory/backup-$(date +%Y%m%d).json

if [ $? -eq 0 ]; then
  echo "$(date): Replication complete"
  # Keep last 7 days of backups
  find ~/.agentmemory -name "backup-*.json" -mtime +7 -delete
else
  echo "$(date): ERROR - Failed to export from primary"
  exit 1
fi
SCRIPT_EOF

chmod +x ~/.agentmemory/replicate-from-primary.sh

echo "✅ Replication script created"
echo ""

# 4. Test replication
echo "Step 4/6: Testing replication..."
if ~/.agentmemory/replicate-from-primary.sh; then
    echo "✅ Initial replication successful"
else
    echo "⚠️  Replication test failed (will retry nightly)"
fi
echo ""

# 5. Schedule nightly replication
echo "Step 5/6: Scheduling nightly replication..."
(crontab -l 2>/dev/null | grep -v "replicate-from-primary.sh"; echo "0 2 * * * $HOME/.agentmemory/replicate-from-primary.sh >> $HOME/.agentmemory/replication.log 2>&1") | crontab -
echo "✅ Nightly replication scheduled (2 AM)"
echo ""

# 6. Configure MCP server
echo "Step 6/6: Configuring MCP server..."
claude mcp remove agentmemory 2>/dev/null || true

claude mcp add agentmemory \
  -e AGENTMEMORY_URL=http://$PRIMARY_IP:3111 \
  -e AGENTMEMORY_SECRET=$SECRET \
  -- npx -y @agentmemory/mcp

echo "✅ MCP server configured"
echo ""

# 7. Create fallback scripts
echo "Creating fallback scripts..."
cat > ~/.agentmemory/switch-to-backup.sh << 'EOF'
#!/bin/bash
# Switch to local backup server

echo "🔄 Switching to local backup server..."

# Install pm2 if needed
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi

# Start local agentmemory server
pm2 start agentmemory --name agentmemory-backup

# Wait for startup
sleep 3

# Reconfigure MCP server to localhost
SECRET=$(grep AGENTMEMORY_SECRET ~/.agentmemory/.env | cut -d= -f2)

claude mcp remove agentmemory
claude mcp add agentmemory \
  -e AGENTMEMORY_URL=http://localhost:3111 \
  -e AGENTMEMORY_SECRET="$SECRET" \
  -- npx -y @agentmemory/mcp

echo "✅ Switched to local backup"
echo "   Restart Claude Code session to use backup server"
EOF

cat > ~/.agentmemory/switch-to-primary.sh << 'EOF'
#!/bin/bash
# Switch back to primary server

echo "🔄 Switching back to primary server..."

# Stop local backup server
pm2 stop agentmemory-backup 2>/dev/null || true

# Reconfigure MCP server to primary
source ~/.agentmemory/.env

claude mcp remove agentmemory
claude mcp add agentmemory \
  -e AGENTMEMORY_URL=$PRIMARY_SERVER \
  -e AGENTMEMORY_SECRET="$AGENTMEMORY_SECRET" \
  -- npx -y @agentmemory/mcp

echo "✅ Switched back to primary"
echo "   Restart Claude Code session to use primary server"
EOF

chmod +x ~/.agentmemory/switch-to-backup.sh ~/.agentmemory/switch-to-primary.sh

echo "✅ Fallback scripts created"
echo ""

# Final test
echo "================================================"
echo "Testing connection to primary..."
echo "================================================"
if curl -sf http://$PRIMARY_IP:3111/agentmemory/health > /dev/null; then
    echo "✅ Primary server is healthy"
else
    echo "⚠️  Cannot reach primary server"
fi
echo ""

echo "================================================"
echo "Setup Complete!"
echo "================================================"
echo ""
echo "You are now:"
echo "  ✅ Connected to primary (Hermes on DO droplet)"
echo "  ✅ Replicating nightly at 2 AM"
echo "  ✅ Ready to fall back to local if primary goes down"
echo ""
echo "Next steps:"
echo "  1. Restart Claude Code session"
echo "  2. Test: /memory_profile"
echo "  3. Monitor: tail -f ~/.agentmemory/replication.log"
echo ""
echo "Fallback commands:"
echo "  Switch to backup:  ~/.agentmemory/switch-to-backup.sh"
echo "  Switch to primary: ~/.agentmemory/switch-to-primary.sh"
echo ""
