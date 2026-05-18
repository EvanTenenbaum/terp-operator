#!/bin/bash
# Automatic adversarial QA trigger
# Called by hooks to determine if cross-model review needed

set -e

CURRENT_MODEL="${CLAUDE_MODEL:-claude}"  # claude or codex
QA_LEVEL="${QA_LEVEL:-Normal}"

# Only trigger at Checkpoint or FullGate
if [[ "$QA_LEVEL" != "Checkpoint" && "$QA_LEVEL" != "FullGate" ]]; then
    echo "QA level $QA_LEVEL - no cross-model review needed"
    exit 0
fi

# Determine review model (opposite of implementation model)
if [[ "$CURRENT_MODEL" == "claude" ]]; then
    REVIEW_MODEL="codex"
else
    REVIEW_MODEL="claude"
fi

echo "🔄 Triggering adversarial review: $REVIEW_MODEL reviews $CURRENT_MODEL work"

# Export for Claude to pick up
export AQA_REVIEW_MODEL="$REVIEW_MODEL"
export AQA_TRIGGERED="true"
