export const FOUNDATION_DATABASE_NAME = 'mohit-os-foundation';
export const FOUNDATION_DATABASE_VERSION = 1;
export const ACTIVITY_STORE_NAME = 'activityEvents';
export const ACTIVITY_EVENT_SCHEMA_VERSION = 1;

const STORE_NAME = ACTIVITY_STORE_NAME;
const MAX_QUERY_LIMIT = 1000;

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

  function close() {
    if (database) database.close();
    database = null;
    databasePromise = null;
  }

  async function initialize() {
    await openDatabase();
    return Object.freeze({ name: databaseName, version: FOUNDATION_DATABASE_VERSION });
  }

  return Object.freeze({ open: initialize, appendEvent, getEvent, queryEvents, close });
}
