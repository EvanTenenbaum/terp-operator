# AgentMemory Security & Production Fixes

**Date**: 2026-05-16  
**Status**: Applied to deployment guide and scripts  
**Source**: Adversarial review findings (risk-verifier, general-purpose agents)

---

## Summary

After launching adversarial review agents to QA the agentmemory integration proposal, 14 critical risks and 5 architectural challenges were identified. Three blocking security and production issues were fixed in the deployment guide before mini setup:

| Issue | Risk | Fix Applied |
|-------|------|-------------|
| **Plaintext secrets on LAN** | Any device on network can sniff shared secret | Changed HOST to `127.0.0.1`, added SSH tunnel |
| **Concurrent write failures** | `SQLITE_BUSY` errors when both Claudes write | Enabled `SQLITE_WAL=true` |
| **Unbounded memory growth** | 730K observations in year 1, >5s search latency | Enabled `AGENTMEMORY_AUTO_COMPRESS=true` |

---

## What Changed

### 1. Mini Configuration (`~/.agentmemory/.env`)

**Before**:
```bash
HOST=0.0.0.0  # Listen on all interfaces
AGENTMEMORY_AUTO_COMPRESS=false
# No SQLite WAL
```

**After**:
```bash
HOST=127.0.0.1  # Localhost only
AGENTMEMORY_AUTO_COMPRESS=true  # Enable consolidation
SQLITE_WAL=true  # Enable Write-Ahead Logging
```

### 2. Laptop Connection Method

**Before**: Direct HTTP connection to mini's IP
```bash
AGENTMEMORY_URL=http://192.168.1.100:3111
```

**After**: SSH tunnel to localhost
```bash
# 1. Establish tunnel
ssh -fN -L 3111:localhost:3111 evans-mac-mini.local

# 2. Connect via tunnel
AGENTMEMORY_URL=http://localhost:3111
```

### 3. Connection Script

**Before**: `connect-to-mini.sh <mini-ip> <secret>`  
**After**: `connect-to-mini.sh <secret>` (SSH tunnel must exist first)

---

## Risk Analysis

### Risk 1: Plaintext Secrets on LAN (CRITICAL)

**Finding** (risk-verifier agent):
> "Mini .env has `HOST=0.0.0.0` + `AGENTMEMORY_SECRET` sent in HTTP header. Any device on the LAN can sniff the secret in ~1s with tcpdump."

**Impact**:
- Anyone on home network can read/write memories
- Malicious device could inject false observations
- Shared secret compromised permanently (must regenerate)

**Fix**:
- Mini binds to `127.0.0.1` only (no network exposure)
- Laptop connects via encrypted SSH tunnel
- Secret never transmitted over LAN
- Fallback: Use Tailscale if SSH not available

**Validation**:
```bash
# Before: exposed
curl http://<mini-ip>:3111/agentmemory/health  # works from any device

# After: localhost only
curl http://<mini-ip>:3111/agentmemory/health  # connection refused
ssh -L 3111:localhost:3111 mini curl http://localhost:3111/agentmemory/health  # works
```

---

### Risk 2: Concurrent Write Conflicts (HIGH)

**Finding** (risk-verifier agent):
> "SQLite in rollback-journal mode (default) + 2 Claude instances = `SQLITE_BUSY` errors. Mini Claude's tool-use observation + laptop Claude's search = lock contention."

**Impact**:
- Tool calls fail with "database is locked"
- Observations lost (writes silently fail)
- User experience: memory tools randomly error out

**Fix**:
- Enable SQLite WAL (Write-Ahead Logging) mode
- WAL allows concurrent readers + 1 writer
- Up to 1000x improvement in concurrent workloads

**Validation**:
```bash
# Verify WAL is enabled
sqlite3 ~/.agentmemory/data.db "PRAGMA journal_mode"
# Should return: wal
```

---

### Risk 3: Unbounded Memory Growth (MEDIUM)

**Finding** (risk-verifier agent):
> "2 Claude instances × 100 tool calls/day × 365 days = 730K observations. Without consolidation, search latency degrades to >5s after 6 months."

**Impact**:
- Memory usage grows to ~2GB in year 1
- Search becomes unusably slow (>5s per query)
- Context injection times out (>30s to retrieve memories)
- Database vacuum required (manual intervention)

**Fix**:
- Enable `AGENTMEMORY_AUTO_COMPRESS=true`
- Automatic consolidation: Working → Episodic → Semantic
- Target: 50K observations steady-state (90% reduction)
- Consolidation runs nightly (configurable)

**Validation**:
```bash
# Check observation count after 1 week
curl http://localhost:3111/agentmemory/stats | jq '.observations.count'
# Should be <5000, not >700
```

---

## Other Findings (Not Yet Fixed)

### 4. Network Partition Recovery

**Finding**: No offline queue or timeout handling. If SSH tunnel drops mid-request, Claude Code hangs for 120s.

**Recommended Fix** (future):
- Add `HTTP_TIMEOUT=5000` to .env
- Implement offline queue in MCP server
- Graceful degradation: continue without memory if server unavailable

### 5. Version Mismatch

**Finding**: Laptop and mini could install different `@agentmemory/agentmemory` versions via `npm install -g`, causing schema drift.

**Recommended Fix** (future):
- Pin exact version: `npm install -g @agentmemory/agentmemory@0.9.16`
- Add version check to connection script
- Reject connection if major version mismatch

### 6. No Monitoring

**Finding**: No health checks, no alerting, no quality metrics. Server could be down for days before noticed.

**Recommended Fix** (future):
- Add cron job to check health endpoint every 5 minutes
- Alert on consecutive failures (email or push notification)
- Track metrics: observations/day, search latency, consolidation rate

---

## Architectural Considerations (Long-term)

The general-purpose agent identified that using the same embedding model for both curated Claude Code memories and raw agentmemory observations will produce poor retrieval quality:

**Finding**:
> "Curated memories ('use TDD', 'Evan prefers X') need lexical search (exact match). Auto-captured observations ('ran git status') need semantic search (conceptual similarity). Indexing both with all-MiniLM-L6-v2 embeddings is a FUNDAMENTAL flaw."

**Recommended Architecture** (future):
- **Separate indices**: SQLite FTS5 for curated, embeddings for observations
- **Federated search**: Query both, merge with RRF (reciprocal rank fusion)
- **Weight curated higher**: `curated_weight=1.3`, `observed_weight=0.7`

This is a longer-term improvement and doesn't block deployment.

---

## Testing the Fixes

### Security Test

```bash
# On laptop (outside mini)
curl http://<mini-ip>:3111/agentmemory/health
# Expected: connection refused (not exposed to network)

# Via SSH tunnel
ssh -fN -L 3111:localhost:3111 <mini-host>
curl http://localhost:3111/agentmemory/health
# Expected: {"status":"healthy"}
```

### Concurrent Write Test

```bash
# On mini: Start continuous write loop
while true; do
  curl -X POST http://localhost:3111/agentmemory/remember \
    -H "Content-Type: application/json" \
    -d '{"content":"test","type":"fact"}' && echo " OK" || echo " FAIL"
  sleep 1
done

# On laptop (via tunnel): Start continuous search
while true; do
  curl http://localhost:3111/agentmemory/search?q=test && echo " OK" || echo " FAIL"
  sleep 1
done

# Expected: No SQLITE_BUSY errors, both loops succeed
```

### Auto-Compression Test

```bash
# Generate 1000 test observations
for i in {1..1000}; do
  curl -X POST http://localhost:3111/agentmemory/remember \
    -H "Content-Type: application/json" \
    -d "{\"content\":\"test observation $i\",\"type\":\"fact\"}"
done

# Trigger consolidation (normally runs nightly)
curl -X POST http://localhost:3111/agentmemory/consolidate

# Check observation count
curl http://localhost:3111/agentmemory/stats | jq '.observations.count'
# Expected: <200 (80% compressed)
```

---

## Deployment Status

- ✅ **Deployment guide updated**: Security fixes applied to all configuration examples
- ✅ **Connection script updated**: Now requires SSH tunnel, validates tunnel before connecting
- ✅ **Quickstart guide updated**: Documents secure deployment pattern
- ⏳ **Mini setup pending**: Awaiting manual execution on mini with secure configuration
- ⏳ **Laptop connection pending**: Awaiting mini IP and secret, will use SSH tunnel

---

## Next Steps

1. **Execute mini setup** with secure configuration (see `AGENTMEMORY_DEPLOYMENT_GUIDE.md`)
2. **Validate security**:
   - Verify mini is NOT reachable on network: `curl http://<mini-ip>:3111` should fail
   - Verify laptop CAN connect via tunnel: `curl http://localhost:3111/agentmemory/health` should succeed
3. **Test concurrent writes** with both Claude instances active
4. **Monitor observation count** after 1 week to verify auto-compression is working
5. **Consider future improvements**: offline queue, version pinning, monitoring

---

## References

- **Full deployment guide**: `docs/AGENTMEMORY_DEPLOYMENT_GUIDE.md`
- **Quickstart**: `docs/AGENTMEMORY_QUICKSTART.md`
- **Architecture**: `docs/AGENTMEMORY_ARCHITECTURE.md`
- **Risk analysis**: Summary conversation (2026-05-16)
- **Adversarial review agents**: risk-verifier, general-purpose
