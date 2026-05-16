# AgentMemory Quick Start - TL;DR

**Goal**: Shared persistent memory between laptop and mini Claude  
**Architecture**: Mini runs server, laptop connects as client  
**Status**: Laptop configured, mini setup pending manual execution

---

## What's Done (Laptop)

✅ agentmemory installed globally  
✅ Configuration created (`~/.agentmemory/.env`)  
✅ MCP server added to Claude Code  
✅ Connection script ready (`~/.agentmemory/connect-to-mini.sh`)

---

## What's Needed (Mini)

Execute on Mac mini:

```bash
# 1. Install
npm install -g @agentmemory/agentmemory

# 2. Configure (get secret + IP)
# See AGENTMEMORY_DEPLOYMENT_GUIDE.md Part 1.2-1.3

# 3. Start server
agentmemory
# → Select "Claude Code" when prompted
# → Save the SECRET and IP address shown

# 4. Add MCP server
claude mcp add agentmemory -e AGENTMEMORY_URL=http://localhost:3111 -- npx -y @agentmemory/mcp
```

---

## What's Needed (Laptop)

After mini is running:

```bash
# Connect to mini's server
~/.agentmemory/connect-to-mini.sh <mini-ip> <secret>

# Test in Claude Code
/memory_profile
/memory_smart_search "test"
```

---

## Benefits Once Deployed

- 📉 **92% fewer tokens** - no more re-explaining context
- 🔍 **Semantic search** - find anything across all sessions
- 🤝 **Shared memory** - both Claudes see the same context
- 📊 **Auto-capture** - observations saved automatically
- 🌐 **Web UI** - http://<mini-ip>:3113

---

## Full Documentation

- **Architecture**: `docs/AGENTMEMORY_ARCHITECTURE.md`
- **Deployment Guide**: `docs/AGENTMEMORY_DEPLOYMENT_GUIDE.md`

---

**Next**: Execute mini setup (15 min), then connect laptop (2 min)
