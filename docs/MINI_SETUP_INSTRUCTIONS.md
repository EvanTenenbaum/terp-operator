# Mini Claude Setup Instructions

## Quick Start

On **Mac mini**, execute the setup script:

```bash
# If you're on laptop, copy script to mini first:
scp docs/MINI_SETUP_SCRIPT.sh 100.71.65.30:~/mini-agentmemory-setup.sh

# Then SSH to mini and run it:
ssh 100.71.65.30
bash ~/mini-agentmemory-setup.sh
```

**Or** if on mini directly:

```bash
cd ~/work/terp-agro-operator-console  # or wherever this repo is
bash docs/MINI_SETUP_SCRIPT.sh
```

## What the Script Does

1. ✅ Installs agentmemory globally
2. ✅ Creates configuration file (`~/.agentmemory/.env`)
3. ✅ Sets up nightly replication from Hermes (2 AM cron job)
4. ✅ Tests initial replication
5. ✅ Configures MCP server to use Hermes primary
6. ✅ Creates fallback scripts

## After Setup

### Test Connection

Restart Claude Code on mini, then:

```
/memory_profile
/memory_smart_search "Hermes"
/memory_save "Mini backup server configured"
```

### Monitor Replication

```bash
# View last replication
tail ~/.agentmemory/replication.log

# List backups
ls -lh ~/.agentmemory/backup-*.json

# Test manual replication
~/.agentmemory/replicate-from-primary.sh
```

### Fallback to Local (If Primary Down)

```bash
# Switch to local backup server
~/.agentmemory/switch-to-backup.sh

# Restart Claude Code session
```

### Restore Primary (When Back Up)

```bash
# Switch back to primary
~/.agentmemory/switch-to-primary.sh

# Restart Claude Code session
```

## Configuration Details

**Primary Server**: http://100.116.15.113:3111 (Hermes on DO droplet)  
**Secret**: `7c6a8e61963dc3bcbeb39f502621e887a15782bdad2f04511a9f45cbf3fef800`  
**Replication**: Nightly at 2 AM via cron  
**Backup Location**: `~/.agentmemory/backup-YYYYMMDD.json`  
**Retention**: Last 7 days of backups

## Troubleshooting

### Can't reach primary

```bash
# Test connection
curl http://100.116.15.113:3111/agentmemory/health

# Check Tailscale
tailscale status | grep 100.116.15.113

# If down, switch to local backup
~/.agentmemory/switch-to-backup.sh
```

### Replication failing

```bash
# Check logs
tail ~/.agentmemory/replication.log

# Test manually with verbose output
bash -x ~/.agentmemory/replicate-from-primary.sh
```

### MCP tools not working

```bash
# Check MCP server status
claude mcp list

# Should show: agentmemory connected

# If not, restart Claude Code session
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  PRIMARY: Hermes (DO Droplet)                      │
│  - Always-on production server                      │
│  - All writes go here                              │
│  - 100.116.15.113:3111                             │
│                                                     │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ Tailscale network
                   │
        ┌──────────┴──────────┬─────────────────┐
        │                     │                 │
        ▼                     ▼                 ▼
   ┌─────────┐          ┌─────────┐      ┌─────────┐
   │ Laptop  │          │  Mini   │      │ Hermes  │
   │ Client  │          │ Backup  │      │ (local) │
   └─────────┘          └─────────┘      └─────────┘
   100.101.64.4         100.71.65.30     localhost
   
   - Reads/writes       - Reads/writes   - Reads/writes
     via Tailscale        via Tailscale    via localhost
   - Fallback to        - Nightly         - Direct access
     mini via SSH         replication      - PM2 managed
```

## Status

- ✅ Laptop: Connected to primary
- ⏳ Mini: Run setup script
- ✅ Hermes: Primary deployed

After mini setup, all three agents will share the same memory via the DO droplet primary server.
