# MOHIT.OS — Product Vision

## 1. What is MOHIT.OS?

MOHIT.OS is Mohit's personal digital operating space.

It is intended to become a single place to manage:
- Learning
- Projects
- Ideas and thoughts
- Tasks and plans
- Progress and consistency
- Activity and history
- Personal accountability
- AI-assisted guidance

The long-term goal is not to create disconnected productivity tools. MOHIT.OS should understand the relationship between what Mohit is learning, building, planning, thinking about, and actually doing.

## 2. Brand

**MOHIT.OS**

**Learn · Build · Think**

Current hierarchy:

`MOHIT.OS → LEARN → A2Z DSA`

`MOHIT.OS → BUILD → Projects (V0)`

LEARN contains the existing A2Z tracker. BUILD V0 provides local-only project/task tracking and activity history. THINK and the remaining areas are future areas and must remain inactive until implemented.

## 3. CURRENT STATE

The current active application is:

**LEARN → A2Z DSA**

It is an existing A2Z DSA tracker with curriculum tracking, lesson completion, progress statistics, local-first storage, Supabase cloud synchronization, device pairing, offline support, and PWA support.

The existing A2Z DSA functionality must continue working while MOHIT.OS expands.

Do not rebuild the A2Z tracker from scratch or replace working architecture without a specific reason.

The MOHIT.OS Foundation is a separate local IndexedDB repository. BUILD V0 uses it for Projects, Tasks, and project ActivityEvents; A2Z progress has not been migrated or connected to it.

## 4. Product Direction

### LEARN
Learning management:
- A2Z DSA
- Courses
- Learning roadmaps
- Study progress
- Learning goals
- Consistency
- Future learning resources

A2Z DSA is the first implementation.

### BUILD
Project development tracking:
- Project name
- Status
- Current state
- Importance
- Last activity
- Next action
- Blockers
- Stuck points
- Next review date
- Project history

The purpose is to prevent projects from being forgotten after a presentation or milestone.

### THINK
A place for:
- Notes
- Ideas
- Thoughts
- Decisions
- Reflections
- Quick captures

### PLAN
A future planning system for:
- Tasks
- Priorities
- Deadlines
- Calendar
- Future plans
- Scheduled work
- Reminders

### TRACK
A future consistency and progress system:
- Daily checkpoints
- Habits
- Consistency
- Learning activity
- Project activity
- Goals
- Progress trends

### DASHBOARD
The future central dashboard should answer:

> **What should I do right now?**

It should eventually combine PLAN, BUILD, LEARN, TRACK, ACTIVITY, deadlines, and reminders.

### REMINDERS
Reminders should eventually become context-aware.

Instead of only saying:
> "Work on VisionGuide."

They should explain why something matters using relevant project and activity context.

### ACTIVITY
ACTIVITY is an important future foundation. It should record what was worked on, when it happened, and where the user stopped.

It should eventually provide historical context for both the dashboard and AI.

## 5. Accountability System

MOHIT.OS should eventually provide supportive accountability.

The intended loop is:

`Work → Stop → Capture current state → Detect inactivity → Reminder → Follow-up → Ask why → Snooze/reschedule → Resume → Update state`

A project should conceptually contain:

`Project → Current state → Next action → Importance → Last activity → Next review date`

When inactivity is detected, the system should not assume the reason. It should ask.

Possible escalation:
1. Gentle reminder
2. Follow-up
3. Important reminder with project/deadline context
4. Direct interaction asking why the work has not continued

## 6. Snooze and Rescheduling

The user should eventually be able to tell MOHIT.OS:

> "I'm busy with exams until October 8. Don't remind me about this until then."

MOHIT.OS should record an appropriate snooze/reschedule state and resume reminders after the specified date with useful context.

The user remains in control of reminders.

## 7. Notification Channels

Future notification infrastructure may support:
- Laptop notifications
- Phone notifications
- Web push
- In-app notifications
- Voice interaction
- Optional phone-call escalation

Phone calls should be an optional high-priority escalation, not the default reminder method.

The system should avoid becoming annoying or constantly interrupting the user.

## 8. Future AI

AI is a major long-term part of MOHIT.OS.

AI should not simply be a chatbot. It should eventually understand structured MOHIT.OS information across:
- Tasks
- Projects
- Learning
- Notes
- Activity
- Deadlines
- Plans
- Progress
- Reminders

Potential questions:
- "What am I currently working on?"
- "Where am I stuck?"
- "What did I work on yesterday?"
- "Why am I falling behind on DSA?"
- "What should I do today?"
- "What project have I neglected recently?"

The AI should eventually behave more like a mentor, friend, teacher, and accountability partner.

## 9. Future Voice AI

A later stage may introduce:
- Voice notes
- Voice task creation
- Voice project updates
- Voice reminder changes
- Speech-to-text
- Text-to-speech
- Voice conversations

Voice should operate on the same structured data as the normal application.

## 10. Long-Term Architecture Direction

Conceptually:

```text
MOHIT.OS
├── LEARN
│   └── A2Z DSA
├── BUILD
├── THINK
├── PLAN
├── TRACK
├── DASHBOARD
├── REMINDERS
├── ACTIVITY
└── AI
```

These areas should be developed incrementally. Do not build all of them at once.

## 11. Development Roadmap

### V1 — Foundation
Potential areas:
- Dashboard foundation
- Profile/settings
- Local + cloud data architecture
- Identity/device architecture
- Notification infrastructure
- Global search foundation
- Activity/history foundation

Existing A2Z DSA functionality remains active.

### V2 — PLAN
- Tasks
- Priorities
- Calendar
- Deadlines
- Future plans
- Reminders

### V3 — BUILD
Initial local-only BUILD V0 implemented: project/task tracking and project history. Further BUILD work should remain incremental.
- Projects
- Project status
- Current work
- Blockers
- Stuck points
- Next action
- Project history
- Review dates

### V4 — LEARN
Expand the existing learning area with:
- A2Z DSA
- Other roadmaps
- Courses
- Learning goals
- Consistency
- Learning analytics

### V5 — THINK
- Notes
- Ideas
- Thoughts
- Decisions
- Quick capture
- Personal knowledge

### V6 — Intelligence
Introduce AI across structured MOHIT.OS data.

### V7 — Voice AI
Introduce voice capture, voice commands, voice conversations, text-to-speech, speech-to-text, and voice-based accountability.

## 12. Core Product Principles

### Preserve What Already Works
Existing A2Z DSA functionality must not be broken while expanding MOHIT.OS.

### Build Incrementally
Do not attempt to build the entire operating system at once.

### User Control
The user controls reminders, snoozes, priorities, notifications, project states, and personal data. AI assists rather than takes control.

### Supportive Accountability
Accountability should help the user continue important work without becoming spam or constant interruption.

### Context Over Generic Notifications
Whenever possible, reminders should contain useful context.

### Never Assume
When inactivity is detected, do not automatically assume laziness, failure, or lack of interest. Ask the user.

### Structured Data First
Important information should eventually exist as structured data rather than only inside AI conversations.

Examples:
- `Project → state → next action → review date`
- `Task → priority → deadline → status`
- `Lesson → completion → activity`
- `Activity → timestamp → object → action`
- `Reminder → trigger → escalation → status`

## 13. What Future Agents Should Understand

MOHIT.OS is a long-term personal system.

The current A2Z tracker is the beginning, not the final product.

Before implementing a new feature:
1. Read `AGENT_CONTEXT.md`.
2. Read this file.
3. Inspect the actual code.
4. Understand existing data and architecture.
5. Identify compatibility requirements.
6. Implement the smallest useful step.
7. Test it.
8. Avoid unnecessary rewrites.

Do not activate future modules merely because they are described here.

A feature becomes part of MOHIT.OS only when it is intentionally implemented and tested.

## 14. Current Priority

**CURRENT:**

`MOHIT.OS → LEARN → A2Z DSA`

The immediate priority is to continue improving MOHIT.OS without abandoning DSA.

Future expansion should happen gradually.

The long-term objective is:

> **One personal system that knows what Mohit is learning, building, planning, thinking about, and actually doing — and helps him decide what to do next.**
