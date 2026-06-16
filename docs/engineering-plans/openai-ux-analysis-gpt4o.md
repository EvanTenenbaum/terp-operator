# TERP Operator — Adversarial UX Audit (OpenAI GPT-4o)

**Model:** gpt-4o | **Date:** 2026-06-16
**Role:** Adversarial audit of CURRENT design (not retrofitted target)

---

### 1. Creating a PO
- **Score: 3/10**
  - **Worst Friction Point:** Overwhelming amount of irrelevant context. The VendorContextPanel steals valuable screen real estate, continuously showing information that might not be needed for every PO creation. The presence of irrelevant action buttons like "Receive" and "Unfinalize" further confuses and clutters the interface. 
  - **Comparison to Mercury:** Mercury typically employs context-sensitive interfaces where only relevant actions are exposed. There's minimalism in visible options, preventing distraction.

### 2. Processing a Sale
- **Score: 2/10**
  - **Worst Friction Point:** The sheer number of panels dilutes focus, demanding significant cognitive effort to locate the orders grid and relevant customer data. The appearance of a validation panel without clear indication adds to the confusion.
  - **Comparison to Mercury:** Mercury apps usually have prioritized flows and clear segregation of tasks, where crucial panels slide in only when necessary, reducing cognitive load.

### 3. Intake Verification
- **Score: 4/10**
  - **Worst Friction Point:** The inability to bulk-select across multiple POs creates unnecessary friction, especially in high-volume scenarios. The selection state ambiguity adds to the operational overhead.
  - **Comparison to Mercury:** Mercury's interfaces often facilitate batch operations across entities, reducing repetitive clicks and enhancing efficiency.

### 4. Dashboard → Action
- **Score: 3/10**
  - **Worst Friction Point:** The dashboard lacks clear prioritization and directive. After an action like "Intake Ready: 8" is selected, the lack of feedback on task completion and dashboard refreshment leaves the operator uncertain about their progress.
  - **Comparison to Mercury:** Mercury would likely employ a dynamic dashboard that visually updates in real-time, guiding the user with clear next steps after each action.

### 5. Error Recovery
- **Score: 2/10**
  - **Worst Friction Point:** The lack of contextual information surrounding the error is debilitating. Users need details about what the command was attempting, yet they only see generic error identifiers.
  - **Comparison to Mercury:** In Mercury, error details are usually accompanied by actionable insights or at least a comprehensive log that aids in quicker resolution.

### 6. Mid-Flow Context Switch
- **Score: 1/10**
  - **Worst Friction Point:** The inability to preserve state decimates workflow efficiency. Leaving a partially-built sale to address a query leads to data loss or state reset. The system's design doesn't accommodate necessary multitasking.
  - **Comparison to Mercury:** Mercury apps tend to maintain session state and allow easy context switches, preserving work in progress and minimizing the risk of data loss.

**General Observations:**
- There is a pervasive issue of information overload and irrelevant data presentation across all workflows.
- Lack of progressive disclosure and context-awareness severely impacts task efficiency.
- The design forces operators into a constant state of context-switching, leading to fatigue and errors, especially when tired.
- Compared to Mercury, there is little accommodation for adaptive workflows and responsive UI that reduces mental burden.