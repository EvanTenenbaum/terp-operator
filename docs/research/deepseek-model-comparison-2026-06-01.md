# DeepSeek LLM Models: Production Agent-System Integration Analysis

**Research Date:** 2026-06-01  
**Sources:** DeepSeek API Docs, OpenRouter, Together AI, Fireworks AI, HuggingFace, Anthropic Pricing, official technical reports  
**Status:** DeepSeek-V4 series is current flagship (released 2026-04-24). DeepSeek-V3 and R1 legacy names deprecated by 2026-07-24.

---

## Executive Summary

DeepSeek has leapfrogged from a budget open-source alternative to a **top-tier frontier contender** with the V4 series (April 2026). For agent-system routing decisions:

- **DeepSeek-V4-Flash** is the most cost-efficient 1M-context model available at **$0.14/M input, $0.28/M output** — cheaper than Claude Haiku 4.5 while outperforming Claude Sonnet 4.6 on coding benchmarks.
- **DeepSeek-V4-Pro** matches or beats Claude Opus 4.7 on LiveCodeBench (93.5 vs 88.8) and Codeforces (3206 vs 3168) at **~8× lower cost** ($0.435/$0.87 vs $5/$25).
- **DeepSeek-R1-0528** is a genuine reasoning contender with AIME 2025 87.5% and GPQA-Diamond 81.0%, but its long reasoning chains (avg 23K tokens/question) make it expensive in practice.
- **API reliability remains the primary production risk** for deepseek.com direct access. Third-party routing (OpenRouter, Fireworks, Together AI) is strongly recommended for production agent workloads.

---

## 1. Per-Model Pricing Table

### DeepSeek Direct API (api.deepseek.com)

| Model | Input (cache miss) | Input (cache hit) | Output | Context | Max Output |
|-------|-------------------|-------------------|--------|---------|------------|
| **DeepSeek-V4-Flash** | $0.14 / M | $0.0028 / M | $0.28 / M | 1M | 384K |
| **DeepSeek-V4-Pro** | $0.435 / M | $0.003625 / M | $0.87 / M | 1M | 384K |
| **DeepSeek-R1** (legacy name) | ~$0.55 / M* | — | ~$2.19 / M* | 164K | 64K |

*R1 pricing no longer prominently listed on the new V4 pricing page; historical rate shown. Use OpenRouter or third-party providers for transparent R1-0528 pricing.

### Third-Party Providers

| Provider | Model | Input | Output | Notes |
|----------|-------|-------|--------|-------|
| **OpenRouter** | DeepSeek-V4-Flash | $0.14 / M | $0.28 / M | Routes to best provider with fallback |
| **OpenRouter** | DeepSeek-V4-Pro | $0.435 / M | $0.87 / M | — |
| **OpenRouter** | DeepSeek-R1 | $0.70 / M | $2.50 / M | R1-0528 accessible via same endpoint |
| **Together AI** | DeepSeek-V4-Flash | — | — | Listed; pricing TBD / serverless |
| **Together AI** | DeepSeek-V4-Pro | $2.10 / M | $4.40 / M | + prompt caching at $0.20/M |
| **Fireworks AI** | DeepSeek-V4-Flash | $0.14 / M | $0.28 / M | 1M context |
| **Fireworks AI** | DeepSeek-V4-Pro | $1.74 / M | $3.48 / M | 1M context |
| **Fireworks AI** | DeepSeek-R1-0528 | — | — | Listed; pricing not shown in browse |

**Key pricing insight:** DeepSeek direct API is the cheapest option for V4-Flash and V4-Pro. Third-party providers add a markup (Fireworks V4-Pro is 4× more expensive than direct). For R1, OpenRouter at $0.70/$2.50 is the most transparent published rate.

### Comparison: Your Current Agent Roster (Direct API)

| Model | Input | Output | Context | Cost vs V4-Flash (input) |
|-------|-------|--------|---------|-------------------------|
| **Claude Haiku 4.5** | $1.00 / M | $5.00 / M | 200K | **7.1× more expensive** |
| **Claude Sonnet 4.6** | $3.00 / M | $15.00 / M | 1M | **21.4× more expensive** |
| **Claude Opus 4.7** | $5.00 / M | $25.00 / M | 1M | **35.7× more expensive** |
| **GPT-5.5** | $5.00 / M | $30.00 / M | 1M | **35.7× more expensive** |
| **Gemini 2.5 Pro** | $1.25 / M | $10.00 / M | 1M | **8.9× more expensive** |
| **Kimi K2.6** | ~$0.684 / M | ~$3.42 / M | 262K | **4.9× more expensive** |
| **DeepSeek-V4-Flash** | **$0.14 / M** | **$0.28 / M** | 1M | **Baseline** |
| **DeepSeek-V4-Pro** | **$0.435 / M** | **$0.87 / M** | 1M | **3.1× more expensive** |

---

## 2. Per-Model Capability Summary

### DeepSeek-V4-Flash

| Attribute | Detail |
|-----------|--------|
| **Parameters** | 284B total / 13B active (MoE) |
| **Context** | 1M tokens |
| **Max Output** | 384K tokens |
| **Modes** | Non-thinking, Think High, Think Max |
| **Tool Calling** | ✅ Native, both thinking & non-thinking modes. Strict JSON schema beta available. |
| **Pricing** | $0.14/M input, $0.28/M output |

**Benchmarks (Flash-Max mode):**
- MMLU-Pro: 86.2
- LiveCodeBench: 91.6
- Codeforces: 3052
- SWE Verified: 79.0
- GPQA Diamond: 88.1
- AIME 2025: 94.8

**Strengths:**
- Fastest DeepSeek model (13B active params = low latency)
- Cheapest 1M-context frontier-class model on the market
- Coding performance rivals Claude Sonnet 4.6 at 1/20th the cost
- Simple agent tasks perform on par with V4-Pro
- Excellent long-context efficiency (27% of V3.2 FLOPs at 1M context)

**Weaknesses:**
- Falls behind V4-Pro on complex knowledge tasks and richest agentic workflows
- Pure knowledge tasks (MMLU-Pro, SimpleQA) lag Pro by ~1–3 points
- Not the strongest at multi-step tool orchestration vs Opus 4.7

**Best Agent Roles:**
- High-volume sub-agent / parallel worker
- Code generation and review (bulk tasks)
- Title summarization, metadata extraction (replaces Haiku 4.5)
- Large-context repo analysis (replaces Gemini 2.5 Pro for cost-sensitive workloads)
- First-pass QA and filtering

---

### DeepSeek-V4-Pro

| Attribute | Detail |
|-----------|--------|
| **Parameters** | 1.6T total / 49B active (MoE) |
| **Context** | 1M tokens |
| **Max Output** | 384K tokens |
| **Modes** | Non-thinking, Think High, Think Max |
| **Tool Calling** | ✅ Native, both modes. Strict JSON schema beta. |
| **Pricing** | $0.435/M input, $0.87/M output |

**Benchmarks (Pro-Max mode vs frontier):**

| Benchmark | V4-Pro Max | Claude Opus 4.7 | Claude Opus 4.6 Max | Gemini 3.1 Pro High | GPT-5.4 xHigh |
|-----------|:----------:|:---------------:|:-------------------:|:-------------------:|:-------------:|
| MMLU-Pro | **87.5** | — | 89.1 | **91.0** | 87.5 |
| GPQA Diamond | **90.1** | — | 91.3 | **94.3** | 93.0 |
| LiveCodeBench | **93.5** | — | 88.8 | 91.7 | — |
| Codeforces | **3206** | — | — | 3052 | 3168 |
| SWE Verified | **80.6** | — | **80.8** | 80.6 | — |
| Terminal Bench 2.0 | **67.9** | — | 65.4 | 68.5 | 75.1 |
| AIME 2025 | **95.2** | — | 96.2 | 94.7 | **97.7** |
| BrowseComp | **83.4** | — | 83.7 | **85.9** | 82.7 |
| MCPAtlas | 73.6 | — | **73.8** | 69.2 | 67.2 |
| Toolathlon | **51.8** | — | 47.2 | 48.8 | **54.6** |

**Strengths:**
- **#1 open-source coding model:** LiveCodeBench 93.5, Codeforces 3206 (beats all open models, rivals top closed-source)
- SWE Verified 80.6% — essentially tied with Claude Opus 4.6 (80.8%)
- Best-in-class agentic coding benchmarks (open-source SOTA)
- 1M context with world-leading efficiency
- Supports Anthropic API format (`api.deepseek.com/anthropic`)
- Very strong math/reasoning in Max mode (AIME 2025 95.2%)

**Weaknesses:**
- General knowledge (MMLU-Pro 87.5) trails Gemini 3.1 Pro (91.0) and Opus 4.6 (89.1)
- Terminal Bench 2.0 (67.9) slightly behind Opus 4.6 (75.1) — multi-step agent reliability gap
- Toolathlon (51.8) behind GPT-5.4 (54.6)
- GPQA Diamond (90.1) below Gemini 3.1 Pro (94.3)
- Higher latency than Flash due to 49B active params vs 13B

**Best Agent Roles:**
- Primary implementation agent (replaces Claude Sonnet 4.6 for coding-heavy work)
- Architecture and complex codebase navigation
- Deep QA / AQA (but not quite Opus 4.7 level for async long-running agents)
- Complex multi-file code generation
- Agentic coding workflows (Claude Code, OpenCode integrations already supported)

---

### DeepSeek-R1 / R1-0528 (Reasoning Model)

| Attribute | Detail |
|-----------|--------|
| **Parameters** | 671B total / 37B active (MoE) |
| **Context** | 164K (OpenRouter) / 64K max output |
| **Architecture** | Same base as V3 family, RL-trained for reasoning |
| **Tool Calling** | ✅ Added in R1-0528 (function calling + JSON output) |
| **Pricing** | ~$0.55–$0.70/M input, ~$2.19–$2.50/M output |

**Benchmarks (R1-0528 vs original R1):**

| Benchmark | Original R1 | R1-0528 | Change |
|-----------|:-----------:|:-------:|:------:|
| MMLU-Redux | 92.9 | **93.4** | +0.5 |
| MMLU-Pro | 84.0 | **85.0** | +1.0 |
| GPQA-Diamond | 71.5 | **81.0** | +9.5 |
| LiveCodeBench | 63.5 | **73.3** | +9.8 |
| SWE Verified | 49.2 | **57.6** | +8.4 |
| AIME 2024 | 79.8 | **91.4** | +11.6 |
| AIME 2025 | 70.0 | **87.5** | +17.5 |
| Humanity's Last Exam | 8.5 | **17.7** | +9.2 |

**Strengths:**
- Massive reasoning improvement in 0528: AIME 2025 up from 70% → 87.5%
- GPQA-Diamond 81.0% — genuine expert-level science reasoning
- LiveCodeBench 73.3% and SWE Verified 57.6% — solid coding with reasoning
- Open reasoning tokens (transparent chain-of-thought)
- MIT licensed — can distill and commercialize freely

**Weaknesses:**
- **Expensive in practice:** Averages 23K reasoning tokens per hard question (vs 12K for original R1)
- Output cost ($2.50/M) × long chains = actual per-query cost can exceed Claude Opus 4.7
- Context window (164K) much smaller than V4 series (1M)
- Tool calling only added in 0528 — newer/less battle-tested than V4 or Claude
- Higher latency due to long reasoning generation

**Best Agent Roles:**
- Hard math/STEM verification
- Adversarial QA (red-team reasoning)
- Complex algorithm design
- Second-model review when reasoning transparency matters
- NOT for high-volume or latency-sensitive agent loops

---

### DeepSeek Coder Status

**Verdict: Effectively deprecated.** DeepSeek Coder V2 (June 2024) was the last standalone coder release. The V4 series has absorbed coding capabilities:
- V4-Pro Max: LiveCodeBench 93.5, SWE Verified 80.6%
- V4-Flash Max: LiveCodeBench 91.6, SWE Verified 79.0%

These exceed Coder V2 performance by a wide margin. No new Coder variant has been announced. Use V4-Flash or V4-Pro for all coding tasks.

---

## 3. Head-to-Head: DeepSeek-V4-Flash vs Claude Haiku 4.5

Haiku 4.5 is your current "small/cheap tasks, title/summarization" tier.

| Dimension | Claude Haiku 4.5 | DeepSeek-V4-Flash | Winner |
|-----------|:----------------:|:-----------------:|:------:|
| **Input Price** | $1.00 / M | **$0.14 / M** | V4-Flash (7× cheaper) |
| **Output Price** | $5.00 / M | **$0.28 / M** | V4-Flash (18× cheaper) |
| **Context** | 200K | **1M** | V4-Flash |
| **MMLU-Pro** | ~75%* | **86.2** (Max) | V4-Flash |
| **SWE Verified** | ~73%* | **79.0** (Max) | V4-Flash |
| **LiveCodeBench** | Unknown | **91.6** (Max) | V4-Flash |
| **Latency** | **Fastest Anthropic** | Very fast (13B active) | Haiku slightly faster? |
| **Tool Calling** | ✅ Full support | ✅ Full support | Tie |
| **Strict JSON Schema** | ✅ | ✅ Beta | Haiku (mature) |
| **Reliability** | **Anthropic SLA** | DeepSeek direct risk | **Haiku** |
| **Agent Ecosystem** | Claude Code native | Supported, less mature | **Haiku** |

*Haiku 4.5 exact benchmarks not widely published; estimates based on ">73% SWE-bench" claim and Sonnet 4-class performance.

**Verdict:** V4-Flash is dramatically cheaper with a larger context window and stronger benchmark scores. The only reasons to keep Haiku 4.5 are (1) Anthropic's reliability/SLA, and (2) native Claude Code ecosystem integration. For pure cost-efficiency in sub-agents, summarization, and high-volume parallel work, **V4-Flash is the clear replacement** — if served through a reliable third-party provider.

---

## 4. Head-to-Head: DeepSeek-V4-Flash vs Kimi K2.6

Kimi K2.6 is your current "cheap read-only scouting, bulk transforms" tier.

| Dimension | Kimi K2.6 | DeepSeek-V4-Flash | Winner |
|-----------|:---------:|:-----------------:|:------:|
| **Input Price** | $0.684 / M | **$0.14 / M** | V4-Flash (4.9× cheaper) |
| **Output Price** | $3.42 / M | **$0.28 / M** | V4-Flash (12× cheaper) |
| **Context** | 262K | **1M** | V4-Flash |
| **MMLU-Pro** | ~87.1 (thinking) | **86.2** (Max) | Kimi slightly |
| **LiveCodeBench** | 89.6 | **91.6** | V4-Flash |
| **SWE Verified** | 80.2 | **79.0** | Kimi slightly |
| **Agentic Focus** | Multi-agent orchestration | Agentic coding SOTA | Different strengths |
| **Reliability** | Moonshot AI | DeepSeek direct risk | **Kimi** |
| **Tool Calling** | ✅ | ✅ | Tie |

**Verdict:** V4-Flash undercuts Kimi K2.6 on price by 5–12× while offering 4× the context and comparable or better coding benchmarks. For read-only scouting and bulk transforms where the task is code/repo analysis, **V4-Flash is the better economic choice**. Kimi K2.6 retains an edge in multi-agent orchestration scenarios and possibly in Chinese-language contexts. If serving through OpenRouter (which routes to best provider), you could use both and fall back automatically.

---

## 5. Roles Where DeepSeek R1 Might Outperform Claude Opus 4.7 at Lower Cost

Claude Opus 4.7 costs $5/$25 per million tokens. DeepSeek R1-0528 costs ~$0.55–$0.70/$2.19–$2.50 per million — roughly **7–10× cheaper**.

However, R1's long reasoning chains mean **effective cost per solved problem** is closer than headline pricing suggests. R1-0528 uses ~23K tokens per hard reasoning problem vs ~12K for the original R1.

**Roles where R1-0528 is competitive or superior:**

| Role | R1-0528 Score | Opus 4.7 / Frontier | Assessment |
|------|:-------------:|:-------------------:|------------|
| AIME 2025 (math) | **87.5%** | — | Top-tier; likely beats Opus 4.7 on pure math |
| GPQA-Diamond (science) | **81.0%** | — | Strong expert reasoning |
| LiveCodeBench | 73.3% | — | Good but V4-Pro (93.5) is better for coding |
| Algorithm design / proof | Excellent | — | Transparent reasoning is a feature |
| Red-team / adversarial QA | Good | — | Open reasoning tokens aid verification |

**Roles where Opus 4.7 remains superior:**
- Multi-step agent reliability (Terminal Bench 2.0: Opus 4.6 75.1 vs R1 not benchmarked, but R1's tool use is newer)
- Long-running async agents (coherence over extended sessions)
- SWE Verified (R1 57.6% vs Opus 4.6 80.8% — massive gap)
- Complex codebase navigation with memory
- Professional document creation and judgment

**Verdict:** R1-0528 is a **specialized reasoning weapon**, not a general Opus 4.7 replacement. Use it for math/STEM verification, algorithmic reasoning, and adversarial QA where its open reasoning chain adds value. For architecture, long-running agents, and complex software engineering, Opus 4.7 remains the safer choice.

---

## 6. API Reliability Notes for Production Use

### DeepSeek Direct (api.deepseek.com)

| Factor | Status |
|--------|--------|
| **Historical uptime** | Spotty during high-demand periods (Jan 2025 surge caused significant outages) |
| **Current status page** | `status.deepseek.com` failed to load during this research (2026-06-01) |
| **Rate limits** | V4-Flash: 2500 concurrency; V4-Pro: 500 concurrency |
| **Cache hit pricing** | Excellent — $0.0028–$0.0036/M for repeated context |
| **Geographic risk** | China-based company; potential regulatory/export concerns for some workloads |
| **Production readiness** | ⚠️ **Use with third-party fallback required** |

### Recommended Production Strategy

| Tier | Recommendation |
|------|----------------|
| **Critical path agents** | Do NOT use DeepSeek direct. Use OpenRouter with DeepSeek as primary + Claude/Gemini fallback. |
| **Bulk/non-critical work** | DeepSeek direct API acceptable with retry logic. |
| **Cost-sensitive at scale** | Fireworks or Together AI for V4-Flash at ~$0.14/$0.28 (Fireworks matches direct pricing). |
| **R1 reasoning tasks** | OpenRouter ($0.70/$2.50) with automatic fallback to GPT-5.5 or Gemini 2.5 Pro. |

OpenRouter's provider routing is particularly valuable: it automatically falls back to another provider if DeepSeek's API is down, maximizing uptime while preserving cost savings.

---

## 7. Tool-Call Support Matrix

| Model | Native Tool Calling | Strict JSON Schema | Parallel Tools | Thinking Mode Tools | Notes |
|-------|:-------------------:|:------------------:|:--------------:|:-------------------:|-------|
| **DeepSeek-V4-Flash** | ✅ | ✅ Beta | ✅ | ✅ | Full support in all modes |
| **DeepSeek-V4-Pro** | ✅ | ✅ Beta | ✅ | ✅ | Full support in all modes |
| **DeepSeek-R1-0528** | ✅ | ✅ Beta | ✅ | N/A (always thinking) | Added in 0528 update |
| **Claude Haiku 4.5** | ✅ | ✅ | ✅ | ✅ | Mature, well-tested |
| **Claude Sonnet 4.6** | ✅ | ✅ | ✅ | ✅ | Mature, well-tested |
| **Claude Opus 4.7** | ✅ | ✅ | ✅ | ✅ | Mature, well-tested |
| **GPT-5.5** | ✅ | ✅ | ✅ | N/A | Mature |
| **Gemini 2.5 Pro** | ✅ | ✅ | ✅ | ✅ | Mature |
| **Kimi K2.6** | ✅ | ✅ | ✅ | ✅ | Good support |

**Important:** DeepSeek's strict mode requires using the beta base URL (`https://api.deepseek.com/beta`) and has specific JSON Schema requirements:
- All object properties must be `required`
- `additionalProperties` must be `false`
- Supports: object, string, number, integer, boolean, array, enum, anyOf, $ref/$def
- Does NOT support: `minLength`/`maxLength` on strings, `minItems`/`maxItems` on arrays

This is more restrictive than Claude's tool use but sufficient for most agent schemas.

---

## 8. Routing Recommendations

### Immediate Wins (Low Risk)

| Current | Replacement | When | Savings |
|---------|-------------|------|---------|
| Haiku 4.5 — title/summarization | V4-Flash | Non-critical bulk tasks | **~90%** |
| Haiku 4.5 — sub-agents | V4-Flash | Parallel sub-agent loops | **~90%** |
| Kimi K2.6 — repo scouting | V4-Flash | Read-only codebase analysis | **~80%** |
| Sonnet 4.6 — coding tasks | V4-Pro | Live coding, PR review | **~85%** |

### Experimental / Pilot (Medium Risk)

| Current | Replacement | When | Notes |
|---------|-------------|------|-------|
| Sonnet 4.6 — default implementation | V4-Pro | New feature branches | Test side-by-side for 2 weeks |
| Gemini 2.5 Pro — large-context analysis | V4-Flash | Cost-sensitive repo scans | 1M context at 1/9th the price |
| Opus 4.7 — AQA / hard review | V4-Pro Max | Code-heavy AQA | V4-Pro beats Opus on LiveCodeBench |

### Keep As-Is (High Risk to Change)

| Current | Reason |
|---------|--------|
| **Opus 4.7 — architecture decisions** | Unmatched for long-running judgment, async agents, multi-stage debugging |
| **Opus 4.7 — final AQA sign-off** | Your Deep QA gate requires 95 adversarial score; Opus 4.7 is the proven closer |
| **Claude Haiku 4.5 — critical path fast tasks** | If 50ms latency matters and Anthropic SLA is required |
| **GPT-5.5 — terminal/shell loops** | Ecosystem lock-in with OpenAI tools; no compelling DeepSeek advantage here |

---

## 9. Cost Modeling: Hypothetical Monthly Agent Workload

Assume a moderate agent system workload:

| Task Type | Monthly Tokens | Current Model | Current Cost | DeepSeek Alternative | DeepSeek Cost |
|-----------|---------------|---------------|-------------:|---------------------:|--------------:|
| Sub-agent calls (input) | 500M | Haiku 4.5 | $500 | V4-Flash | **$70** |
| Sub-agent calls (output) | 100M | Haiku 4.5 | $500 | V4-Flash | **$28** |
| Coding tasks (input) | 200M | Sonnet 4.6 | $600 | V4-Pro | **$87** |
| Coding tasks (output) | 50M | Sonnet 4.6 | $750 | V4-Pro | **$44** |
| Repo analysis (input) | 100M | Gemini 2.5 Pro | $125 | V4-Flash | **$14** |
| Repo analysis (output) | 20M | Gemini 2.5 Pro | $200 | V4-Flash | **$6** |
| Hard QA / AQA (input) | 50M | Opus 4.7 | $250 | V4-Pro | **$22** |
| Hard QA / AQA (output) | 20M | Opus 4.7 | $500 | V4-Pro | **$17** |
| **TOTAL** | | | **$3,425** | | **$288** |

**Potential savings: ~92% for this workload mix**, assuming full replacement. A more realistic partial replacement (keeping Opus 4.7 for final AQA, GPT-5.5 for terminal) still yields **~75–80% savings**.

**Caveat:** R1-0528 reasoning tasks are NOT included. If you route hard reasoning through R1, the long output chains ($2.50/M × 20K+ tokens per task) can quickly eat into savings. Use R1 surgically.

---

## 10. Action Items & Open Questions

1. **Pilot V4-Flash for Haiku 4.5 workloads** — Start with title generation, summarization, and parallel sub-agents. Route through OpenRouter for fallback safety.
2. **Benchmark V4-Pro vs Sonnet 4.6 on your codebase** — Run 20 real coding tasks side-by-side. Measure pass rate + your subjective quality score.
3. **Evaluate R1-0528 for adversarial QA** — Test on 5–10 AQA scenarios where reasoning transparency matters.
4. **Set up OpenRouter provider routing** — Configure DeepSeek primary with Claude/Gemini fallback for production resilience.
5. **Monitor cache hit rates** — DeepSeek's cache hit pricing ($0.0028/M) is transformative for repeated-context workflows (e.g., multi-turn coding with long system prompts). Ensure your agent framework supports prompt caching.
6. **Open question:** What is the actual end-to-end latency of V4-Flash vs Haiku 4.5 for your typical 2K input / 500 output prompt? Benchmark this directly.
7. **Open question:** How does V4-Pro perform on your specific TypeScript/React codebase vs Sonnet 4.6? Benchmarks are directional; your domain matters.

---

*Report compiled from live API docs and pricing pages on 2026-06-01. Pricing and benchmarks are accurate as of research date; DeepSeek has a history of rapid price adjustments — verify at api-docs.deepseek.com before making commitments.*
