# Record Tips MVP Iteration Plan

## 1. Planning Goal

This document turns the MVP scope into a time-boxed delivery schedule.
The plan assumes one focused engineer building a local-first prototype.

## 2. Delivery Strategy

1. Prove infrastructure before polishing the conversation prompts.
2. Keep one thin vertical slice working at all times: web input -> server response -> next web step.
3. Front-load external dependency risk: PostgreSQL pgvector, local ASR, LM Studio, and macOS Reminders permissions.
4. Treat the clarification loop as core product behavior, not as a later enhancement.
5. Use manual validation checkpoints at the end of each iteration.

## 3. Assumptions

| Item | Assumption |
| --- | --- |
| Team size | 1 engineer |
| Work mode | Full-time focus |
| Runtime | Bun + TypeScript on macOS |
| External services | Local Docker PostgreSQL, local ASR, and local LM Studio are available |
| Input client | The React web client can send audio or text and can preserve `session_id` across turns |

## 4. Iteration Timeline

| Iteration | Duration | Goal | Exit Criteria |
| --- | --- | --- | --- |
| Iteration 0 | 0.5 day | Environment readiness | DB container, ASR, LM Studio, Bun runtime, `.env` contract all verified |
| Iteration 1 | 1.5 days | Service bootstrap and session/database initialization | Service starts, env validation works, session tables and `my_ideas` are auto-created |
| Iteration 2 | 1.5 days | Multimodal input and transcription | The web client can send text or audio; audio can be transcribed |
| Iteration 3 | 2 days | Conversation API and clarification loop | `/distill` returns JSON and supports multi-turn `session_id` continuation |
| Iteration 4 | 2 days | RAG retrieval, final distillation, and local vault persistence | Completed sessions retrieve history, finalize Markdown, insert DB row, and create vault file |
| Iteration 5 | 1 day | Reminders integration and web round-trip | Milestone extraction works and reminders write is attempted safely |
| Iteration 6 | 1.5 days | End-to-end validation and ops docs | Audio and text flows both pass multi-turn manual validation and setup docs are complete |

Total suggested schedule: 10 working days.

## 5. Iteration Breakdown

### Iteration 0

Goal: remove environment unknowns before coding.

Tasks:

| Task ID | Description |
| --- | --- |
| T-002 | Install project dependencies |
| T-003 | Define `.env` contract |
| T-005 | Draft web request/response contract |
| T-034 | Draft local setup steps early |

Validation:

| Check | Expected Result |
| --- | --- |
| Docker `pgvector/pgvector:pg16` container starts | Port `5432` is reachable |
| Local ASR endpoint or service reachable | A sample audio can be accepted for transcription |
| LM Studio model endpoint reachable | `http://localhost:1234/v1` responds |
| Bun available locally | `bun --version` succeeds |

Risk focus:

- ASR integration path may vary by local runtime choice.
- LM Studio model names may differ from the plan.
- Browser multipart upload may need tighter payload conventions.

### Iteration 1

Goal: make the service boot predictably and create all required storage primitives.

Tasks:

| Task ID | Description |
| --- | --- |
| T-001 | Create Bun service entry |
| T-004 | Add config validation |
| T-009 | Create PostgreSQL client |
| T-010 | Enable pgvector extension |
| T-011 | Create `idea_sessions` table |
| T-012 | Create `session_messages` table |
| T-013 | Create `my_ideas` table |
| T-014 | Add pgvector formatter |

Deliverable:

- Service starts and initializes database structures automatically.

Exit criteria:

1. Missing `.env` values cause immediate startup failure.
2. Fresh database is ready after one boot.
3. Session tables and final idea table exist with expected columns.

### Iteration 2

Goal: accept both user input modes and normalize them into the same text pipeline.

Tasks:

| Task ID | Description |
| --- | --- |
| T-006 | Implement text input normalization |
| T-007 | Implement audio upload parsing |
| T-008 | Implement transcription adapter |
| T-018 | Create unified `POST /distill` handler skeleton |
| T-019 | Add multimodal request validation |

Deliverable:

- The web client can send either manual text or audio and the server can normalize each request into a usable text payload.

Exit criteria:

1. Invalid text-mode requests return `400`.
2. Invalid audio-mode requests return `400`.
3. A valid audio request produces transcription text.

### Iteration 3

Goal: make the service conversational instead of one-shot.

Tasks:

| Task ID | Description |
| --- | --- |
| T-015 | Configure LM Studio client |
| T-016 | Add embedding generation with strict model availability |
| T-017 | Add clarification and final-distill prompts |
| T-020 | Implement session create/load behavior |
| T-021 | Persist user turns |
| T-022 | Build aggregated session context |
| T-024 | Implement clarify-or-final decision logic |
| T-025 | Persist assistant clarification turns |

Deliverable:

- Sending one turn returns a structured JSON response that either asks a focused question or ends the session with a final result.

Exit criteria:

1. First turn creates a session and returns a `session_id`.
2. Follow-up turn with the same `session_id` preserves context.
3. Assistant asks at most one focused question per turn.

### Iteration 4

Goal: turn the conversational loop into a durable knowledge pipeline.

Tasks:

| Task ID | Description |
| --- | --- |
| T-023 | Add historical similarity retrieval query |
| T-026 | Implement final Markdown generation and parsing |
| T-027 | Persist completed ideas into `my_ideas` |
| T-028 | Create vault directory bootstrap and filename policy |
| T-029 | Write final Markdown file template |

Deliverable:

- Completed sessions retrieve history, write a final DB record, and create a local Markdown note.

Exit criteria:

1. A completed session writes one final idea row and one vault file.
2. A later similar session retrieves prior context.
3. Created note is readable in Obsidian-compatible format.

### Iteration 5

Goal: connect the final output to a real action system without destabilizing the main conversation flow.

Tasks:

| Task ID | Description |
| --- | --- |
| T-030 | Implement JXA reminders sync |
| T-031 | Add guard when no milestone exists |
| T-032 | Improve logs for session, retrieval, persistence, and reminder steps |
| T-033 | Document web loop behavior |

Deliverable:

- Finalized sessions can dispatch a reminder and the web flow is documented clearly.

Exit criteria:

1. Reminder appears in the default Reminders list on success.
2. Permission failures are logged and do not break final API response.
3. Web flow for follow-up turns is documented with `session_id` handling.

### Iteration 6

Goal: prove the full loop is repeatable for both audio and text paths.

Tasks:

| Task ID | Description |
| --- | --- |
| T-034 | Finalize setup and runbook docs |
| T-035 | Execute full manual validation for text mode |
| T-036 | Execute full manual validation for audio mode |
| T-037 | Validate cross-session RAG reuse |

Deliverable:

- A reproducible local MVP with setup documentation and evidence for both input modes.

Exit criteria:

1. New machine setup steps are complete enough to reproduce the stack.
2. Text sessions support clarifying turns and final persistence.
3. Audio sessions support transcription, clarifying turns, and final persistence.
4. A later session can reference earlier similar ideas.

## 6. Milestones

| Milestone | Planned Day | Outcome |
| --- | --- | --- |
| M1 | Day 2 | Service boots and storage primitives auto-initialize |
| M2 | Day 4 | Text and audio requests are accepted and normalized |
| M3 | Day 6 | `/distill` supports multi-turn clarification sessions |
| M4 | Day 8 | Completed sessions persist to DB and local vault with RAG reuse |
| M5 | Day 9 | Reminder sync and web round-trip are integrated safely |
| M6 | Day 10 | MVP passes audio, text, and cross-session validation |

## 7. Risk Register

| Risk | Impact | Mitigation | Trigger to Escalate |
| --- | --- | --- | --- |
| Local ASR integration is unstable or too slow | Voice path blocked or degraded | Validate with a sample audio in Iteration 0 and keep a clear fallback error path | Audio cannot be transcribed reliably by Iteration 2 |
| LM Studio model not loaded or model name mismatch | Clarification/final path blocked | Validate model availability in Iteration 0 | Service cannot return a first valid question by Iteration 3 |
| PostgreSQL pgvector extension missing | Retrieval path blocked | Use official pgvector image and boot-time extension creation | Table init fails on a fresh database |
| Browser loses `session_id` between turns | Clarification context breaks | Keep JSON response contract minimal and document storage clearly | Second turn cannot resume same session |
| LLM asks too many or low-value questions | User drop-off increases | Cap question count and define focused prompting rules | More than 3 turns are often needed for simple ideas |
| macOS automation permissions block Reminders | Reminder step degrades | Make reminder path non-blocking and log clearly | Reminder step crashes final response flow |
| Embedding model missing or mismatched | Retrieval path is blocked | Fail fast on startup and keep model names aligned with LM Studio | Service cannot complete startup or embedding requests |

## 8. Go/No-Go Checklist

Release to personal daily use only if all checks below are true:

1. Service startup is stable across restarts.
2. The web client can complete at least one text session and one audio session.
3. At least one session proves multi-turn clarification with the same `session_id`.
4. A later session proves historical retrieval reuse.
5. Local vault files are created with correct Markdown structure.
6. Reminder sync failures do not break the final API path.
7. Setup steps can be replayed from documentation.

## 9. After-MVP Backlog

These items are intentionally excluded from the current schedule:

1. Native iOS app instead of the web input page.
2. Raw audio archive, playback UI, and waveform editing.
3. Multi-user accounts and cloud sync.
4. Topic clustering and automatic merge jobs.
5. Search UI or web management dashboard.
