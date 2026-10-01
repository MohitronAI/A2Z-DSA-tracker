const { curriculum, allLessons } = window.STRIVER_CURRICULUM;
const STORAGE_KEY = 'striver-a2z-progress-v1';
const SCHEMA_VERSION = 2;
const $ = selector => document.querySelector(selector);
const lessonById = new Map(allLessons.map(lesson => [lesson.id, lesson]));
const config = window.STRIVER_CONFIG || {};
let state = loadState();
let activeFilter = 'all';
let searchTerm = '';
let syncInFlight = false;
let syncPending = Boolean(state.syncPending);
let localMutationVersion = 0;
let syncRetryDelay = 2500;
let syncRetryTimer = null;
let pairingSession = null;
let syncStatus = 'saved';
let lastSyncedAt = state.lastSyncedAt || null;
let knownDevices = [];
let pairingTimer = null;
saveState();

function validTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(value)) return null;
  return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}
function normalizeEntry(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const completedAt = validTimestamp(candidate.completedAt);
  const firstStartedAt = validTimestamp(candidate.firstStartedAt);
  const lastActivityAt = validTimestamp(candidate.lastActivityAt) || completedAt || firstStartedAt;
  if (!lastActivityAt) return null;
  return {
    completed: candidate.completed === true && Boolean(completedAt),
    firstStartedAt,
    completedAt: candidate.completed === true ? completedAt : null,
    lastActivityAt,
    revisionId: typeof candidate.revisionId === 'string' ? candidate.revisionId.slice(0, 40) : ''
  };
}
function sanitizeProgress(candidate) {
  const result = {};
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return result;
  for (const [id, value] of Object.entries(candidate)) {
    if (!lessonById.has(id)) continue;
    const entry = normalizeEntry(value);
    if (entry) result[id] = entry;
  }
  return result;
}
function generateSyncId() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let buffer = 0, bits = 0, out = '';
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) { bits -= 5; out += alphabet[(buffer >>> bits) & 31]; }
  }
  return out.match(/.{1,8}/g).join('-');
}
function randomHex(bytes = 16) { return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), byte => byte.toString(16).padStart(2, '0')).join(''); }
function deviceName() {
  const ua = navigator.userAgent || '';
  if (/ipad|tablet/i.test(ua)) return 'Tablet';
  if (/android|iphone|mobile/i.test(ua)) return 'Phone';
  return 'Laptop';
}
function normalizeSyncId(value) {
  const compact = String(value || '').toUpperCase().replace(/[\s-]/g, '');
  if (!/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{32}$/.test(compact)) return null;
  return compact.match(/.{1,8}/g).join('-');
}
function loadState() {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { stored = {}; }
  const completed = sanitizeProgress(stored.completed || stored.progress || {});
  const legacyActivity = stored.lastActivity;
  if (legacyActivity?.lessonId && lessonById.has(legacyActivity.lessonId) && !completed[legacyActivity.lessonId]) {
    const at = validTimestamp(legacyActivity.at);
    if (at) completed[legacyActivity.lessonId] = { completed: false, firstStartedAt: null, completedAt: null, lastActivityAt: at, revisionId: '' };
  }
  const normalizedId = normalizeSyncId(stored.syncId);
  const ownerSecret = normalizeSyncId(stored.ownerSecret) || normalizedId || generateSyncId();
  const credential = typeof stored.credential === 'string' && /^[A-Za-z0-9_-]{24,80}$/.test(stored.credential) ? stored.credential : ownerSecret;
  const defaultOwner = !/android|iphone|mobile|ipad|tablet/i.test(navigator.userAgent || '');
  return {
    completed,
    lastActivity: legacyActivity || null,
    ownerSecret,
    credential,
    isOwner: typeof stored.isOwner === 'boolean' ? stored.isOwner : defaultOwner,
    deviceId: /^[a-f0-9]{32}$/.test(stored.deviceId || '') ? stored.deviceId : randomHex(),
    deviceName: stored.deviceName || deviceName(),
    pairedAt: validTimestamp(stored.pairedAt),
    syncEnabled: stored.syncEnabled === true,
    syncPending: stored.syncPending === true,
    lastSyncedAt: validTimestamp(stored.lastSyncedAt)
  };
}
function saveState() {
  state.syncPending = syncPending;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function isDone(id) { return Boolean(state.completed[id]?.completed); }
function getEntry(id) { return state.completed[id] || null; }
function moduleLessons(module) { return (module.sections || []).flatMap(section => section.lessons); }
function moduleStats(module) {
  const lessons = moduleLessons(module); const completed = lessons.filter(item => isDone(item.id)).length;
  return { total: lessons.length, completed, pct: lessons.length ? Math.round(completed / lessons.length * 100) : 0 };
}
function allStats() {
  const completed = safeLessons.filter(item => isDone(item.id)).length;
  const inProgress = safeLessons.filter(item => { const entry = getEntry(item.id); return Boolean(entry?.firstStartedAt && !entry.completed); }).length;
  return { total: safeLessons.length, completed, inProgress, remaining: safeLessons.length - completed, pct: safeLessons.length ? Math.round(completed / safeLessons.length * 100) : 0 };
}
const safeLessons = allLessons;
function statusFor(stats) { return stats.total && stats.completed === stats.total ? 'Completed' : stats.completed ? 'In progress' : 'Not started'; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])); }
function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, { day:'numeric', month:'short', year:'numeric', hour:'numeric', minute:'2-digit' }).format(new Date(value));
}
function elapsedText(start, end) {
  const seconds = Math.max(0, Math.floor((Date.parse(end) - Date.parse(start)) / 1000));
  if (seconds < 60) return 'less than a minute';
  let minutes = Math.floor(seconds / 60);
  const days = Math.floor(minutes / 1440); minutes %= 1440;
  const hours = Math.floor(minutes / 60); minutes %= 60;
  const parts = [];
  if (days) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  if (hours) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  if (minutes && parts.length < 2) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  return parts.join(' ') || 'less than a minute';
}
function getLatestActivity() {
  let latest = null;
  for (const [id, entry] of Object.entries(state.completed)) {
    const at = entry.lastActivityAt;
    if (at && (!latest?.at || Date.parse(at) > Date.parse(latest.at))) latest = { lessonId:id, title:lessonById.get(id)?.title || id, at };
  }
  if (state.lastActivity?.at && (!latest?.at || Date.parse(state.lastActivity.at) > Date.parse(latest.at))) return state.lastActivity;
  return latest || state.lastActivity;
}
function renderDashboard() {
  const stats = allStats();
  $('#overall-count').textContent = `${stats.completed} / ${stats.total}`;
  $('#overall-percent').textContent = `${stats.pct}% complete`;
  $('#overall-bar').style.width = `${stats.pct}%`;
  $('#remaining-count').textContent = `${stats.remaining} remaining`;
  $('#completed-stat').textContent = stats.completed;
  $('#in-progress-stat').textContent = stats.inProgress;
  $('#remaining-stat').textContent = stats.remaining;
  $('#total-stat').textContent = stats.total;
  const activity = getLatestActivity();
  $('#last-activity').textContent = activity?.title || 'No activity yet';
  $('#last-activity-time').textContent = activity?.at ? formatDate(activity.at) : 'Check off a lesson to get started';
  $('#module-overview').innerHTML = curriculum.map((module, i) => {
    const s = moduleStats(module), status = s.total ? statusFor(s) : 'Awaiting verified lessons';
    return `<article class="module-mini ${s.total ? '' : 'unverified'}"><div class="mini-top"><span class="mini-number">${String(i+1).padStart(2,'0')}</span><span class="mini-status ${s.completed === s.total && s.total ? 'done' : s.completed ? 'doing' : ''}">${status}</span></div><h3>${escapeHtml(module.title)}</h3><div class="mini-count">${s.completed} / ${s.total || '—'} <span>${s.total ? 'lessons' : 'verified'}</span></div><div class="mini-bar"><span style="width:${s.pct}%"></span></div></article>`;
  }).join('');
}
function lessonMatches(lesson, module, section) {
  const query = searchTerm.toLowerCase();
  const textMatch = !query || `${lesson.title} ${module.title} ${section.title}`.toLowerCase().includes(query);
  const filterMatch = activeFilter === 'all' || (activeFilter === 'completed' ? isDone(lesson.id) : !isDone(lesson.id));
  return textMatch && filterMatch;
}
function renderRoadmap() {
  const total = allStats(); $('#roadmap-count').textContent = `${total.completed} / ${total.total}`;
  const matchingCount = safeLessons.filter(lesson => {
    const module = curriculum.find(item => item.id === lesson.moduleId);
    const section = module?.sections.find(item => item.id === lesson.sectionId);
    return lessonMatches(lesson, module, section);
  }).length;
  $('#search-summary').hidden = !searchTerm && activeFilter === 'all';
  $('#search-summary').textContent = `${matchingCount} matching ${matchingCount === 1 ? 'lesson' : 'lessons'} across the curriculum`;
  $('#roadmap-list').innerHTML = curriculum.map((module, moduleIndex) => {
    const stats = moduleStats(module); const hasCurriculum = stats.total > 0;
    const sections = (module.sections || []).map(section => {
      const visible = section.lessons.filter(lesson => lessonMatches(lesson, module, section));
      if ((searchTerm || activeFilter !== 'all') && !visible.length) return '';
      const done = section.lessons.filter(lesson => isDone(lesson.id)).length;
      return `<details class="section-card" ${searchTerm || activeFilter !== 'all' ? 'open' : ''}><summary><span class="section-chevron">⌄</span><span class="section-title">${escapeHtml(section.title)}</span><span class="section-count">${done} / ${section.lessons.length}</span><span class="section-progress"><i style="width:${section.lessons.length ? done/section.lessons.length*100 : 0}%"></i></span><span class="section-status">${statusFor({completed:done,total:section.lessons.length})}</span></summary><div class="lesson-list">${visible.map(lesson => renderLesson(lesson)).join('')}</div></details>`;
    }).join('');
    return `<details class="module-card" data-module="${escapeHtml(module.id)}" ${moduleIndex === 0 && hasCurriculum ? 'open' : ''}><summary class="module-summary"><span class="module-chevron">⌄</span><span class="module-index">${String(moduleIndex+1).padStart(2,'0')}</span><span class="module-name-wrap"><b>${escapeHtml(module.title)}</b><small>${hasCurriculum ? statusFor(stats) : 'Curriculum details pending verification'}</small></span><span class="module-progress"><b>${stats.completed} <i>/</i> ${stats.total || '—'}</b><small>${hasCurriculum ? `${stats.pct}% complete` : 'lesson rows'}</small><span class="module-bar"><i style="width:${stats.pct}%"></i></span></span></summary><div class="module-body">${sections}</div></details>`;
  }).join('');
}
function renderLesson(lesson) {
  const checked = isDone(lesson.id);
  const entry = getEntry(lesson.id);
  const link = lesson.youtubeUrl ? `<a class="watch-button" href="${escapeHtml(lesson.youtubeUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Watch ${escapeHtml(lesson.title)} directly on YouTube">▶ <span>YouTube</span></a>` : `<span class="link-unavailable">Video link unavailable</span>`;
  let timestampLine = '';
  if (entry?.firstStartedAt) {
    const end = entry.completed ? entry.completedAt : entry.lastActivityAt;
    const endLabel = entry.completed ? `Completed ${formatDate(entry.completedAt)}` : `Last activity ${formatDate(entry.lastActivityAt)}`;
    timestampLine = `<small class="lesson-meta">Started ${formatDate(entry.firstStartedAt)} · ${endLabel} · Elapsed ${elapsedText(entry.firstStartedAt, end)}</small>`;
  } else if (entry?.completedAt) {
    timestampLine = `<small class="lesson-meta">Completed ${formatDate(entry.completedAt)} · Elapsed unavailable (start time not recorded)</small>`;
  } else if (entry?.lastActivityAt) {
    timestampLine = `<small class="lesson-meta">Last activity ${formatDate(entry.lastActivityAt)} · Start time not recorded</small>`;
  }
  return `<div class="lesson-row ${checked ? 'is-complete' : ''}"><label class="lesson-check"><input type="checkbox" data-lesson="${escapeHtml(lesson.id)}" ${checked ? 'checked' : ''} aria-label="Mark ${escapeHtml(lesson.title)} ${checked ? 'incomplete' : 'complete'}"><span class="custom-check">✓</span></label><span class="lesson-content"><span class="lesson-title">${escapeHtml(lesson.title)}</span>${timestampLine}</span>${link}</div>`;
}
function setPage(page) {
  const isRoadmap = page === 'roadmap' || page === 'search';
  const isSettings = page === 'settings';
  $('#dashboard-page').classList.toggle('active', !isRoadmap && !isSettings);
  $('#roadmap-page').classList.toggle('active', isRoadmap);
  $('#settings-page').classList.toggle('active', isSettings);
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.page === page));
  $('#crumb-current').textContent = page === 'search' ? 'Search' : isRoadmap ? 'Roadmap' : isSettings ? 'Settings' : 'Dashboard';
  if (isRoadmap) renderRoadmap();
  if (isSettings) renderSettings();
  if (page === 'search') $('#lesson-search').focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  location.hash = page;
}
function configuredSync() {
  const endpoint = String(config.supabaseUrl || '').replace(/\/$/, '');
  return endpoint && config.supabaseAnonKey ? { endpoint: `${endpoint}/functions/v1/progress-sync`, key: config.supabaseAnonKey } : null;
}
function renderSettings() {
  const configured = Boolean(configuredSync());
  const statusLabel = !navigator.onLine ? 'Offline · saved locally' : syncStatus === 'syncing' ? 'Syncing…' : syncStatus === 'issue' ? 'Sync issue · saved locally' : configured && lastSyncedAt ? 'Synced' : 'Saved locally';
  $('#sync-status').textContent = statusLabel;
  const indicator = $('#sync-indicator');
  if (indicator) indicator.textContent = !navigator.onLine ? '● Offline · saved locally' : syncStatus === 'syncing' ? '◌ Syncing…' : syncStatus === 'issue' ? '⚠ Sync issue' : configured && lastSyncedAt ? '● Synced' : '● Saved locally';
  $('#connect-device').disabled = !configured || !state.isOwner;
  $('#connect-device').title = !configured ? 'Cloud pairing is not configured yet' : !state.isOwner ? 'Connect new devices from your primary device' : '';
  $('#phone-pairing').hidden = Boolean(state.isOwner || state.pairedAt);
  $('#device-list').innerHTML = `<div class="device-row"><span class="device-icon">${state.deviceName === 'Phone' ? '📱' : state.deviceName === 'Tablet' ? '▣' : '💻'}</span><span><b>${escapeHtml(state.deviceName)}</b><small>This device${state.pairedAt ? ` · connected ${formatDate(state.pairedAt)}` : ''}</small></span><span class="device-connected">● ${configured && lastSyncedAt ? 'Connected' : 'This device'}</span></div>${knownDevices.filter(item => item.deviceId !== state.deviceId).map(item => `<div class="device-row"><span class="device-icon">${item.deviceName === 'Phone' ? '📱' : item.deviceName === 'Tablet' ? '▣' : '💻'}</span><span><b>${escapeHtml(item.deviceName || 'Device')}</b><small>Last synced ${item.lastSeenAt ? formatDate(item.lastSeenAt) : 'recently'}</small></span><span class="device-connected">● Connected</span></div>`).join('')}`;
  const connect = $('#connect-device');
  connect.textContent = pairingSession && Date.parse(pairingSession.expiresAt) > Date.now() ? '＋ Create a new pairing code' : '＋ Connect another device';
  const panel = $('#pairing-panel'); panel.hidden = !(pairingSession && Date.parse(pairingSession.expiresAt) > Date.now());
  if (panel.hidden && pairingTimer) { clearInterval(pairingTimer); pairingTimer = null; }
  if (panel.hidden && pairingSession && Date.parse(pairingSession.expiresAt) <= Date.now()) pairingSession = null;
  if (panel.hidden && !configured) $('#sync-feedback').textContent = 'Device pairing will be available when cloud sync is configured.';
  if (!panel.hidden) drawPairingQr();
  $('#last-sync-label').textContent = lastSyncedAt ? `Last synced ${formatDate(lastSyncedAt)}` : 'Progress is stored on this device until connected.';
  const codeInput = $('#pairing-code-input');
  if (codeInput && !state.isOwner && !codeInput.value && new URLSearchParams(location.search).has('pair')) codeInput.value = new URLSearchParams(location.search).get('pair') || '';
  const lastSyncLabel = $('#last-sync-label');
  if (lastSyncLabel) lastSyncLabel.textContent = lastSyncedAt ? `Last synced ${formatDate(lastSyncedAt)}` : 'Progress is stored on this device until connected.';
}
function updateLastActivity(id, at) {
  const entry = getEntry(id);
  state.lastActivity = { lessonId: id, title: lessonById.get(id)?.title || id, at };
  if (entry) state.completed[id] = { ...entry, lastActivityAt: at };
}
function nextTimestamp(previous) {
  const now = Date.now();
  const prior = previous ? Date.parse(previous) : 0;
  return new Date(Math.max(now, Number.isFinite(prior) ? prior + 1 : 0)).toISOString();
}
function randomRevision() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
function onLessonChange(input) {
  const id = input.dataset.lesson;
  if (!lessonById.has(id)) return;
  const previous = getEntry(id) || { completed:false, firstStartedAt:null, completedAt:null, lastActivityAt:null, revisionId:'' };
  const at = nextTimestamp(previous.lastActivityAt);
  const entry = {
    completed: input.checked,
    firstStartedAt: previous.firstStartedAt || at,
    completedAt: input.checked ? at : null,
    lastActivityAt: at,
    revisionId: randomRevision()
  };
  state.completed[id] = entry;
  state.lastActivity = { lessonId:id, title:lessonById.get(id).title, at };
  localMutationVersion += 1;
  saveState();
  renderDashboard(); renderRoadmap();
  if (configuredSync() && (state.isOwner || state.pairedAt)) scheduleSync();
}
function compareEntries(a, b) {
  const timeDiff = Date.parse(a.lastActivityAt) - Date.parse(b.lastActivityAt);
  if (timeDiff) return timeDiff;
  return String(a.revisionId || '').localeCompare(String(b.revisionId || ''));
}
function mergeProgress(left, right) {
  const merged = sanitizeProgress(left);
  for (const [id, remoteValue] of Object.entries(sanitizeProgress(right))) {
    const localValue = merged[id];
    if (!localValue || compareEntries(remoteValue, localValue) > 0) merged[id] = remoteValue;
  }
  return merged;
}
function rebuildLastActivity() {
  let latest = null;
  for (const [id, entry] of Object.entries(state.completed)) {
    if (entry.lastActivityAt && (!latest || Date.parse(entry.lastActivityAt) > Date.parse(latest.at))) {
      latest = { lessonId:id, title:lessonById.get(id)?.title || id, at:entry.lastActivityAt };
    }
  }
  state.lastActivity = latest;
}
function scheduleSync() {
  syncPending = true; saveState();
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow({ quiet:true }), 650);
}
let syncTimer = null;
async function callSyncApi(body) {
  const connection = configuredSync();
  if (!connection) throw new Error('Pairing is not configured.');
  const response = await fetch(connection.endpoint, {
    method:'POST', headers:{ 'Content-Type':'application/json', apikey:connection.key, Authorization:`Bearer ${connection.key}` },
    body:JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Sync failed (${response.status})`);
  return payload;
}
async function syncNow({ quiet = false } = {}) {
  const connection = configuredSync();
  if (!connection) {
    syncStatus = 'saved';
    renderSettings();
    return false;
  }
  if (!navigator.onLine) {
    syncPending = true; saveState();
    syncStatus = 'saved';
    renderSettings();
    return false;
  }
  if (syncInFlight) { syncPending = true; return false; }
  syncInFlight = true;
  const sentMutationVersion = localMutationVersion;
  const sentProgress = sanitizeProgress(state.completed);
  let shouldResyncAfterSuccess = false;
  syncStatus = 'syncing';
  renderSettings();
  try {
    const payload = await callSyncApi({ action:'sync', credential:state.credential, deviceId:state.deviceId, deviceName:state.deviceName, progress:sentProgress });
    if (!payload.progress) throw new Error('Incomplete sync response');
    state.completed = mergeProgress(state.completed, payload.progress);
    rebuildLastActivity(); syncPending = localMutationVersion !== sentMutationVersion; shouldResyncAfterSuccess = syncPending; state.syncEnabled = true; state.lastSyncedAt = payload.syncedAt || new Date().toISOString(); lastSyncedAt = state.lastSyncedAt; knownDevices = Array.isArray(payload.devices) ? payload.devices : knownDevices; syncStatus = 'synced'; saveState();
    syncRetryDelay = 2500;
    if (syncRetryTimer) { clearTimeout(syncRetryTimer); syncRetryTimer = null; }
    renderDashboard(); renderRoadmap();
    $('#sync-feedback').textContent = `Synced · Last synced ${formatDate(lastSyncedAt)}.`;
    renderSettings();
    return true;
  } catch {
    syncPending = true; syncStatus = 'issue'; saveState();
    if (navigator.onLine && configuredSync() && !syncRetryTimer) {
      syncRetryTimer = setTimeout(() => { syncRetryTimer = null; syncNow({quiet:true}); }, syncRetryDelay);
      syncRetryDelay = Math.min(syncRetryDelay * 2, 60_000);
    }
    renderSettings();
    return false;
  } finally { syncInFlight = false; if (shouldResyncAfterSuccess) scheduleSync(); }
}
function drawPairingQr() {
  if (!pairingSession || !window.drawQr) return;
  const link = new URL(location.href); link.hash = ''; link.search = ''; link.searchParams.set('pair', pairingSession.token);
  window.drawQr($('#pairing-qr'), link.toString());
  $('#pairing-code').textContent = pairingSession.code;
  if (!pairingTimer) pairingTimer = setInterval(() => {
    if (!pairingSession) return;
    const seconds = Math.max(0, Math.ceil((Date.parse(pairingSession.expiresAt) - Date.now()) / 1000));
    $('#pairing-expiry').textContent = seconds ? `Expires in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : 'Pairing code expired. Create a new one.';
    if (!seconds) { pairingSession = null; clearInterval(pairingTimer); pairingTimer = null; $('#pairing-panel').hidden = true; }
  }, 1000);
}
async function createPairing() {
  if (!state.isOwner || !navigator.onLine) { $('#sync-feedback').textContent = 'Connect your primary device to the internet to start pairing.'; return; }
  $('#connect-device').disabled = true;
  try {
    const result = await callSyncApi({ action:'create_pairing', credential:state.ownerSecret, deviceId:state.deviceId, deviceName:state.deviceName });
    pairingSession = { token:result.pairingToken, code:result.pairingCode, expiresAt:result.expiresAt };
    $('#sync-feedback').textContent = 'Pairing code ready. Scan with the other device within 5 minutes.';
    renderSettings();
  } catch {
    $('#sync-feedback').textContent = 'Pairing could not start. Progress remains saved on this device.';
  } finally { $('#connect-device').disabled = false; }
}
async function completePairing(value, viaQr = false) {
  const code = String(value || '').toUpperCase().replace(/[\s-]/g, '');
  const valid = viaQr ? Boolean(normalizeSyncId(code)) : /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{12}$/.test(code);
  if (!valid) { $('#sync-feedback').textContent = 'Enter the 12-character one-time code shown on your primary device.'; return false; }
  if (!navigator.onLine) { $('#sync-feedback').textContent = 'Connect to the internet once to pair. This device will work offline afterwards.'; return false; }
  $('#sync-feedback').textContent = 'Connecting this device…';
  try {
    const result = await callSyncApi({ action:'complete_pairing', ...(viaQr ? { pairingToken:normalizeSyncId(code) } : { pairingCode:code }), deviceId:state.deviceId, deviceName:state.deviceName });
    if (!result.deviceCredential || !result.progress) throw new Error('Incomplete pairing response');
    state.credential = result.deviceCredential; state.isOwner = false; state.pairedAt = result.pairedAt || new Date().toISOString(); state.lastSyncedAt = result.syncedAt || new Date().toISOString(); lastSyncedAt = state.lastSyncedAt;
    state.completed = mergeProgress(state.completed, result.progress); knownDevices = Array.isArray(result.devices) ? result.devices : knownDevices;
    localMutationVersion += 1; syncPending = true; syncStatus = 'synced'; rebuildLastActivity(); saveState();
    history.replaceState(null, '', `${location.pathname}${location.hash}`);
    renderDashboard(); renderRoadmap(); renderSettings(); scheduleSync();
    $('#sync-feedback').textContent = 'This device is connected. Progress will sync automatically.';
    return true;
  } catch {
    $('#sync-feedback').textContent = 'Could not connect. The code may have expired or already been used. Request a new code from your primary device.';
    return false;
  }
}
function downloadBackup() {
  const backup = { app:'MOHIT.OS · A2Z DSA', schemaVersion:SCHEMA_VERSION, backupId:`${Date.now().toString(36)}-${randomRevision()}`, exportedAt:new Date().toISOString(), progress:sanitizeProgress(state.completed) };
  const blob = new Blob([JSON.stringify(backup, null, 2)], {type:'application/json'});
  const link = document.createElement('a');
  const objectUrl = URL.createObjectURL(blob);
  link.href = objectUrl;
  link.download = `mohit-os-a2z-dsa-progress-${new Date().toISOString().slice(0,10)}.json`;
  link.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  $('#sync-feedback').textContent = 'Backup exported. Keep the file private.';
}
async function importBackup(file) {
  try {
    const backup = JSON.parse(await file.text());
    if (backup.schemaVersion !== SCHEMA_VERSION || !backup.progress || typeof backup.progress !== 'object' || Array.isArray(backup.progress)) throw new Error('This backup format is not supported.');
    const imported = sanitizeProgress(backup.progress);
    state.completed = mergeProgress(state.completed, imported);
    localMutationVersion += 1;
    rebuildLastActivity(); syncPending = true; saveState();
    renderDashboard(); renderRoadmap(); renderSettings();
    $('#sync-feedback').textContent = `Restored ${Object.keys(imported).length} lesson records. They will sync automatically when available.`;
    if (configuredSync()) scheduleSync();
  } catch (error) {
    $('#sync-feedback').textContent = error instanceof SyntaxError ? 'That file is not valid JSON.' : error.message || 'Could not import this backup.';
  } finally { $('#backup-file').value = ''; }
}
document.addEventListener('click', event => {
  const nav = event.target.closest('[data-page]'); if (nav) setPage(nav.dataset.page);
  if (event.target.closest('[data-go-roadmap]')) setPage('roadmap');
  if (event.target.closest('[data-filter]')) {
    const filter = event.target.closest('[data-filter]'); activeFilter = filter.dataset.filter;
    document.querySelectorAll('.filter').forEach(button => button.classList.toggle('active', button === filter)); renderRoadmap();
  }
  if (event.target.closest('#connect-device')) createPairing();
  if (event.target.closest('#join-pairing')) completePairing($('#pairing-code-input').value);
  if (event.target.closest('#export-backup')) downloadBackup();
  if (event.target.closest('#import-backup')) $('#backup-file').click();
});
document.addEventListener('change', event => {
  const input = event.target.closest('input[data-lesson]'); if (input) onLessonChange(input);
  if (event.target.id === 'backup-file' && event.target.files?.[0]) importBackup(event.target.files[0]);
});
$('#lesson-search').addEventListener('input', event => { searchTerm = event.target.value.trim(); renderRoadmap(); });
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPage('roadmap'); $('#lesson-search').focus(); }
  if (event.key === 'Escape' && document.activeElement === $('#lesson-search')) { $('#lesson-search').value = ''; searchTerm = ''; renderRoadmap(); }
});
window.addEventListener('online', () => { if (syncRetryTimer) { clearTimeout(syncRetryTimer); syncRetryTimer = null; } if (configuredSync() && (state.isOwner || state.pairedAt)) syncNow({quiet:true}); renderSettings(); });
window.addEventListener('offline', () => { syncStatus = 'saved'; renderSettings(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && configuredSync() && (state.isOwner || state.pairedAt)) syncNow({quiet:true}); });
setInterval(() => { if (!document.hidden && configuredSync() && navigator.onLine && (state.isOwner || state.pairedAt)) syncNow({quiet:true}); }, 20_000);
$('#today-label').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date());
renderDashboard(); renderSettings();
if (location.hash === '#roadmap') setPage('roadmap');
else if (location.hash === '#search') setPage('search');
else if (location.hash === '#settings') setPage('settings');
const inboundPairingToken = new URLSearchParams(location.search).get('pair');
if (inboundPairingToken) { setPage('settings'); completePairing(inboundPairingToken, true); }
else if (configuredSync() && (state.isOwner || state.pairedAt)) syncNow({quiet:true});
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./service-worker.js').catch(() => {});
