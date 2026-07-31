# DOSAI Specification v2

- **Product:** Dashboard for Optimizing Seamless Agent Interaction
- **Pronunciation:** "doh-sigh"
- **Former working name:** AgentControlShell
- **Repository:** [Socialeap/DOSAI](https://github.com/Socialeap/DOSAI)

> Authority note: the repository owner confirmed on 2026-07-31 that this file is
> the authoritative DOSAI product specification. The repository-root `AACP.md`
> is a non-authoritative conceptual guide to possible end states. It may inform
> design exploration but cannot override this specification, `SECURITY.md`, an
> accepted ADR, or the live development plan.

## System Architecture and Specification for an Asymmetric Agent Control Panel

**By Shakoure Char, CEO Transcendence Media (07-29-2026)**

## 1. Introduction & Executive Summary

### **Purpose & Primary Function**

**DOSAI** is a dedicated, local-first macOS desktop control plane engineered to govern, observe, and optimize dual-agent software development workflows. Specifically, it orchestrates an asymmetric pipeline between two primary AI agents:

1. **Cloud Strategy & Repo Orchestrator (Claude Code):** Operating in a cloud/containerized workspace connected to the GitHub repository, responsible for high-level codebase architecture, complex refactoring, test suite generation, and PR management.
2. **Local Host & Execution Agent (OpenAI Codex):** Operating locally with native macOS computer, browser, and shell control, acting as the hands-on executor for local test runs, auth-walled web inspection, dynamic UI evidence collection, and local environment execution.

The shell functions as a zero-latency IPC bridge, local governance engine, token compression pipeline, and visual telemetry dashboard, ensuring both agents operate synchronously while adhering strictly to workspace safety boundaries.

### **Inspiration & Foundational Context**

This specification is directly grounded in the governance rules defined in the project's [coordination-charter.md](https://github.com/Socialeap/matterport-hud-builder-d499db26/blob/main/.codex-review/coordination-charter.md). That charter establishes explicit working rules learned from multi-agent coordination: single-writer authority per branch/file, structured evidence handoffs via \[CODEX PACKET\] markers, untrusted data quoting, and an Autonomy Envelope (Green, Yellow, Red, and Black tiers). DOSAI elevates this charter from a manual Markdown document into a programmatically enforced desktop control plane.

### **Comparative Framework Analysis**

* [**Buzz**](https://github.com/block/buzz) **(Nostr-Native Workspace):** [Buzz](https://github.com/block/buzz) models humans and AI agents as equal room members with cryptographic Nostr keypairs communicating over a self-hosted Rust relay (buzz-relay). While [Buzz](https://github.com/block/buzz) excels at asynchronous, multi-user team chat, unified event searching (NIP-01/NIP-34), and multi-agent channels, it introduces trade-offs for solo developer workflows: relay network latency, per-channel sequential queuing, context window bloat from channel discussions, and limited local desktop/GUI action power.
* **Hermes / OpenClaw / Traditional Runtimes:** Typical agent runtimes rely on centralized, monolithic loop controllers that pass entire execution logs back and forth through a single agent context. This creates massive prompt token inflation, slow execution cycles, and fragile tool-calling chains.
* **DOSAI (This Architecture):** Rather than treating agents as chat channel members over a network relay, DOSAI implements a local-first, asymmetric execution pipeline. By keeping execution communication local via standard I/O (stdio) and SQLite, it eliminates network relay latency, enforces strict single-writer branch ownership, and utilizes local pre-processing engines (AST parsers and visual differs) to achieve maximum token efficiency and execution velocity.

---

## 2. System Architecture & Tech Stack Rationale

The architecture prioritizes local host performance, low-latency inter-process communication, zero-network overhead for logging, and seamless browser/desktop inspection.

```text
┌────────────────────────────────────────────────────────────────────────┐
│               macOS Native App Shell (Electron \+ Vite)                 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    React \+ Tailwind HUD Dashboard                │  │
│  │  • Autonomy Tier Badges      • Live Stream & DOM Inspector        │  │
│  │  • Red-Tier Approval Modals  • Time-Machine Session Scrubber     │  │
│  └─────────────────────────────────┬────────────────────────────────┘  │
│                                    │ IPC (ContextBridge)               │
│  ┌─────────────────────────────────▼────────────────────────────────┐  │
│  │                   Node.js Main Process Engine                    │  │
│  │  • Pre-Flight Charter Engine   • Tree-Sitter AST Pruner          │  │
│  │  • pHash Visual Differ         • SQLite FTS5 Memory (\`better-sqlite3\`)│  │
│  └──────────────────┬──────────────────────────────┬────────────────┘  │
└─────────────────────┼──────────────────────────────┼───────────────────┘
                      │ stdio / IPC                  │ API / GitHub
                      ▼                              ▼
          ┌───────────────────────┐      ┌───────────────────────┐
          │  Codex (Local Host)   │      │  Claude Code (Cloud)  │
          │  • Mac / Browser GUI  │      │  • Architecture       │
          │  • Shell & Evidence   │      │  • Code / PR Write    │
          │  • Green/Yellow Tier  │      │  • Task Coordinator   │
          └───────────────────────┘      └───────────────────────┘
```

### **Resource Selection Matrix & Contextual "WHY"**

| Resource / Tool | Choice | Contextual Rationale ("WHY") |
| :---- | :---- | :---- |
| **App Runtime** | **Electron** (Node.js Main \+ Chromium Renderer) | On Apple Silicon (M4 Mac Mini), Electron's \~150MB memory footprint is negligible. Electron provides native Node.js process management (child\_process), direct Chromium CDP binding for embedded browser inspection, and access to macOS system APIs without requiring cross-language bridges (e.g., Rust-to-JS in Tauri). |
| **Build Tooling** | **Vite** | Delivers instantaneous Hot Module Replacement (HMR) during local development and compiles modern TypeScript/React frontend assets with minimal bundle overhead. |
| **UI Layer** | **React \+ Tailwind CSS \+ Lucide Icons** | Enables rapid construction of high-density, dark-mode technical dashboards, live log viewers, syntax-highlighted diffs, and status badges using declarative component structures. |
| **Database & Search** | **better-sqlite3 \+ FTS5** | Synchronous, zero-network-latency relational storage. Running locally on the M4 SSD, SQLite executes queries in sub-millisecond time. The built-in FTS5 extension provides full-text search across past \[CODEX PACKET\] logs and error outputs without needing external search daemons. |
| **AST Parser** | **tree-sitter (Node Bindings)** | Performs syntax-aware code parsing directly in the Node.js main process. Used to prune unchanged functions, import lists, and boilerplate from diffs before they are transmitted to Claude, reducing token usage by up to 80%. |
| **Visual Differ** | **sharp (pHash / Perceptual Hashing)** | Computes local perceptual image hashes on browser viewports captured by Codex. Suppresses identical or low-delta visual frames locally so vision tokens are consumed only when true UI changes occur. |
| **Filesystem Watcher** | **chokidar** | Provides performant, non-polling filesystem watching over local repository paths, tracking changes in skill directories (.claude/skills/, .codex/skills/, .agents/skills/) and session log files in real time. |

---

## 3. Core Subsystem Specifications

### **Subsystem A: Inter-Process Communication (IPC) & Packet Bridge**

The IPC Bridge oversees stdout/stderr streams from Codex's local execution environment, intercepting structural markers and enforcing data cleanliness.

* **Packet Detection & Formatting:** The main process monitors Codex stdio streams for the mandatory \[CODEX PACKET\] header mandated by the [coordination-charter.md](https://github.com/Socialeap/matterport-hud-builder-d499db26/blob/main/.codex-review/coordination-charter.md).
* **Untrusted Data Sanitization:** Any external browser text, terminal logs, or error stack traces captured by Codex are automatically wrapped in untrusted data quotes prior to UI rendering or transmission to Claude, preventing prompt injection attacks from external web pages.
* **Message Relaying:** Formatted packets are appended to the local SQLite timeline and routed to Claude's input interface over local IPC or GitHub API webhooks.

### **Subsystem B: Local Charter Compliance & Governance Engine**

This engine enforces the Autonomy Envelope locally *before* commands execute, eliminating back-and-forth LLM roundtrips for unauthorized actions.

* **Pre-Flight Command Inspection:** Every command generated by Codex passes through a local pattern validator in Electron's main process.
* **Tier Categorization:**
  * **Green Tier:** Inspection, read-only terminal commands, local tests, dynamic UI reading, and Stripe Sandbox operations execute automatically with zero prompts.
  * **Yellow Tier:** Pre-approved bounded tasks (e.g., Sandbox refunds, draft branch creations) run with an automated notification banner.
  * **Red Tier:** High-risk actions (Stripe Live operations, database migrations, production backend deploys, shared charter edits, or destructive git operations) are halted immediately. Electron pops a native macOS slide-down modal sheet displaying the command, target resource, and exact diff, requiring explicit physical human authorization.
  * **Black Tier:** Strictly prohibited actions (transmitting secrets, reading session tokens, self-approving production changes) are blocked outright with an immutable error log entry.
* **Single-Writer Branch Enforcer:** Checks active git branches against ownership rules (claude/\<topic\> vs. codex/\<topic\>). If Codex attempts to write directly to a Claude branch or push to main, the engine aborts the write locally.

### **Subsystem C: Shared Skills Index & Procedural Memory**

Taking inspiration from [Buzz](https://github.com/block/buzz)'s agent skill directories, the shell implements a local, shared skill broker that allows both Claude and Codex to learn, store, and invoke reusable procedural runbooks.

* **Directory Watching:** chokidar monitors .claude/skills/, .codex/skills/, and .agents/skills/ for newly created or updated SKILL.md files.
* **SQLite Indexing:** Electron parses the frontmatter, triggers, and execution steps of each skill, indexing them into SQLite.
* **Compact Manifest Injection:** Instead of loading all skill instructions into agent prompt contexts, the shell injects a lightweight index (skill names and 1-line descriptions). Agents invoke a skill using a short command (e.g., skills:load("stripe-sandbox-checker")), and Electron dynamically supplies the exact procedure to the local executor.
* **Cross-Agent Knowledge Sharing:** When Codex discovers a complex dynamic UI flow, it writes the steps to a local skill file. Claude can later reference that skill in high-level task plans, eliminating repetitive prompt instructions.

### **Subsystem D: Token Compression & Optimization Pipeline**

To maintain low API costs and clean context windows, the shell processes raw host data through a multi-stage local compression pipeline:

* **Tree-Sitter AST Diff Pruner:** Parses code diffs and terminal stack traces. Strips away unchanged code blocks, redundant import declarations, and repetitive framework logging, preserving only modified syntax nodes and adjacent error contexts.
* **Perceptual Image & DOM Diffing Engine:** Computes perceptual hashes (pHash) on screenshots captured during Codex browser automation runs. If the visual delta between steps falls below a configurable threshold, the screenshot is dropped, and only a text summary of the DOM mutation is logged.
* **High-Density Packet Assembly:** Bundles pruned terminal output, structural DOM deltas, and relevant skill references into a compact, standardized \[CODEX PACKET\] payload before sending it to Claude.

---

## 4. User Interface & Telemetry Specification

The UI is built as a high-density, dark-mode developer HUD designed for passive monitoring and fast intervention.

```text
┌────────────────────────────────────────────────────────────────────────┐
│ DOSAI HUD                                 \[M4 Optimized\]   │
├───────────────────┬────────────────────────────────────────────────────┤
│ ACTIVE OBJECTIVES │ LIVE EXECUTION STREAM & INSPECTOR                  │
│                   │                                                    │
│ Claude (Cloud):   │ \[CODEX PACKET\] Task: Inspect Stripe Webhook        │
│ "Refactor auth"   │ Command: \`npm run test:e2e\`                        │
│                   │ Status: GREEN TIER (Auto-Executed)                 │
│ Codex (Local):    │ \-------------------------------------------------- │
│ "Run E2E tests"   │  \[Embedded Chromium Viewport / Live DOM Inspector\] │
├───────────────────┴────────────────────────────────────────────────────┤
│ TELEMETRY & CONTROLS                                                   │
│ Token Compression: 84% Saved | SQLite Events: 1,420 | Circuit: ONLINE    │
│ \[Scrubber: ◄◄ █▍────────────── ►► 00:14:22\]  \[HOTKEY: Cmd+Opt+Esc PAUSE\]│
└────────────────────────────────────────────────────────────────────────┘
```

### **Key UI Modules**

1. **Live Multi-Agent Task Board:** Displays Claude's active high-level strategic goal side-by-side with Codex's current local execution step. Displays live status badges (Planning, Executing, Awaiting Red-Tier Approval).
2. **Token Efficiency & Compression Gauge:** Real-time visual telemetry showing total input/output token counts and the compression ratio achieved by the local AST pruner and visual differ.
3. **Embedded Viewport & DOM Inspector:** An embedded Chromium webview rendering Codex's live browser automation session, accompanied by real-time console logs and network payload inspectors.
4. **Time-Machine Session Scrubber:** A scrubbable visual and terminal timeline at the bottom of the HUD, allowing the user to replay historical execution runs frame-by-frame with zero LLM API calls.
5. **Global Safety Circuit Breaker:** A system-wide menu bar indicator and hotkey listener (Cmd \+ Option \+ Esc) that instantly terminates all local child processes, freezes active browser contexts, and sets the system state to **Paused**.

---

## 5. Implementation Roadmap & AI Review Best Practices

To enable Claude Code or Codex to implement this control plane systematically, the build is broken into four sequential phases.

### **Phase 1: Core Shell & Process Architecture**

* Set up the Electron \+ Vite \+ React \+ TypeScript project structure.
* Implement the main process process-spawner (child\_process/execa) to manage Codex stdio streams.
* Configure better-sqlite3 with an initial schema for logging events, packets, and charter violations.

### **Phase 2: Charter Governance & IPC Bridge**

* Build the local charter compliance parser matching the Green/Yellow/Red/Black rules.
* Implement native macOS notification dialogs and modal sheets for Red Tier approvals.
* Construct the \[CODEX PACKET\] parser and untrusted data quoting pipeline.

### **Phase 3: Skills Indexer & Compression Pipeline**

* Set up chokidar filesystem watchers over agent skill directories.
* Integrate tree-sitter for AST-aware diff pruning on terminal outputs and code changes.
* Integrate sharp for perceptual image hashing on captured browser viewports.

### **Phase 4: HUD Dashboard & Replay Visualizations**

* Build the React \+ Tailwind HUD dashboard, including task boards and telemetry gauges.
* Implement the embedded Chromium viewport for live browser automation inspection.
* Build the Time-Machine session scrubber backed by SQLite event history.

### **Architectural Best Practices for Implementation**

* **Defensive IPC Channel Isolation:** Never expose raw Node.js child\_process bindings directly to the renderer process. Use Electron’s contextBridge and ipcRenderer with strict TypeScript type definitions for all IPC channels.
* **Non-Blocking Execution:** Ensure heavy local computations (AST parsing, image hashing, and SQLite queries) run asynchronously or off the main renderer thread to prevent UI frame drops.
* **Atomic Filesystem Writes:** When updating shared skill indexes or charter state files, write to a temporary file first and perform an atomic rename to prevent file corruption during concurrent agent access.
* **Deterministic Logging:** Structure all SQLite event logs with ISO-8601 timestamps, signed agent identifiers, and explicit charter tier tags to maintain a cryptographically verifiable execution audit trail.
