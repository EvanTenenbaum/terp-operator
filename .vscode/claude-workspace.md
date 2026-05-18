# Active Project: Terp Operator

You are working in the **Terp Operator** repository (terp-agro-operator-console).

**STOP CONDITIONS:**
- If git remote does NOT mention `terp-agro-operator-console`, ASK before proceeding
- If you see paths like `terp-legacy`, `old-terp`, or other terp projects, CONFIRM workspace

**Every session:**
1. Verify correct repo via git remote
2. Check PM bundle freshness (if docs/agent-context exists)

## Adversarial QA (AQA) Protocol

**Cross-model review is AUTOMATIC at gates:**

### When YOU (Claude) implement:
- At Checkpoint/Full Gate: automatically invoke `codex-review-broker` for adversarial Codex review
- Before closeout claims: invoke `evidence-auditor` for skeptical artifact review
- Before "done" claims: invoke `closure-auditor` to challenge completion claims

### When Codex implements:
- At Checkpoint/Full Gate: YOU provide adversarial review as Claude
- Challenge assumptions, verify evidence, confirm no regressions

### Decision Flow:
1. **Before any gate**: invoke `cross-qa-decider` to determine if background cross-QA required
2. If cross-QA needed: invoke `codex-review-broker` with evidence packet
3. **Never skip adversarial review** at Checkpoint or Full Gate
4. **Model rotation is mandatory**: Claude reviews Codex, Codex reviews Claude

### QA Escalation Triggers:
- **→ Checkpoint**: 3+ files, auth/data flow, deprecated proximity, operator workflow
- **→ Full Gate**: security paths, billing, operator-critical, migrations

### Evidence Requirements:
- Proof commands must be run, not assumed
- Actual output required before any success claim
- Screenshots for UI changes at Checkpoint+
- Test output for logic changes at Full Gate
- "It should work" is NEVER acceptable at any gate

## Best Practices Auto-Loaded

### 1. Verification Before Completion
**Never claim done without evidence:**
- Run verification commands
- Capture actual output
- Show passing tests
- Provide artifacts (screenshots, logs, diffs)

### 2. Skeptical Review Default
**At any gate, be adversarial:**
- Challenge implementation choices
- Look for edge cases missed
- Verify regressions haven't been introduced
- Confirm tests actually test the fix

### 3. Cross-Model Diversity
**Different models see different issues:**
- Syntax vs logic
- Performance vs correctness
- Security vs usability
- Use this diversity intentionally

### 4. No Performative Agreement
**When receiving review feedback:**
- Verify technically before accepting
- Push back on incorrect feedback
- Require evidence for claims
- Use `/receiving-code-review` skill

### 5. Gate Discipline
**Gates are non-negotiable:**
- Cannot be skipped
- Cannot be weakened
- Cannot be "assumed passing"
- Must show evidence
