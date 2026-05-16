# AgentMemory Deployment Guide - Cross-Machine Setup

**Date**: 2026-05-16  
**Status**: Ready for manual execution  
**Architecture**: Mini as server, Laptop as client

---

## Overview

This guide sets up shared persistent memory between laptop-claude and claude-mini using agentmemory. The mini will run the server (always-on, reliable), and laptop will connect as a client.

**Benefits**:
- 92% fewer tokens (automatic context vs. manual pasting)
- Shared memory between both Claudes
- Semantic search across all sessions
- Automatic observation capture

---

## Prerequisites

- [x] Laptop: agentmemory installed (`npm install -g @agentmemory/agentmemory`)
- [x] Laptop: Configuration created (`~/.agentmemory/.env`)
- [x] Laptop: MCP server added to Claude Code
- [ ] Mini: agentmemory installation (see below)
- [ ] Mini: Server configuration
- [ ] Mini: Server running
- [ ] Laptop: Reconfigured to connect to mini

---

## Part 1: Mini Setup (Mac Mini)

### 1.1 Install AgentMemory

```bash
npm install -g @agentmemory/agentmemory
```

### 1.2 Create Configuration

```bash
# Get API key from shared credentials
ANTHROPIC_API_KEY=$(grep ANTHROPIC_API_KEY ~/.codex/.env | head -1 | cut -d= -f2)

# Generate shared secret
SECRET=$(openssl rand -hex 32)

# Create config directory
mkdir -p ~/.agentmemory

# Create configuration file
cat > ~/.agentmemory/.env << EOF
# AgentMemory Server Configuration
# Generated: $(date +%Y-%m-%d)
# Role: Server (mini) - laptop connects as client

# LLM Provider
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY

# Network - Listen on all interfaces for laptop connection
HOST=0.0.0.0
PORT=3111

# Security - Share this secret with laptop
AGENTMEMORY_SECRET=$SECRET

# Embedding Provider (local = free, offline)
EMBEDDING_PROVIDER=local

# Search Tuning
BM25_WEIGHT=0.4
VECTOR_WEIGHT=0.6
TOKEN_BUDGET=2000

# Features
AGENTMEMORY_INJECT_CONTEXT=true
AGENTMEMORY_AUTO_COMPRESS=false
AGENTMEMORY_SLOTS=false
AGENTMEMORY_REFLECT=false
GRAPH_EXTRACTION_ENABLED=false
AGENTMEMORY_TOOLS=core
EOF

# Display the secret for laptop configuration
echo ""
echo "================================================"
echo "🔑 SAVE THIS SECRET FOR LAPTOP CONFIGURATION:"
echo "================================================"
grep AGENTMEMORY_SECRET ~/.agentmemory/.env
echo "================================================"
echo ""
```

### 1.3 Get Mini's IP Address

```bash
# Get local network IP
IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')
echo ""
echo "================================================"
echo "📍 MINI IP ADDRESS FOR LAPTOP:"
echo "================================================"
echo "IP: $IP"
echo "Laptop will connect to: http://$IP:3111"
echo "================================================"
echo ""
```

**Save both the SECRET and IP address** - you'll need them for laptop configuration.

### 1.4 Start AgentMemory Server

```bash
# Interactive start (recommended for first time)
agentmemory
```

**Interactive prompts**:
1. "Which agents will use agentmemory?" → Select **Claude Code** (space to toggle, enter to confirm)
2. Server will start and show: `✓ agentmemory REST server listening on 0.0.0.0:3111`

**To run as background service** (after testing):
```bash
# Install pm2 if needed
npm install -g pm2

# Start as service
pm2 start agentmemory --name agentmemory-server

# Set to start on boot
pm2 startup
pm2 save
```

### 1.5 Verify Server Running

```bash
# Check health
curl http://localhost:3111/agentmemory/health

# Expected output:
# {"status":"healthy"}

# View web UI (optional)
open http://localhost:3113
```

### 1.6 Add MCP Server to Mini's Claude Code

```bash
claude mcp add agentmemory -e AGENTMEMORY_URL=http://localhost:3111 -- npx -y @agentmemory/mcp
```

---

## Part 2: Laptop Configuration (MacBook Pro)

### 2.1 Update Laptop to Connect to Mini's Server

**Prerequisites**: You need from Part 1:
- Mini's IP address (e.g., `192.168.1.100`)
- Shared secret (64-character hex string from mini's .env)

**Option A: Automated Script** (recommended)

```bash
# Run the connection script
~/.agentmemory/connect-to-mini.sh <mini-ip> <secret>

# Example:
~/.agentmemory/connect-to-mini.sh 192.168.1.100 a1b2c3d4e5f6...
```

**Option B: Manual Steps**

```bash
# 1. Remove local MCP server
claude mcp remove agentmemory

# 2. Add remote MCP server
MINI_IP="192.168.1.100"  # Replace with actual mini IP
SECRET="a1b2c3d4e5f6..."  # Replace with actual secret

claude mcp add agentmemory \
  -e AGENTMEMORY_URL="http://${MINI_IP}:3111" \
  -e AGENTMEMORY_SECRET="$SECRET" \
  -- npx -y @agentmemory/mcp

# 3. Update laptop .env
cat > ~/.agentmemory/.env << EOF
# AgentMemory Client Configuration (Laptop)
# Generated: $(date +%Y-%m-%d)
# Role: Client - connects to mini's server

# Server Connection
AGENTMEMORY_URL=http://${MINI_IP}:3111
AGENTMEMORY_SECRET=$SECRET

# Features (client-side settings)
AGENTMEMORY_INJECT_CONTEXT=true
AGENTMEMORY_TOOLS=core
EOF
```

### 2.2 Test Connection from Laptop

```bash
# Test HTTP connection
curl -H "Authorization: Bearer <secret>" http://<mini-ip>:3111/agentmemory/health

# Expected output:
# {"status":"healthy"}
```

---

## Part 3: Verification & Testing

### 3.1 Test on Mini

**In Claude Code session on mini**:

```
/memory_profile
/memory_save "Test memory from mini Claude - 2026-05-16"
/memory_sessions
```

Expected: Should see memory tools working, profile created.

### 3.2 Test on Laptop

**In Claude Code session on laptop**:

```
/memory_profile
/memory_smart_search "test memory"
/memory_recall "mini Claude"
```

Expected:
- Should see the same profile as mini
- Should find the "Test memory from mini Claude" observation
- Both agents share the exact same memory store

### 3.3 Test Cross-Machine Memory Sharing

**On mini**:
```
/memory_save "Referee credit system completed 100% on 2026-05-16. All PO/Sale selectors working."
```

**On laptop** (in a new session):
```
/memory_smart_search "referee credit"
```

Expected: Should retrieve the memory saved on mini, proving cross-machine memory sharing works.

### 3.4 View Shared Memory Web UI

Open on either machine:
```
http://<mini-ip>:3113
```

You'll see:
- Live observation stream
- Session explorer
- Knowledge graph visualization  
- Consolidated memories from both laptop and mini

---

## Troubleshooting

### Server Won't Start on Mini

**Check logs**:
```bash
cat ~/.agentmemory/server.log
```

**Common issues**:
- Port 3111 already in use: `lsof -i :3111` and kill the process
- Missing API key: Check `~/.agentmemory/.env` has valid `ANTHROPIC_API_KEY`
- Permission issues: Ensure `~/.agentmemory` is writable

### Laptop Can't Connect

**Test network connectivity**:
```bash
ping <mini-ip>
telnet <mini-ip> 3111
```

**Check firewall**:
```bash
# On mini, allow port 3111 if needed
# System Preferences → Security & Privacy → Firewall → Firewall Options
```

**Verify secret matches**:
```bash
# On mini:
grep AGENTMEMORY_SECRET ~/.agentmemory/.env

# On laptop:
grep AGENTMEMORY_SECRET ~/.agentmemory/.env

# Should be identical
```

### MCP Tools Not Available

**Restart Claude Code**:
```bash
# Exit Claude Code session and start new one
# MCP servers load at session start
```

**Check MCP server status**:
```bash
claude mcp list
```

Expected output should show `agentmemory` with status `healthy`.

---

## Status Monitoring

### Check Server Health (Mini)

```bash
# Health endpoint
curl http://localhost:3111/agentmemory/health

# Stats endpoint
curl http://localhost:3111/agentmemory/stats

# View process
ps aux | grep agentmemory
```

### Check Memory Usage

**Via web UI**: http://<mini-ip>:3113  
**Via API**:
```bash
curl http://localhost:3111/agentmemory/profile
```

### Export Backup

```bash
curl http://localhost:3111/agentmemory/export > ~/agentmemory-backup-$(date +%Y%m%d).json
```

---

## Production Deployment Checklist

- [ ] Mini: agentmemory installed and configured
- [ ] Mini: Server running (`agentmemory` command executed)
- [ ] Mini: IP address documented
- [ ] Mini: Shared secret generated and saved
- [ ] Mini: MCP server added to Claude Code
- [ ] Laptop: Connected to mini's server (script executed)
- [ ] Laptop: Connection tested successfully
- [ ] Both: Memory tools working in Claude Code
- [ ] Cross-machine: Memory sharing verified
- [ ] Optional: pm2 service configured for auto-start
- [ ] Optional: Backup cron job configured

---

## Quick Reference

### Mini Commands

```bash
# Start server
agentmemory

# Start as background service
pm2 start agentmemory --name agentmemory-server

# Check status
curl http://localhost:3111/agentmemory/health

# View logs
tail -f ~/.agentmemory/server.log  # or pm2 logs agentmemory-server
```

### Laptop Commands

```bash
# Connect to mini
~/.agentmemory/connect-to-mini.sh <mini-ip> <secret>

# Test connection
curl -H "Authorization: Bearer <secret>" http://<mini-ip>:3111/agentmemory/health

# Use memory tools in Claude Code
/memory_profile
/memory_smart_search "query"
/memory_sessions
```

### Both Machines

```bash
# List MCP servers
claude mcp list

# Check agentmemory status
claude mcp get agentmemory
```

---

## Next Steps After Deployment

1. **Test Period (1-2 weeks)**:
   - Monitor token usage reduction
   - Verify memory recall quality
   - Check for any sync issues

2. **Enable Advanced Features** (optional):
   ```bash
   # On mini, in ~/.agentmemory/.env:
   AGENTMEMORY_AUTO_COMPRESS=true      # Auto-consolidation
   GRAPH_EXTRACTION_ENABLED=true        # Knowledge graph
   AGENTMEMORY_TOOLS=all               # All 51 tools
   ```

3. **Set Up Monitoring**:
   - Create bookmark for web UI
   - Set up backup cron job
   - Configure pm2 alerts (optional)

4. **Documentation**:
   - Update team docs if applicable
   - Note any project-specific patterns
   - Document useful memory queries

---

**Status**: Ready for deployment. Execute Part 1 on mini, then Part 2 on laptop.
