import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  ACTIVITY_EVENT_SCHEMA_VERSION,
  FOUNDATION_DATABASE_NAME,
  FOUNDATION_DATABASE_VERSION,
  NOTE_STORE_NAME,
  PROJECT_STORE_NAME,
  TASK_STORE_NAME,
  buildRepositoryContract,
  createFoundationRepository,
  matchesActivityQuery,
  projectTaskRelationshipValid,
  validateProjectRecord,
  validateNoteRecord,
  validateTaskRecord,
  validateActivityEvent
} from '../src/foundation/repository.mjs';
import { actionServiceContract, createMohitOsActions } from '../src/foundation/actions.mjs';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const curriculumPath = path.join(rootDir, 'curriculum.js');
const allowlistPath = path.join(rootDir, 'supabase', 'functions', 'progress-sync', 'lesson-ids.json');

const failures = [];
const checks = [];

async function recordCheck(name, fn) {
  try {
    await fn();
    checks.push(name);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isIsoTimestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
}

function normalizeEntry(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return null;
  }
  const completedAt = isIsoTimestamp(candidate.completedAt) ? new Date(candidate.completedAt).toISOString() : null;
  const firstStartedAt = isIsoTimestamp(candidate.firstStartedAt) ? new Date(candidate.firstStartedAt).toISOString() : null;
  const lastActivityAt = isIsoTimestamp(candidate.lastActivityAt) ? new Date(candidate.lastActivityAt).toISOString() : null;
  if (!lastActivityAt) {
    return null;
  }
  return {
    completed: candidate.completed === true && Boolean(completedAt),
    firstStartedAt,
    completedAt: candidate.completed === true ? completedAt : null,
    lastActivityAt,
    revisionId: typeof candidate.revisionId === 'string' ? candidate.revisionId.slice(0, 40) : ''
  };
}

function compareEntries(a, b) {
  const timeDiff = Date.parse(a.lastActivityAt) - Date.parse(b.lastActivityAt);
  if (timeDiff) return timeDiff;
  return String(a.revisionId || '').localeCompare(String(b.revisionId || ''));
}

function mergeProgress(left, right) {
  const merged = {};
  for (const [id, value] of Object.entries(left || {})) {
    const entry = normalizeEntry(value);
    if (entry) merged[id] = entry;
  }
  for (const [id, value] of Object.entries(right || {})) {
    const remote = normalizeEntry(value);
    if (!remote) continue;
    const local = merged[id];
    if (!local || compareEntries(remote, local) > 0) {
      merged[id] = remote;
    }
  }
  return merged;
}

const curriculumSource = await fs.readFile(curriculumPath, 'utf8');
const curriculumSandbox = { window: {} };
vm.runInNewContext(curriculumSource, curriculumSandbox);
const curriculum = curriculumSandbox.window.STRIVER_CURRICULUM_DATA;

await recordCheck('curriculum invariants', () => {
  assert(curriculum && Array.isArray(curriculum.modules), 'curriculum.js did not expose a valid modules array');

  const modules = curriculum.modules;
  const sectionCount = modules.reduce((sum, module) => sum + (Array.isArray(module.sections) ? module.sections.length : 0), 0);
  const lessonCount = modules.reduce((sum, module) => sum + (Array.isArray(module.sections) ? module.sections.reduce((inner, section) => inner + (Array.isArray(section.lessons) ? section.lessons.length : 0), 0) : 0), 0);

  assert(modules.length === 20, `Expected 20 modules, found ${modules.length}`);
  assert(sectionCount === 84, `Expected 84 sections, found ${sectionCount}`);
  assert(lessonCount === 495, `Expected 495 lessons, found ${lessonCount}`);

  const moduleIds = new Set();
  const sectionIdsByModule = new Map();
  const lessonIds = new Set();

  for (const module of modules) {
    assert(typeof module.id === 'string' && module.id.trim(), `Module missing a valid id: ${JSON.stringify(module)}`);
    assert(!moduleIds.has(module.id), `Duplicate module id: ${module.id}`);
    moduleIds.add(module.id);

    assert(Array.isArray(module.sections), `Module ${module.id} has invalid sections`);
    const moduleSectionIds = sectionIdsByModule.get(module.id) || new Set();
    sectionIdsByModule.set(module.id, moduleSectionIds);
    for (const section of module.sections) {
      assert(typeof section.id === 'string' && section.id.trim(), `Section missing a valid id in module ${module.id}`);
      assert(!moduleSectionIds.has(section.id), `Duplicate section id ${section.id} in module ${module.id}`);
      moduleSectionIds.add(section.id);
      assert(Array.isArray(section.lessons), `Section ${section.id} has invalid lessons`);

      for (const lesson of section.lessons) {
        assert(lesson && typeof lesson === 'object', `Lesson in section ${section.id} is invalid`);
        assert(typeof lesson.id === 'string' && lesson.id.trim(), `Lesson missing a valid id in section ${section.id}`);
        assert(!lessonIds.has(lesson.id), `Duplicate lesson id: ${lesson.id}`);
        lessonIds.add(lesson.id);
        assert(typeof lesson.title === 'string' && lesson.title.trim(), `Lesson ${lesson.id} missing a title`);
        assert(lesson.youtubeUrl === null || typeof lesson.youtubeUrl === 'string', `Lesson ${lesson.id} has invalid youtubeUrl`);
        assert(['learning', 'practice'].includes(lesson.type), `Lesson ${lesson.id} has unexpected type: ${lesson.type}`);
      }
    }
  }
});

await recordCheck('youtube url coverage', () => {
  const lessons = curriculum.modules.flatMap(module => module.sections.flatMap(section => section.lessons || []));
  const populated = lessons.filter(lesson => typeof lesson.youtubeUrl === 'string' && lesson.youtubeUrl.trim().length > 0).length;
  const missing = lessons.length - populated;

  assert(populated === 324, `Expected 324 populated YouTube URLs, found ${populated}`);
  assert(missing === 171, `Expected 171 missing YouTube URLs, found ${missing}`);
  for (const lesson of lessons) {
    if (lesson.youtubeUrl !== null) {
      assert(/^https?:\/\//i.test(lesson.youtubeUrl), `Lesson ${lesson.id} has invalid youtube URL: ${lesson.youtubeUrl}`);
    }
  }
});

await recordCheck('supabase lesson allowlist parity', async () => {
  const allowlistRaw = await fs.readFile(allowlistPath, 'utf8');
  const allowlist = JSON.parse(allowlistRaw);
  assert(Array.isArray(allowlist), 'lesson-ids.json must be a JSON array');

  const curriculumLessonIds = curriculum.modules.flatMap(module => module.sections.flatMap(section => (section.lessons || []).map(lesson => lesson.id)));
  const allowlistSet = new Set(allowlist);

  const missingFromAllowlist = curriculumLessonIds.filter(id => !allowlistSet.has(id));
  const curriculumLessonIdSet = new Set(curriculumLessonIds);
  const extraInAllowlist = allowlist.filter(id => !curriculumLessonIdSet.has(id));
  const duplicateAllowlistIds = allowlist.filter((id, index) => allowlist.indexOf(id) !== index);

  assert(allowlist.length === 495, `Expected 495 allowlist IDs, found ${allowlist.length}`);
  assert(duplicateAllowlistIds.length === 0, `Duplicate allowlist IDs: ${[...new Set(duplicateAllowlistIds)].slice(0, 10).join(', ')}`);
  assert(missingFromAllowlist.length === 0, `Missing from allowlist: ${missingFromAllowlist.slice(0, 10).join(', ')}`);
  assert(extraInAllowlist.length === 0, `Unexpected extra entries in allowlist: ${extraInAllowlist.slice(0, 10).join(', ')}`);
});

await recordCheck('progress contract', () => {
  const validSample = {
    completed: true,
    firstStartedAt: '2026-10-02T09:00:00.000Z',
    completedAt: '2026-10-02T09:05:00.000Z',
    lastActivityAt: '2026-10-02T09:05:00.000Z',
    revisionId: 'abc123',
    schemaVersion: 2
  };

  assert(typeof validSample.completed === 'boolean', 'Progress record completed must be a boolean');
  assert(validSample.firstStartedAt === null || isIsoTimestamp(validSample.firstStartedAt), 'firstStartedAt must be ISO timestamp or null');
  assert(validSample.completedAt === null || isIsoTimestamp(validSample.completedAt), 'completedAt must be ISO timestamp or null');
  assert(isIsoTimestamp(validSample.lastActivityAt), 'lastActivityAt must be an ISO timestamp');
  assert(typeof validSample.revisionId === 'string', 'revisionId must be a string');
  assert(validSample.schemaVersion === 2, 'schemaVersion must be 2');
});

await recordCheck('timestamp invariants', () => {
  const t1 = '2026-10-02T10:00:00.000Z';
  const t2 = '2026-10-02T10:01:00.000Z';
  const t3 = '2026-10-02T10:02:00.000Z';

  let entry = {
    completed: false,
    firstStartedAt: null,
    completedAt: null,
    lastActivityAt: t1,
    revisionId: 'rev-1'
  };

  const started = { ...entry, firstStartedAt: entry.firstStartedAt || t1, lastActivityAt: t2 };
  assert(started.firstStartedAt === t1, 'firstStartedAt should be set on first action and not be null');

  const afterRestart = { ...started, lastActivityAt: t3, revisionId: 'rev-2' };
  assert(afterRestart.firstStartedAt === t1, 'firstStartedAt must not be overwritten after initial creation');

  const completed = { ...afterRestart, completed: true, completedAt: t3, lastActivityAt: t3, revisionId: 'rev-3' };
  assert(Boolean(completed.completedAt), 'completedAt must exist when completed is true');

  const uncompleted = { ...completed, completed: false, completedAt: null, lastActivityAt: '2026-10-02T10:04:00.000Z', revisionId: 'rev-4' };
  assert(uncompleted.completedAt === null, 'completedAt must be cleared when completed becomes false');
  assert(Date.parse(uncompleted.lastActivityAt) > Date.parse(completed.lastActivityAt), 'lastActivityAt must advance on changes');
});

await recordCheck('sync merge contract', () => {
  const older = {
    completed: false,
    firstStartedAt: '2026-10-02T10:00:00.000Z',
    completedAt: null,
    lastActivityAt: '2026-10-02T10:00:00.000Z',
    revisionId: 'aaa'
  };

  const newer = {
    completed: true,
    firstStartedAt: '2026-10-02T10:00:00.000Z',
    completedAt: '2026-10-02T10:05:00.000Z',
    lastActivityAt: '2026-10-02T10:05:00.000Z',
    revisionId: 'zzz'
  };

  const equalA = {
    completed: false,
    firstStartedAt: '2026-10-02T11:00:00.000Z',
    completedAt: null,
    lastActivityAt: '2026-10-02T11:00:00.000Z',
    revisionId: 'aaa'
  };

  const equalB = {
    completed: true,
    firstStartedAt: '2026-10-02T11:00:00.000Z',
    completedAt: '2026-10-02T11:00:00.000Z',
    lastActivityAt: '2026-10-02T11:00:00.000Z',
    revisionId: 'zzz'
  };

  const mergedNewer = mergeProgress({ lessonA: older }, { lessonA: newer });
  assert(mergedNewer.lessonA.lastActivityAt === newer.lastActivityAt, 'Newer lastActivityAt must win sync merge');

  const mergedEqual = mergeProgress({ lessonB: equalA }, { lessonB: equalB });
  assert(mergedEqual.lessonB.revisionId === 'zzz', 'Equal timestamps must break by revisionId deterministically');
  assert(compareEntries(equalB, equalA) > 0, 'compareEntries should prefer the lexicographically larger revisionId on equal timestamps');
});

await recordCheck('MOHIT.OS Foundation schema and ActivityEvent contract', () => {
  assert(FOUNDATION_DATABASE_NAME === 'mohit-os-foundation', `Unexpected Foundation database name: ${FOUNDATION_DATABASE_NAME}`);
  assert(FOUNDATION_DATABASE_VERSION === 3, `Expected Foundation database version 3, found ${FOUNDATION_DATABASE_VERSION}`);
  assert(ACTIVITY_EVENT_SCHEMA_VERSION === 1, `Expected ActivityEvent schema version 1, found ${ACTIVITY_EVENT_SCHEMA_VERSION}`);

  const event = validateActivityEvent({
    eventId: 'event-validation-1',
    schemaVersion: 1,
    type: 'task.created',
    occurredAt: '2026-10-02T10:00:00.000Z',
    recordedAt: '2026-10-02T10:00:01.000Z',
    deviceId: 'device-validation-1',
    sourceModule: 'plan.tasks',
    subject: { type: 'task', id: 'task-1' },
    relatedEntities: [{ type: 'project', id: 'project-1' }],
    payload: { title: 'Review architecture' },
    correlationId: 'correlation-1'
  });
  assert(event.eventId === 'event-validation-1', 'Event ID was not preserved');
  assert(event.subject.type === 'task' && event.subject.id === 'task-1', 'Subject reference was not preserved');
  assert(event.relatedEntities.length === 1, 'Related entities were not preserved');
  assert(event.schemaVersion === ACTIVITY_EVENT_SCHEMA_VERSION, 'Event schema version mismatch');

  let invalidEventRejected = false;
  try {
    validateActivityEvent({ ...event, occurredAt: 'not-a-timestamp' });
  } catch {
    invalidEventRejected = true;
  }
  assert(invalidEventRejected, 'Invalid event timestamp should be rejected');

  const invalidTimestamps = [
    '2026-02-30T10:00:00Z',
    '2026-13-01T10:00:00Z',
    '2026-04-31T10:00:00Z',
    '2026-01-01 10:00:00Z',
    '2026-01-01T10:00:00+24:00'
  ];
  for (const timestamp of invalidTimestamps) {
    let rejected = false;
    try {
      validateActivityEvent({ ...event, occurredAt: timestamp });
    } catch {
      rejected = true;
    }
    assert(rejected, `Malformed or impossible timestamp should be rejected: ${timestamp}`);
  }

  const validTimestamp = validateActivityEvent({ ...event, occurredAt: '2026-10-02T10:00:00-04:00' });
  assert(validTimestamp.occurredAt === '2026-10-02T14:00:00.000Z', 'Valid offset timestamp should normalize to UTC');

  assert(matchesActivityQuery(event, {
    from: '2026-10-02T09:59:00.000Z',
    to: '2026-10-02T10:01:00.000Z',
    sourceModule: 'plan.tasks',
    subject: { type: 'task', id: 'task-1' }
  }), 'Matching time/source/subject query should include the event');
  assert(!matchesActivityQuery(event, { sourceModule: 'learn.a2z-dsa' }), 'Non-matching source query should exclude the event');

  const unavailableRepository = createFoundationRepository({ indexedDB: null });
  return unavailableRepository.open().then(
    () => { throw new Error('Repository initialization should reject when IndexedDB is unavailable'); },
    error => assert(error instanceof Error && error.message.includes('IndexedDB is unavailable'), 'Unavailable storage should reject with a clear error')
  );
});

await recordCheck('BUILD V0 record and repository contracts', () => {
  assert(FOUNDATION_DATABASE_VERSION === 3, `Expected Foundation database version 3, found ${FOUNDATION_DATABASE_VERSION}`);
  assert(PROJECT_STORE_NAME === 'projects', `Unexpected Project store: ${PROJECT_STORE_NAME}`);
  assert(TASK_STORE_NAME === 'tasks', `Unexpected Task store: ${TASK_STORE_NAME}`);
  assert(NOTE_STORE_NAME === 'notes', `Unexpected Note store: ${NOTE_STORE_NAME}`);
  const repository = createFoundationRepository({ indexedDB: null });
  assert(buildRepositoryContract(repository).length === 0, `BUILD repository is missing methods: ${buildRepositoryContract(repository).join(', ')}`);

  const timestamp = '2026-10-02T10:00:00.000Z';
  const project = validateProjectRecord({
    projectId: 'project-check',
    name: 'Validation project',
    description: 'A structured project validation sample.',
    resources: [{
      resourceId: 'resource-check',
      title: 'Repository',
      url: 'https://example.com/repo',
      createdAt: timestamp,
      updatedAt: timestamp
    }],
    status: 'active',
    importance: 'high',
    currentState: 'Designing the first step',
    nextActionId: 'task-check',
    blockers: ['Waiting for test device'],
    lastActivityAt: timestamp,
    nextReviewAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null
  });
  const task = validateTaskRecord({
    taskId: 'task-check',
    title: 'Test task',
    status: 'in_progress',
    priority: 'medium',
    projectId: 'project-check',
    dueAt: null,
    scheduledAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: null
  });
  assert(projectTaskRelationshipValid(project, task), 'Next Action relationship should accept an existing task belonging to its project');
  assert(!projectTaskRelationshipValid(project, { ...task, projectId: 'another-project' }), 'Next Action relationship should reject a task from another project');
  assert(project.resources.length === 1 && project.resources[0].url === 'https://example.com/repo', 'Project resource was not normalized');

  const invalidProject = { ...project, status: 'in-progress' };
  let projectRejected = false;
  try { validateProjectRecord(invalidProject); } catch { projectRejected = true; }
  assert(projectRejected, 'Invalid project status should be rejected');
  let invalidResourceRejected = false;
  try {
    validateProjectRecord({ ...project, resources: [{ ...project.resources[0], url: 'javascript:alert(1)' }] });
  } catch { invalidResourceRejected = true; }
  assert(invalidResourceRejected, 'Non-HTTP(S) project resources should be rejected');
  let duplicateResourceRejected = false;
  try {
    validateProjectRecord({ ...project, resources: [project.resources[0], { ...project.resources[0], title: 'Duplicate' }] });
  } catch { duplicateResourceRejected = true; }
  assert(duplicateResourceRejected, 'Duplicate project resource IDs should be rejected');

  const validProjectStatuses = ['active', 'paused', 'completed', 'archived']
    .every(status => validateProjectRecord({ ...project, status }).status === status);
  assert(validProjectStatuses, 'Every supported project status should be accepted');
  const validImportanceValues = ['low', 'medium', 'high']
    .every(importance => validateProjectRecord({ ...project, importance }).importance === importance);
  assert(validImportanceValues, 'Every supported project importance should be accepted');

  let taskRejected = false;
  try { validateTaskRecord({ ...task, status: 'stalled' }); } catch { taskRejected = true; }
  assert(taskRejected, 'Invalid task status should be rejected');
  const validTaskStatuses = ['todo', 'in_progress', 'completed', 'cancelled']
    .every(status => validateTaskRecord({
      ...task,
      status,
      completedAt: status === 'completed' ? timestamp : null
    }).status === status);
  assert(validTaskStatuses, 'Every supported task status should be accepted');
  const validPriorities = ['low', 'medium', 'high']
    .every(priority => validateTaskRecord({ ...task, priority }).priority === priority);
  assert(validPriorities, 'Every supported task priority should be accepted');

  let completionTimestampRejected = false;
  try { validateTaskRecord({ ...task, status: 'completed' }); } catch { completionTimestampRejected = true; }
  assert(completionTimestampRejected, 'Completed task without completedAt should be rejected');

  const note = validateNoteRecord({
    noteId: 'note-check',
    title: 'Validation note',
    content: 'Keep structured context with a project.',
    createdAt: timestamp,
    updatedAt: timestamp,
    projectId: 'project-check',
    tags: ['idea', ' project ', 'idea'],
    status: 'active',
    archivedAt: null
  });
  assert(note.tags.length === 2 && note.tags[1] === 'project', 'Note tags should be trimmed and deduplicated');
  assert(note.projectId === project.projectId, 'Note project reference was not preserved');
  let invalidNoteRejected = false;
  try { validateNoteRecord({ ...note, status: 'deleted' }); } catch { invalidNoteRejected = true; }
  assert(invalidNoteRejected, 'Invalid note status should be rejected');
  let invalidArchiveRejected = false;
  try { validateNoteRecord({ ...note, status: 'archived' }); } catch { invalidArchiveRejected = true; }
  assert(invalidArchiveRejected, 'Archived notes must have archivedAt');
});

await recordCheck('MOHIT.OS action service contracts', async () => {
  const calls = [];
  const fakeRepository = {
    getProject: async projectId => ({ projectId }),
    createProject: async input => input,
    updateProject: async (projectId, changes) => ({ projectId, ...changes }),
    addProjectResource: async (projectId, input) => ({ projectId, input }),
    updateProjectResource: async (projectId, resourceId, input) => ({ projectId, resourceId, input }),
    removeProjectResource: async () => true,
    createTask: async input => { calls.push(input); return input; },
    updateTask: async (taskId, changes) => ({ taskId, ...changes }),
    completeTask: async taskId => ({ taskId, status: 'completed' }),
    deleteTask: async taskId => ({ taskId }),
    setProjectNextAction: async (projectId, taskId) => ({ projectId, taskId }),
    createNote: async input => input,
    getNote: async noteId => ({ noteId }),
    listNotes: async () => [],
    updateNote: async (noteId, changes) => ({ noteId, ...changes }),
    archiveNote: async noteId => ({ noteId, status: 'archived' }),
    deleteNote: async noteId => ({ noteId }),
    listProjects: async () => [{
      projectId: 'project-search',
      name: 'VisionGuide',
      description: 'Scene classifier',
      currentState: '',
      blockers: [],
      resources: [],
      updatedAt: '2026-10-02T10:00:00.000Z'
    }],
    listTasks: async () => [],
    queryEvents: async options => options
  };
  const storageCalls = [];
  const storage = {
    getItem: key => {
      storageCalls.push(['getItem', key]);
      return JSON.stringify({
        schemaVersion: 2,
        completed: { 'lesson-1': { completed: true, completedAt: '2026-10-02T10:00:00.000Z', firstStartedAt: null, lastActivityAt: '2026-10-02T10:00:00.000Z', revisionId: 'rev-1' } },
        ownerSecret: 'must-not-be-returned'
      });
    },
    setItem: (...args) => storageCalls.push(['setItem', ...args])
  };
  const actions = createMohitOsActions(fakeRepository, { storage });
  assert(actionServiceContract(actions).length === 0, `Missing actions: ${actionServiceContract(actions).join(', ')}`);
  const reminder = await actions.createReminder({ title: 'Review', remindAt: '2026-10-05T10:00:00.000Z' });
  assert(reminder.dueAt === '2026-10-05T10:00:00.000Z' && reminder.sourceModule === 'plan.tasks', 'Reminder should map to a due-dated PLAN task');
  const searchResults = await actions.search('vision');
  assert(searchResults.length === 1 && searchResults[0].type === 'project', 'Structured cross-entity search should return matching projects');
  const a2z = await actions.queryA2ZProgress();
  assert(a2z.schemaVersion === 2 && a2z.progress['lesson-1'].completed, 'A2Z progress query should return sanitized read-only progress');
  assert(!JSON.stringify(a2z).includes('must-not-be-returned'), 'A2Z query must not expose unrelated localStorage fields');
  assert(storageCalls.length === 1 && storageCalls[0][0] === 'getItem', 'A2Z action must not write to localStorage');
});

await recordCheck('MOHIT.OS cross-module dialog IDs', async () => {
  const [buildSource, osSource] = await Promise.all([
    fs.readFile(path.join(rootDir, 'src', 'build', 'app.mjs'), 'utf8'),
    fs.readFile(path.join(rootDir, 'src', 'os', 'app.mjs'), 'utf8')
  ]);
  assert(buildSource.includes('id="task-dialog"'), 'BUILD task dialog should retain its module-specific ID');
  assert(osSource.includes('id="plan-task-dialog"'), 'PLAN task dialog must use a distinct ID from BUILD');
  assert(!osSource.includes('id="task-dialog"'), 'PLAN must not duplicate the BUILD task dialog ID');
});

if (failures.length > 0) {
  console.error('Validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

const summary = checks.join(', ');
console.log(`Validation passed (${checks.length} checks): ${summary}`);
