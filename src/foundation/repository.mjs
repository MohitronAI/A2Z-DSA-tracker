export const FOUNDATION_DATABASE_NAME = 'mohit-os-foundation';
export const FOUNDATION_DATABASE_VERSION = 2;
export const ACTIVITY_STORE_NAME = 'activityEvents';
export const ACTIVITY_EVENT_SCHEMA_VERSION = 1;
export const PROJECT_STORE_NAME = 'projects';
export const TASK_STORE_NAME = 'tasks';
export const FOUNDATION_META_STORE_NAME = 'foundationMeta';

const STORE_NAME = ACTIVITY_STORE_NAME;
const MAX_QUERY_LIMIT = 1000;
const PROJECT_STATUSES = new Set(['active', 'paused', 'completed', 'archived']);
const IMPORTANCE_VALUES = new Set(['low', 'medium', 'high']);
const TASK_STATUSES = new Set(['todo', 'in_progress', 'completed', 'cancelled']);
const TASK_PRIORITIES = IMPORTANCE_VALUES;
const BUILD_SOURCE_MODULE = 'build.projects';
const DEVICE_ID_KEY = 'deviceId';

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string') return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/);
  if (!match) return false;

  const [, year, month, day, hour, minute, second, , timezone] = match;
  const date = new Date(0);
  date.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
  date.setUTCHours(Number(hour), Number(minute), Number(second), 0);
  if (date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)
    || Number(hour) > 23
    || Number(minute) > 59
    || Number(second) > 59) return false;

  if (timezone !== 'Z') {
    const offsetHour = Number(timezone.slice(1, 3));
    const offsetMinute = Number(timezone.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) return false;
  }
  return Number.isFinite(Date.parse(value));
}

function nullableTimestamp(value, fieldName) {
  return value === null ? null : normalizeTimestamp(value, fieldName);
}

export function validateProjectRecord(project) {
  if (!isPlainObject(project)) throw new TypeError('Project must be a plain object.');
  if (!PROJECT_STATUSES.has(project.status)) throw new TypeError(`Project status is invalid: ${project.status}`);
  if (!IMPORTANCE_VALUES.has(project.importance)) throw new TypeError(`Project importance is invalid: ${project.importance}`);
  if (!Array.isArray(project.blockers) || project.blockers.some(blocker => typeof blocker !== 'string' || !blocker.trim())) {
    throw new TypeError('Project blockers must be an array of non-empty strings.');
  }
  if (typeof project.currentState !== 'string') throw new TypeError('Project currentState must be a string.');
  if (project.nextActionId !== null && (typeof project.nextActionId !== 'string' || !project.nextActionId.trim())) {
    throw new TypeError('Project nextActionId must be a non-empty string or null.');
  }
  const normalized = {
    projectId: requireNonEmptyString(project.projectId, 'projectId'),
    name: requireNonEmptyString(project.name, 'name'),
    status: project.status,
    importance: project.importance,
    currentState: project.currentState,
    nextActionId: project.nextActionId,
    blockers: project.blockers.map(blocker => blocker.trim()),
    lastActivityAt: normalizeTimestamp(project.lastActivityAt, 'lastActivityAt'),
    nextReviewAt: nullableTimestamp(project.nextReviewAt, 'nextReviewAt'),
    createdAt: normalizeTimestamp(project.createdAt, 'createdAt'),
    updatedAt: normalizeTimestamp(project.updatedAt, 'updatedAt'),
    archivedAt: nullableTimestamp(project.archivedAt, 'archivedAt')
  };
  return JSON.parse(JSON.stringify(normalized));
}

export function validateTaskRecord(task) {
  if (!isPlainObject(task)) throw new TypeError('Task must be a plain object.');
  if (!TASK_STATUSES.has(task.status)) throw new TypeError(`Task status is invalid: ${task.status}`);
  if (!TASK_PRIORITIES.has(task.priority)) throw new TypeError(`Task priority is invalid: ${task.priority}`);
  if (task.projectId !== null && (typeof task.projectId !== 'string' || !task.projectId.trim())) {
    throw new TypeError('Task projectId must be a non-empty string or null.');
  }
  const normalized = {
    taskId: requireNonEmptyString(task.taskId, 'taskId'),
    title: requireNonEmptyString(task.title, 'title'),
    status: task.status,
    priority: task.priority,
    projectId: task.projectId,
    dueAt: nullableTimestamp(task.dueAt, 'dueAt'),
    scheduledAt: nullableTimestamp(task.scheduledAt, 'scheduledAt'),
    createdAt: normalizeTimestamp(task.createdAt, 'createdAt'),
    updatedAt: normalizeTimestamp(task.updatedAt, 'updatedAt'),
    completedAt: nullableTimestamp(task.completedAt, 'completedAt')
  };
  if ((normalized.status === 'completed') !== Boolean(normalized.completedAt)) {
    throw new TypeError('Task completedAt must exist exactly when status is completed.');
  }
  return JSON.parse(JSON.stringify(normalized));
}

export function projectTaskRelationshipValid(project, task) {
  return Boolean(project && task && project.nextActionId === task.taskId && task.projectId === project.projectId);
}

export function buildRepositoryContract(repository) {
  const requiredMethods = [
    'createProject', 'getProject', 'listProjects', 'updateProject', 'archiveProject',
    'createTask', 'getTask', 'listTasks', 'updateTask', 'completeTask',
    'setProjectNextAction', 'queryProjectActivity'
  ];
  return requiredMethods.filter(method => typeof repository?.[method] !== 'function');
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`ActivityEvent ${fieldName} must be a non-empty string.`);
  }
  return value;
}

function validateEntityReference(value, fieldName) {
  if (!isPlainObject(value)) {
    throw new TypeError(`ActivityEvent ${fieldName} must be an object with type and id.`);
  }
  return {
    type: requireNonEmptyString(value.type, `${fieldName}.type`),
    id: requireNonEmptyString(value.id, `${fieldName}.id`)
  };
}

function normalizeTimestamp(value, fieldName) {
  if (!isIsoTimestamp(value)) {
    throw new TypeError(`ActivityEvent ${fieldName} must be a valid ISO timestamp.`);
  }
  return new Date(value).toISOString();
}

export function validateActivityEvent(event) {
  if (!isPlainObject(event)) {
    throw new TypeError('ActivityEvent must be a plain object.');
  }
  if (event.schemaVersion !== ACTIVITY_EVENT_SCHEMA_VERSION) {
    throw new TypeError(`ActivityEvent schemaVersion must be ${ACTIVITY_EVENT_SCHEMA_VERSION}.`);
  }
  if (!Array.isArray(event.relatedEntities)) {
    throw new TypeError('ActivityEvent relatedEntities must be an array.');
  }
  if (!isPlainObject(event.payload)) {
    throw new TypeError('ActivityEvent payload must be a plain object.');
  }
  if (event.correlationId !== undefined && (typeof event.correlationId !== 'string' || !event.correlationId.trim())) {
    throw new TypeError('ActivityEvent correlationId must be a non-empty string when provided.');
  }

  const normalized = {
    eventId: requireNonEmptyString(event.eventId, 'eventId'),
    schemaVersion: ACTIVITY_EVENT_SCHEMA_VERSION,
    type: requireNonEmptyString(event.type, 'type'),
    occurredAt: normalizeTimestamp(event.occurredAt, 'occurredAt'),
    recordedAt: normalizeTimestamp(event.recordedAt, 'recordedAt'),
    deviceId: requireNonEmptyString(event.deviceId, 'deviceId'),
    sourceModule: requireNonEmptyString(event.sourceModule, 'sourceModule'),
    subject: validateEntityReference(event.subject, 'subject'),
    relatedEntities: event.relatedEntities.map((entity, index) => validateEntityReference(entity, `relatedEntities[${index}]`)),
    payload: event.payload
  };
  if (event.correlationId !== undefined) normalized.correlationId = event.correlationId;

  try {
    return JSON.parse(JSON.stringify(normalized));
  } catch (error) {
    throw new TypeError(`ActivityEvent must contain JSON-serializable data: ${error.message}`);
  }
}

export function matchesActivityQuery(event, query = {}) {
  const from = query.from === undefined ? null : normalizeTimestamp(query.from, 'query.from');
  const to = query.to === undefined ? null : normalizeTimestamp(query.to, 'query.to');
  if (from && event.occurredAt < from) return false;
  if (to && event.occurredAt > to) return false;
  if (query.sourceModule !== undefined && event.sourceModule !== query.sourceModule) return false;
  if (query.subject !== undefined
    && (event.subject.type !== query.subject.type || event.subject.id !== query.subject.id)) return false;
  return true;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

function normalizeQuery(query = {}) {
  if (!isPlainObject(query)) throw new TypeError('ActivityEvent query must be an object.');
  const normalized = {};
  if (query.from !== undefined) normalized.from = normalizeTimestamp(query.from, 'query.from');
  if (query.to !== undefined) normalized.to = normalizeTimestamp(query.to, 'query.to');
  if (normalized.from && normalized.to && normalized.from > normalized.to) {
    throw new RangeError('ActivityEvent query from must not be later than to.');
  }
  if (query.sourceModule !== undefined) normalized.sourceModule = requireNonEmptyString(query.sourceModule, 'query.sourceModule');
  if (query.subject !== undefined) normalized.subject = validateEntityReference(query.subject, 'query.subject');
  const limit = query.limit === undefined ? 100 : query.limit;
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > MAX_QUERY_LIMIT) {
    throw new RangeError(`ActivityEvent query limit must be an integer from 0 to ${MAX_QUERY_LIMIT}.`);
  }
  normalized.limit = limit;
  return normalized;
}

function eventOrder(a, b) {
  if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? -1 : 1;
  if (a.recordedAt !== b.recordedAt) return a.recordedAt < b.recordedAt ? -1 : 1;
  if (a.eventId === b.eventId) return 0;
  return a.eventId < b.eventId ? -1 : 1;
}

export function createFoundationRepository({
  indexedDB = globalThis.indexedDB,
  keyRange = globalThis.IDBKeyRange,
  databaseName = FOUNDATION_DATABASE_NAME
} = {}) {
  let databasePromise;
  let database;

  function openDatabase() {
    if (database) return Promise.resolve(database);
    if (databasePromise) return databasePromise;
    if (!indexedDB) return Promise.reject(new Error('IndexedDB is unavailable in this browser.'));

    databasePromise = new Promise((resolve, reject) => {
      let settled = false;
      const request = indexedDB.open(databaseName, FOUNDATION_DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'eventId' });
          store.createIndex('byOccurredAt', 'occurredAt', { unique: false });
          store.createIndex('bySourceModule', 'sourceModule', { unique: false });
          store.createIndex('bySubject', ['subject.type', 'subject.id'], { unique: false });
        }
        if (!db.objectStoreNames.contains(PROJECT_STORE_NAME)) {
          const projects = db.createObjectStore(PROJECT_STORE_NAME, { keyPath: 'projectId' });
          projects.createIndex('byStatus', 'status', { unique: false });
          projects.createIndex('byUpdatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(TASK_STORE_NAME)) {
          const tasks = db.createObjectStore(TASK_STORE_NAME, { keyPath: 'taskId' });
          tasks.createIndex('byProjectId', 'projectId', { unique: false });
          tasks.createIndex('byStatus', 'status', { unique: false });
        }
        if (!db.objectStoreNames.contains(FOUNDATION_META_STORE_NAME)) {
          db.createObjectStore(FOUNDATION_META_STORE_NAME, { keyPath: 'key' });
        }
      };
      request.onblocked = () => {
        if (settled) return;
        settled = true;
        databasePromise = null;
        reject(new Error('MOHIT.OS Foundation database upgrade is blocked by another open tab.'));
      };
      request.onerror = () => {
        if (settled) return;
        settled = true;
        databasePromise = null;
        reject(request.error || new Error('Could not open the MOHIT.OS Foundation database.'));
      };
      request.onsuccess = () => {
        const opened = request.result;
        if (settled) {
          opened.close();
          return;
        }
        settled = true;
        database = opened;
        opened.onversionchange = () => {
          opened.close();
          database = null;
          databasePromise = null;
        };
        resolve(opened);
      };
    });
    return databasePromise;
  }

  async function getEvent(eventId) {
    requireNonEmptyString(eventId, 'eventId');
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    return requestResult(transaction.objectStore(STORE_NAME).get(eventId));
  }

  async function appendEvent(event) {
    const normalized = validateActivityEvent(event);
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      let duplicate = false;
      let settled = false;
      const request = transaction.objectStore(STORE_NAME).add(normalized);
      request.onerror = eventError => {
        if (request.error && request.error.name === 'ConstraintError') {
          duplicate = true;
          eventError.preventDefault();
          eventError.stopPropagation();
        }
      };
      transaction.oncomplete = async () => {
        if (settled) return;
        settled = true;
        if (!duplicate) {
          resolve({ inserted: true, event: normalized });
          return;
        }
        try {
          const existing = await getEvent(normalized.eventId);
          if (!existing) throw new Error(`Duplicate event ${normalized.eventId} was not found after the transaction.`);
          resolve({ inserted: false, event: existing });
        } catch (error) {
          reject(error);
        }
      };
      transaction.onabort = () => {
        if (settled) return;
        settled = true;
        reject(transaction.error || request.error || new Error('Could not append ActivityEvent.'));
      };
      transaction.onerror = () => {
        if (settled) return;
        settled = true;
        reject(transaction.error || request.error || new Error('Could not append ActivityEvent.'));
      };
    });
  }

  async function queryEvents(query = {}) {
    const options = normalizeQuery(query);
    if (options.limit === 0) return [];
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    let source = store;
    let range;

    if (options.from || options.to) {
      source = store.index('byOccurredAt');
      if (options.from && options.to) range = keyRange.bound(options.from, options.to);
      else if (options.from) range = keyRange.lowerBound(options.from);
      else range = keyRange.upperBound(options.to);
    } else if (options.sourceModule !== undefined) {
      source = store.index('bySourceModule');
      range = keyRange.only(options.sourceModule);
    } else if (options.subject !== undefined) {
      source = store.index('bySubject');
      range = keyRange.only([options.subject.type, options.subject.id]);
    }

    const events = await requestResult(source.getAll(range));
    return events
      .filter(event => matchesActivityQuery(event, options))
      .sort(eventOrder)
      .slice(0, options.limit);
  }

  function createActivityEvent(deviceId, type, subject, payload, relatedEntities = []) {
    const now = new Date().toISOString();
    return validateActivityEvent({
      eventId: makeId(),
      schemaVersion: ACTIVITY_EVENT_SCHEMA_VERSION,
      type,
      occurredAt: now,
      recordedAt: now,
      deviceId,
      sourceModule: BUILD_SOURCE_MODULE,
      subject,
      relatedEntities,
      payload
    });
  }

  async function getDeviceId() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(FOUNDATION_META_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(FOUNDATION_META_STORE_NAME);
      let deviceId;
      const request = store.get(DEVICE_ID_KEY);
      request.onsuccess = () => {
        deviceId = request.result?.value;
        if (typeof deviceId !== 'string' || !deviceId) {
          deviceId = makeId();
          store.put({ key: DEVICE_ID_KEY, value: deviceId });
        }
      };
      transaction.oncomplete = () => resolve(deviceId);
      transaction.onerror = () => reject(transaction.error || new Error('Could not initialize Foundation device identity.'));
      transaction.onabort = () => reject(transaction.error || new Error('Could not initialize Foundation device identity.'));
    });
  }

  async function createProject(input) {
    const now = new Date().toISOString();
    const projectId = requireNonEmptyString(input.projectId || makeId(), 'projectId');
    const project = validateProjectRecord({
      projectId,
      name: input.name,
      status: input.status || 'active',
      importance: input.importance || 'medium',
      currentState: input.currentState || '',
      nextActionId: null,
      blockers: input.blockers || [],
      lastActivityAt: now,
      nextReviewAt: input.nextReviewAt ?? null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null
    });
    const deviceId = await getDeviceId();
    const event = createActivityEvent(deviceId, 'project.created', { type: 'project', id: projectId }, { name: project.name });
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction([PROJECT_STORE_NAME, STORE_NAME], 'readwrite');
      transaction.objectStore(PROJECT_STORE_NAME).add(project);
      transaction.objectStore(STORE_NAME).add(event);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Could not create project.'));
      transaction.onabort = () => reject(transaction.error || new Error('Could not create project.'));
    });
    return project;
  }

  async function getProject(projectId) {
    requireNonEmptyString(projectId, 'projectId');
    const db = await openDatabase();
    return requestResult(db.transaction(PROJECT_STORE_NAME, 'readonly').objectStore(PROJECT_STORE_NAME).get(projectId));
  }

  async function listProjects({ includeArchived = false } = {}) {
    const db = await openDatabase();
    const projects = await requestResult(db.transaction(PROJECT_STORE_NAME, 'readonly').objectStore(PROJECT_STORE_NAME).getAll());
    return projects
      .filter(project => includeArchived || project.status !== 'archived')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
  }

  async function updateProject(projectId, changes) {
    requireNonEmptyString(projectId, 'projectId');
    if (!isPlainObject(changes)) throw new TypeError('Project changes must be an object.');
    const deviceId = await getDeviceId();
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([PROJECT_STORE_NAME, TASK_STORE_NAME, STORE_NAME], 'readwrite');
      const projects = transaction.objectStore(PROJECT_STORE_NAME);
      const tasks = transaction.objectStore(TASK_STORE_NAME);
      const activity = transaction.objectStore(STORE_NAME);
      let updated;
      let failure;
      const request = projects.get(projectId);
      request.onsuccess = () => {
        try {
          const current = request.result;
          if (!current) throw new Error(`Project not found: ${projectId}`);
          const merged = { ...current, ...changes, projectId };
          if (merged.status === 'archived' && current.status !== 'archived') merged.archivedAt = merged.updatedAt;
          if (merged.status !== 'archived') merged.archivedAt = null;
          if (merged.status === 'archived' && current.status !== 'archived') merged.archivedAt = new Date().toISOString();
          updated = validateProjectRecord(merged);
          const changedFields = Object.keys(updated).filter(key => !['updatedAt', 'lastActivityAt'].includes(key) && JSON.stringify(updated[key]) !== JSON.stringify(current[key]));
          if (!changedFields.length) {
            updated = current;
            return;
          }
          updated.updatedAt = new Date().toISOString();
          updated.lastActivityAt = updated.updatedAt;
          if (updated.nextActionId) {
            const taskRequest = tasks.get(updated.nextActionId);
            taskRequest.onsuccess = () => {
              if (!projectTaskRelationshipValid(updated, taskRequest.result)) {
                failure = new Error('Project nextActionId must reference an existing task belonging to this project.');
                transaction.abort();
                return;
              }
              projects.put(updated);
              let eventType = 'project.updated';
              if (current.status !== updated.status) {
                eventType = updated.status === 'paused' ? 'project.paused'
                  : updated.status === 'active' && current.status === 'paused' ? 'project.resumed'
                    : updated.status === 'completed' ? 'project.completed'
                      : updated.status === 'archived' ? 'project.archived' : 'project.status_changed';
              } else if (current.currentState !== updated.currentState) {
                eventType = 'project.state_updated';
              }
              activity.add(createActivityEvent(deviceId, eventType, { type: 'project', id: projectId }, { changes: changedFields, status: updated.status }));
            };
          } else {
            projects.put(updated);
            let eventType = 'project.updated';
            if (current.status !== updated.status) {
              eventType = updated.status === 'paused' ? 'project.paused'
                : updated.status === 'active' && current.status === 'paused' ? 'project.resumed'
                  : updated.status === 'completed' ? 'project.completed'
                    : updated.status === 'archived' ? 'project.archived' : 'project.status_changed';
            } else if (current.currentState !== updated.currentState) {
              eventType = 'project.state_updated';
            }
            activity.add(createActivityEvent(deviceId, eventType, { type: 'project', id: projectId }, { changes: changedFields, status: updated.status }));
          }
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve(updated);
      transaction.onerror = () => reject(failure || transaction.error || new Error('Could not update project.'));
      transaction.onabort = () => reject(failure || transaction.error || new Error('Could not update project.'));
    });
  }

  async function archiveProject(projectId) {
    return updateProject(projectId, { status: 'archived' });
  }

  async function createTask(input) {
    const now = new Date().toISOString();
    const taskId = requireNonEmptyString(input.taskId || makeId(), 'taskId');
    const projectId = input.projectId ?? null;
    const task = validateTaskRecord({
      taskId,
      title: input.title,
      status: input.status || 'todo',
      priority: input.priority || 'medium',
      projectId,
      dueAt: input.dueAt ?? null,
      scheduledAt: input.scheduledAt ?? null,
      createdAt: now,
      updatedAt: now,
      completedAt: (input.status || 'todo') === 'completed' ? now : null
    });
    const deviceId = await getDeviceId();
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const storeNames = projectId ? [PROJECT_STORE_NAME, TASK_STORE_NAME, STORE_NAME] : [TASK_STORE_NAME, STORE_NAME];
      const transaction = db.transaction(storeNames, 'readwrite');
      const tasks = transaction.objectStore(TASK_STORE_NAME);
      const event = createActivityEvent(deviceId, 'task.created', { type: 'task', id: taskId }, { title: task.title }, projectId ? [{ type: 'project', id: projectId }] : []);
      let failure;
      const write = () => {
        tasks.add(task);
        transaction.objectStore(STORE_NAME).add(event);
      };
      if (!projectId) {
        write();
      } else {
        const projects = transaction.objectStore(PROJECT_STORE_NAME);
        const request = projects.get(projectId);
        request.onsuccess = () => {
          if (!request.result) {
            failure = new Error(`Project not found: ${projectId}`);
            transaction.abort();
            return;
          }
          const project = { ...request.result, lastActivityAt: now, updatedAt: now };
          projects.put(project);
          write();
        };
      }
      transaction.oncomplete = () => resolve(task);
      transaction.onerror = () => reject(failure || transaction.error || new Error('Could not create task.'));
      transaction.onabort = () => reject(failure || transaction.error || new Error('Could not create task.'));
    });
  }

  async function getTask(taskId) {
    requireNonEmptyString(taskId, 'taskId');
    const db = await openDatabase();
    return requestResult(db.transaction(TASK_STORE_NAME, 'readonly').objectStore(TASK_STORE_NAME).get(taskId));
  }

  async function listTasks({ projectId } = {}) {
    const db = await openDatabase();
    const store = db.transaction(TASK_STORE_NAME, 'readonly').objectStore(TASK_STORE_NAME);
    const tasks = projectId === undefined
      ? await requestResult(store.getAll())
      : await requestResult(store.index('byProjectId').getAll(projectId));
    return tasks.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.taskId.localeCompare(b.taskId));
  }

  async function updateTask(taskId, changes) {
    requireNonEmptyString(taskId, 'taskId');
    if (!isPlainObject(changes)) throw new TypeError('Task changes must be an object.');
    const deviceId = await getDeviceId();
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([PROJECT_STORE_NAME, TASK_STORE_NAME, STORE_NAME], 'readwrite');
      const tasks = transaction.objectStore(TASK_STORE_NAME);
      const projects = transaction.objectStore(PROJECT_STORE_NAME);
      const activity = transaction.objectStore(STORE_NAME);
      let updated;
      let failure;
      const request = tasks.get(taskId);
      request.onsuccess = () => {
        try {
          const current = request.result;
          if (!current) throw new Error(`Task not found: ${taskId}`);
          const now = new Date().toISOString();
          const merged = { ...current, ...changes, taskId, projectId: current.projectId, updatedAt: now };
          if (merged.status === 'completed' && current.status !== 'completed') merged.completedAt = now;
          else if (merged.status !== 'completed') merged.completedAt = null;
          updated = validateTaskRecord(merged);
          const changedFields = Object.keys(updated).filter(key => !['updatedAt', 'completedAt'].includes(key) && JSON.stringify(updated[key]) !== JSON.stringify(current[key]));
          if (!changedFields.length) {
            updated = current;
            return;
          }
          const write = project => {
            tasks.put(updated);
            if (project) projects.put({ ...project, updatedAt: now, lastActivityAt: now });
            const type = updated.status === 'completed' && current.status !== 'completed' ? 'task.completed' : 'task.updated';
            activity.add(createActivityEvent(deviceId, type, { type: 'task', id: taskId }, { title: updated.title, status: updated.status, changes: changedFields }, updated.projectId ? [{ type: 'project', id: updated.projectId }] : []));
          };
          if (updated.projectId) {
            const projectRequest = projects.get(updated.projectId);
            projectRequest.onsuccess = () => {
              if (!projectRequest.result) {
                failure = new Error(`Project not found: ${updated.projectId}`);
                transaction.abort();
                return;
              }
              write(projectRequest.result);
            };
          } else {
            write(null);
          }
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve(updated);
      transaction.onerror = () => reject(failure || transaction.error || new Error('Could not update task.'));
      transaction.onabort = () => reject(failure || transaction.error || new Error('Could not update task.'));
    });
  }

  async function completeTask(taskId) {
    return updateTask(taskId, { status: 'completed' });
  }

  async function setProjectNextAction(projectId, taskId) {
    requireNonEmptyString(projectId, 'projectId');
    if (taskId !== null) requireNonEmptyString(taskId, 'taskId');
    const deviceId = await getDeviceId();
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([PROJECT_STORE_NAME, TASK_STORE_NAME, STORE_NAME], 'readwrite');
      const projects = transaction.objectStore(PROJECT_STORE_NAME);
      const tasks = transaction.objectStore(TASK_STORE_NAME);
      const activity = transaction.objectStore(STORE_NAME);
      let updated;
      let failure;
      const projectRequest = projects.get(projectId);
      projectRequest.onsuccess = () => {
        const current = projectRequest.result;
        if (!current) {
          failure = new Error(`Project not found: ${projectId}`);
          transaction.abort();
          return;
        }
        if (current.nextActionId === taskId) {
          updated = current;
          return;
        }
        const save = () => {
          const now = new Date().toISOString();
          updated = validateProjectRecord({ ...current, nextActionId: taskId, updatedAt: now, lastActivityAt: now });
          projects.put(updated);
          activity.add(createActivityEvent(deviceId, 'project.next_action_changed', { type: 'project', id: projectId }, { taskId }, taskId ? [{ type: 'task', id: taskId }] : []));
        };
        if (taskId === null) {
          save();
          return;
        }
        const taskRequest = tasks.get(taskId);
        taskRequest.onsuccess = () => {
          const task = taskRequest.result;
          if (!task || task.projectId !== current.projectId || ['completed', 'cancelled'].includes(task.status)) {
            failure = new Error('Next Action must reference an active task belonging to this project.');
            transaction.abort();
            return;
          }
          save();
        };
      };
      transaction.oncomplete = () => resolve(updated);
      transaction.onerror = () => reject(failure || transaction.error || new Error('Could not set project Next Action.'));
      transaction.onabort = () => reject(failure || transaction.error || new Error('Could not set project Next Action.'));
    });
  }

  async function queryProjectActivity(projectId, { limit = 200 } = {}) {
    requireNonEmptyString(projectId, 'projectId');
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > MAX_QUERY_LIMIT) {
      throw new RangeError(`Project activity limit must be an integer from 0 to ${MAX_QUERY_LIMIT}.`);
    }
    const tasks = await listTasks({ projectId });
    const taskIds = new Set(tasks.map(task => task.taskId));
    const events = await queryEvents({ sourceModule: BUILD_SOURCE_MODULE, limit: MAX_QUERY_LIMIT });
    return events
      .filter(event => (event.subject.type === 'project' && event.subject.id === projectId)
        || (event.subject.type === 'task' && taskIds.has(event.subject.id)))
      .sort((a, b) => eventOrder(b, a))
      .slice(0, limit);
  }

  function close() {
    if (database) database.close();
    database = null;
    databasePromise = null;
  }

  async function initialize() {
    await openDatabase();
    return Object.freeze({ name: databaseName, version: FOUNDATION_DATABASE_VERSION });
  }

  return Object.freeze({
    open: initialize,
    appendEvent,
    getEvent,
    queryEvents,
    createProject,
    getProject,
    listProjects,
    updateProject,
    archiveProject,
    createTask,
    getTask,
    listTasks,
    updateTask,
    completeTask,
    setProjectNextAction,
    queryProjectActivity,
    close
  });
}
