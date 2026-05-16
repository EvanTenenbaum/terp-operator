# AgentMemory Architecture & Cross-Machine Coordination

**Date**: 2026-05-16  
**Status**: Implemented on laptop-claude  
**Decision Needed**: Cross-machine memory sharing strategy

---

## What is AgentMemory?

AgentMemory provides persistent, searchable memory for AI coding agents across sessions using a 4-tier consolidation system:

1. **Working**: Raw observations from tool use
2. **Episodic**: Compressed session summaries  
3. **Semantic**: Extracted facts and patterns
4. **Procedural**: Workflows and decision patterns

**Key Benefits**:
- 92% fewer tokens vs. pasting full context
- Hybrid search (vector embeddings + BM25 + knowledge graph)
- Cross-agent memory sharing (one server, multiple agents)
- 95.2% retrieval accuracy (LongMemEval-S benchmark)

---

## Current Claude Code Memory System

Laptop and mini Claude already have built-in memory at:
- `~/.claude/projects/-Users-evan/memory/`
- Stores user, feedback, project, and reference memories
- File-based with frontmatter metadata
- Manual capture via `/remember` command

**Limitations**:
- No automatic capture from tool use
- No semantic search (manual file reads)
- No cross-session consolidation
- Each Claude instance has separate memory stores

---

## AgentMemory Installation (Laptop)

**Status**: ✅ COMPLETE on laptop-claude

### What Was Installed

1. **Global Package**:
   ```bash
   npm install -g @agentmemory/agentmemory
   ```

2. **Configuration** (`~/.agentmemory/.env`):
   - `ANTHROPIC_API_KEY`: Sourced from `~/.codex/.env`
   - `EMBEDDING_PROVIDER=local`: Free, offline embeddings
   - `AGENTMEMORY_INJECT_CONTEXT=true`: Session-start context injection
   - `AGENTMEMORY_TOOLS=core`: 8 core MCP tools

3. **MCP Server** (via `claude mcp add`):
   - Server: `npx -y @agentmemory/mcp`
   - Environment: `AGENTMEMORY_URL=http://localhost:3111`
   - Config: `/Users/evan/.claude.json`

### Available MCP Tools

- `memory_smart_search`: Hybrid semantic + keyword search
- `memory_recall`: Context retrieval
- `memory_save`: Capture insights
- `memory_sessions`: View session history
- `memory_profile`: Project profile
- `memory_timeline`: Memory timeline
- `memory_relations`: Knowledge graph relations
- `memory_export`: Export all data

---

## Cross-Machine Architecture Options

### Option A: Laptop Server + Mini Client (RECOMMENDED)

**Setup**:
- Laptop runs agentmemory server on `http://0.0.0.0:3111`
- Mini connects via `http://<laptop-ip>:3111`
- Both agents share the same memory store

**Pros**:
- ✅ Single source of truth for all memories
- ✅ Laptop and mini see the same context
- ✅ No memory sync conflicts
- ✅ Simpler maintenance (one server)

**Cons**:
- ❌ Requires laptop to be running
- ❌ Network dependency
- ❌ Potential latency on mini

**Implementation**:
```bash
# On laptop: Update ~/.agentmemory/.env
HOST=0.0.0.0
PORT=3111
AGENTMEMORY_SECRET=<shared-secret>

# On mini: Add MCP server
claude mcp add agentmemory -e AGENTMEMORY_URL=http://<laptop-ip>:3111 -e AGENTMEMORY_SECRET=<shared-secret> -- npx -y @agentmemory/mcp
```

### Option B: Mini Server + Laptop Client

**Setup**:
- Mini runs agentmemory server  
- Laptop connects remotely

**Pros**:
- ✅ Mini is always-on (more reliable)
- ✅ Single memory store

**Cons**:
- ❌ Same network dependencies as Option A

**Implementation**: Same as Option A, reversed

### Option C: Separate Instances

**Setup**:
- Laptop has its own agentmemory server
- Mini has its own agentmemory server
- No memory sharing

**Pros**:
- ✅ No network dependency
- ✅ Each agent fully autonomous
- ✅ No single point of failure

**Cons**:
- ❌ Memory fragmentation
- ❌ Context loss when switching machines
- ❌ Duplicate observations

### Option D: Hybrid with Manual Sync

**Setup**:
- Both run separate servers
- Periodic export/import via `/agentmemory/export`

**Pros**:
- ✅ Autonomous operation
- ✅ Eventually consistent

**Cons**:
- ❌ Complex sync logic
- ❌ Conflict resolution needed
- ❌ Not real-time

---

## Relationship to Existing Memory

### Claude Code Built-in Memory (`~/.claude/projects/-Users-evan/memory/`)

**Purpose**: User-curated, high-signal memories
- User preferences and role
- Explicit feedback and corrections
- Project context and goals
- Reference pointers

**Keeps**: Manual, intentional memory capture

### AgentMemory

**Purpose**: Automatic, comprehensive session memory
- Tool use observations
- Code patterns discovered
- Decision trails
- Workflow patterns

**Adds**: Automatic capture, semantic search, consolidation

### Integration Strategy

**Use both systems in parallel**:
1. **AgentMemory**: Auto-capture everything, search-driven recall
2. **Claude Memory**: Curated high-signal facts, loaded every session
3. **Synergy**: AgentMemory reduces need for manual `/remember`, but Claude memory remains authoritative for user preferences

---

## Recommended Deployment

### Phase 1: Laptop-Only (Current)
- ✅ AgentMemory running on laptop
- ⏳ Mini continues with built-in memory only
- **Test Period**: 1-2 weeks
- **Evaluate**: Token savings, recall quality, session performance

### Phase 2: Cross-Machine (If Successful)
- Choose Option A (laptop server) or Option B (mini server)
- Configure network access and authentication
- Test memory sharing between agents
- Monitor for sync issues

### Phase 3: Production (If Validated)
- Set up monitoring (health endpoint)
- Configure backups (`/agentmemory/export`)
- Document troubleshooting procedures
- Consider iii-engine workers for scaling

---

## Starting AgentMemory

### Manual Start

```bash
# On laptop
agentmemory

# Check health
curl http://localhost:3111/agentmemory/health

# View web UI
open http://localhost:3113
```

### Auto-Start (via MCP)

AgentMemory MCP server will auto-spawn the main server on first tool use. No manual start needed for Claude Code integration.

### Background Service (Optional)

```bash
# Using pm2
pm2 start agentmemory --name agentmemory

# Or launchd plist (Mac)
# Create ~/Library/LaunchAgents/com.agentmemory.plist
```

---

## Testing AgentMemory

### Quick Test

```bash
# Start server
agentmemory

# In Claude Code session:
# 1. Run some commands (git, file reads, etc.)
# 2. AgentMemory captures observations automatically
# 3. Check web UI at http://localhost:3113
# 4. Start new session, verify context injection
```

### MCP Tools Test

Within Claude Code, try:
```
/memory_smart_search "referee credit system"
/memory_profile
/memory_sessions
```

---

## Next Steps

### Immediate (Laptop)
1. ✅ Installation complete
2. ⏳ Start agentmemory server: `agentmemory`
3. ⏳ Complete interactive setup (select Claude Code)
4. ⏳ Test MCP tools in Claude Code session
5. ⏳ Monitor token usage and recall quality

### Cross-Machine (Pending Decision)
1. ❓ Choose deployment architecture (A/B/C/D)
2. ❓ Configure network access if needed
3. ❓ Install on mini if using shared server
4. ❓ Test cross-machine memory sharing

### Production (Future)
1. Set up monitoring and backups
2. Configure auto-consolidation (`AGENTMEMORY_AUTO_COMPRESS=true`)
3. Enable advanced features (knowledge graph, reflection)
4. Expand tool set (`AGENTMEMORY_TOOLS=all` for 51 tools)

---

## Files Modified

- `/Users/evan/.agentmemory/.env`: AgentMemory configuration
- `/Users/evan/.claude.json`: MCP server registration
- `~/.agentmemory/server.log`: Server logs (when running)

---

## Questions for Evan

1. **Cross-machine**: Should laptop and mini share memories? (Recommendation: Yes, via Option A)
2. **Server location**: Which machine should run the agentmemory server? (Recommendation: Laptop for now, mini for production)
3. **Test period**: How long to evaluate before cross-machine deployment? (Recommendation: 1-2 weeks)
4. **Auto-start**: Should agentmemory run as a background service? (Recommendation: Not yet, manual start for testing)

---

**Status**: AgentMemory ready to use on laptop-claude. Cross-machine coordination pending architecture decision.
