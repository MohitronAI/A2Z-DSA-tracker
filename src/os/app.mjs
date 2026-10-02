const areaButtons = [...document.querySelectorAll('[data-area-module]')];
const learnNavigation = document.querySelector('[data-area-nav="learn"]');
const buildNavigation = document.querySelector('[data-area-nav="build"]');
const osNavigation = document.querySelector('[data-area-nav="os"]');
const osMobileNavigation = document.querySelector('.os-mobile-nav');
const learnLabel = document.querySelector('[data-area-label="learn"]');
const buildLabel = document.querySelector('[data-area-label="build"]');
const osLabel = document.querySelector('[data-area-label="os"]');
const pages = {
  learn: document.querySelector('#dashboard-page'),
  build: document.querySelector('#build-page'),
  think: document.querySelector('#think-page'),
  plan: document.querySelector('#plan-page'),
  activity: document.querySelector('#activity-page')
};
const roots = {
  think: document.querySelector('#think-app'),
  plan: document.querySelector('#plan-app'),
  activity: document.querySelector('#activity-app')
};
let repository = null;
let actions = null;
let currentArea = 'learn';
let showArchivedNotes = false;
let noteSearch = '';
let noteTypeFilter = 'all';
let noteProjectFilter = 'all';
let planView = 'all';
let showClosedTasks = false;
let activitySearch = '';
let activitySource = 'all';
let waiting = false;
let globalSearchGeneration = 0;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

function displayDate(value) {
  if (!value) return 'No date';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', ...(value.includes('T') ? { timeStyle: 'short' } : {}) }).format(date)
    : 'No date';
}

function dateTimeInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function dateTimeInputIso(value) {
  return value ? new Date(value).toISOString() : null;
}

function setArea(area) {
  currentArea = area;
  if (area === 'build') {
    osNavigation.hidden = true;
    osMobileNavigation.hidden = true;
    osLabel.hidden = true;
    areaButtons.forEach(button => {
      const active = button.dataset.areaModule === area;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });

    return;
  }
  document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page === pages[area]));
  learnNavigation.hidden = area !== 'learn';
  buildNavigation.hidden = area !== 'build';
  osNavigation.hidden = !['think', 'plan', 'activity'].includes(area);
  osMobileNavigation.hidden = !['think', 'plan', 'activity'].includes(area);
  learnLabel.hidden = area !== 'learn';
  buildLabel.hidden = area !== 'build';
  osLabel.hidden = !['think', 'plan', 'activity'].includes(area);
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  areaButtons.forEach(button => {
    const active = button.dataset.areaModule === area;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  const section = document.querySelector(`[data-os-section="${area}"]`);
  if (section) section.classList.add('active');
  document.querySelectorAll('.os-mobile-nav [data-area-module]').forEach(button => {
    if (button.dataset.areaModule === area) button.classList.add('active');
  });
  const crumb = document.querySelector('.breadcrumb');
  const title = { think: 'Notes', plan: 'Tasks & reminders', activity: 'Activity' }[area];
  crumb.setAttribute('aria-label', `MOHIT.OS, ${area.toUpperCase()}`);
  crumb.innerHTML = `<span>MOHIT.OS</span><span>/</span><b>${area.toUpperCase()}</b><span class="breadcrumb-page-separator">/</span><b id="crumb-current">${title}</b>`;
  if (area !== 'learn') location.hash = area;
}

document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openGlobalSearch();
  }
});

document.addEventListener('mohit-os:quick-note', async event => {
  const { projectId = null, type = 'Note' } = event.detail || {};
  showArchivedNotes = false;
  noteTypeFilter = 'all';
  noteProjectFilter = 'all';
  noteSearch = '';
  setArea('think');
  await refreshArea();
  const form = document.querySelector('#note-dialog form');
  delete form.dataset.noteId;
  form.reset();
  form.elements.type.value = type;
  form.elements.projectId.value = projectId || '';
  form.querySelector('[data-dialog-title]').textContent = 'New capture';
  openDialog('note-dialog');
  form.elements.title.focus();
});

document.addEventListener('mohit-os:open-note', async event => {
  try {
    setArea('think');
    await refreshArea();
    const note = await actions.readNote(event.detail.noteId);
    if (!note) throw new Error(`Note not found: ${event.detail.noteId}`);
    const form = document.querySelector('#note-dialog form');
    form.reset();
    noteToForm(note);
    openDialog('note-dialog');
  } catch (error) {
    message(roots.think, error.message || 'Could not open this note.', true);
  }
});

async function renderProjectsForSelect(selected = null) {
  const projects = await repository.listProjects({ includeArchived: true });
  return `<option value="">No project</option>${projects.map(project => `<option value="${escapeHtml(project.projectId)}" ${selected === project.projectId ? 'selected' : ''}>${escapeHtml(project.name)}</option>`).join('')}`;
}

function message(root, text, isError = false) {
  const target = root.querySelector('[data-os-message]');
  if (!target) return;
  target.textContent = text;
  target.classList.toggle('is-error', isError);
}

async function renderThink() {
  if (!actions) return;
  const notes = await repository.listNotes({ status: showArchivedNotes ? 'archived' : 'active' });
  const term = noteSearch.trim().toLocaleLowerCase();
  const filtered = notes.filter(note => (noteTypeFilter === 'all' || note.type === noteTypeFilter)
    && (noteProjectFilter === 'all' || note.projectId === noteProjectFilter)
    && (!term || `${note.title} ${note.content} ${note.tags.join(' ')}`.toLocaleLowerCase().includes(term)));
  const projects = await repository.listProjects({ includeArchived: true });
  const projectNames = new Map(projects.map(project => [project.projectId, project.name]));
  roots.think.innerHTML = `<div class="os-heading-row"><div><div class="eyebrow">THINK · NOTES</div><h1 id="think-heading">Notes &amp; ideas</h1><p class="subtitle">Capture thoughts and connect them to a project when useful.</p></div><div class="os-capture-actions">${['Note', 'Idea', 'Learning', 'Decision'].map(type => `<button class="secondary-button" type="button" data-os-action="new-note" data-note-type="${type}">＋ ${type}</button>`).join('')}</div></div>
    <p class="os-feedback" data-os-message role="status"></p>
    <div class="os-toolbar os-filter-toolbar"><label class="os-search">Search notes<input type="search" data-note-search value="${escapeHtml(noteSearch)}" placeholder="Title, content, or tag"></label><label>Type<select data-note-type-filter><option value="all">All types</option>${['Note', 'Idea', 'Learning', 'Decision'].map(type => `<option value="${type}" ${noteTypeFilter === type ? 'selected' : ''}>${type}</option>`).join('')}</select></label><label>Project<select data-note-project-filter><option value="all">All projects</option>${projects.map(project => `<option value="${escapeHtml(project.projectId)}" ${noteProjectFilter === project.projectId ? 'selected' : ''}>${escapeHtml(project.name)}</option>`).join('')}</select></label><button class="secondary-button" type="button" data-os-action="toggle-notes">${showArchivedNotes ? 'Show active' : 'Show archived'}</button></div>
    <section class="os-record-list" aria-label="Notes">${filtered.length ? filtered.map(note => `<article class="os-record-card" id="note-${escapeHtml(note.noteId)}" data-note-id="${escapeHtml(note.noteId)}"><div class="os-record-heading"><div><span class="build-badge">${escapeHtml(note.type)}</span><h2>${escapeHtml(note.title)}</h2><small>Updated ${escapeHtml(displayDate(note.updatedAt))}${note.projectId ? ` · ${escapeHtml(projectNames.get(note.projectId) || 'Project unavailable')}` : ''}</small></div><div class="os-record-actions">${note.status === 'active' ? `<button class="text-button" type="button" data-os-action="edit-note" data-note-id="${escapeHtml(note.noteId)}">Edit</button><button class="text-button" type="button" data-os-action="archive-note" data-note-id="${escapeHtml(note.noteId)}">Archive</button>` : `<button class="text-button" type="button" data-os-action="restore-note" data-note-id="${escapeHtml(note.noteId)}">Restore</button>`}<button class="text-button" type="button" data-os-action="delete-note" data-note-id="${escapeHtml(note.noteId)}">Delete</button></div></div><p class="os-record-content">${escapeHtml(note.content || 'No content yet.')}</p>${note.tags.length ? `<div class="os-tags">${note.tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>` : ''}</article>`).join('') : `<div class="os-empty"><h2>${term || noteTypeFilter !== 'all' || noteProjectFilter !== 'all' ? 'No matching notes.' : showArchivedNotes ? 'No archived notes.' : 'No notes yet.'}</h2><p>Use a note to capture an idea, decision, or project thought.</p></div>`}</section>
    <dialog class="os-dialog" id="note-dialog"><form data-os-form="note"><div class="os-dialog-heading"><h2 data-dialog-title>New capture</h2><button class="build-icon-button" type="button" data-os-action="close-dialog" aria-label="Close">×</button></div><label>Type<select name="type">${['Note', 'Idea', 'Learning', 'Decision'].map(type => `<option value="${type}">${type}</option>`).join('')}</select></label><label>Title<input name="title" required maxlength="160" placeholder="A useful, searchable title"></label><label>Content<textarea name="content" rows="7" maxlength="10000" placeholder="Capture the thought…"></textarea></label><label>Related project<select name="projectId">${await renderProjectsForSelect()}</select></label><label>Tags <span class="build-field-hint">Comma-separated</span><input name="tags" maxlength="500" placeholder="idea, research"></label><div class="build-dialog-actions"><button class="secondary-button" type="button" data-os-action="close-dialog">Cancel</button><button class="primary-button" type="submit">Save capture</button></div></form></dialog>`;
}

function noteToForm(note) {
  const form = document.querySelector('#note-dialog form');
  form.dataset.noteId = note.noteId;
  form.querySelector('[data-dialog-title]').textContent = 'Edit note';
  form.elements.type.value = note.type;
  form.elements.title.value = note.title;
  form.elements.content.value = note.content;
  form.elements.projectId.value = note.projectId || '';
  form.elements.tags.value = note.tags.join(', ');
}

async function renderPlan() {
  if (!actions) return;
  const tasks = await repository.listTasks();
  const projects = await repository.listProjects({ includeArchived: true });
  const projectNames = new Map(projects.map(project => [project.projectId, project.name]));
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const visibleTasks = tasks.filter(task => {
    const closed = ['completed', 'cancelled'].includes(task.status);
    if (closed !== showClosedTasks) return false;
    if (planView === 'all') return true;
    if (!task.dueAt) return false;
    const due = new Date(task.dueAt);
    if (!Number.isFinite(due.getTime())) return false;
    const dueKey = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
    return planView === 'today' ? dueKey === todayKey : dueKey > todayKey;
  }).sort((a, b) => (a.dueAt || '9999').localeCompare(b.dueAt || '9999')
    || b.createdAt.localeCompare(a.createdAt)
    || a.taskId.localeCompare(b.taskId));
  roots.plan.innerHTML = `<div class="os-heading-row"><div><div class="eyebrow">PLAN · TASKS</div><h1 id="plan-heading">Tasks &amp; reminders</h1><p class="subtitle">Keep the next concrete action visible. Due dates are stored locally; this version does not send notifications.</p></div><button class="primary-button" type="button" data-os-action="new-task">＋ New task</button></div>
    <p class="os-feedback" data-os-message role="status"></p><div class="os-toolbar os-filter-toolbar"><div class="os-view-tabs" role="group" aria-label="Task date view">${[['today', 'Today'], ['upcoming', 'Upcoming'], ['all', 'All']].map(([key, label]) => `<button class="secondary-button ${planView === key ? 'is-selected' : ''}" type="button" data-plan-view="${key}" aria-pressed="${planView === key}">${label}</button>`).join('')}</div><label class="os-closed-toggle"><input type="checkbox" data-show-closed ${showClosedTasks ? 'checked' : ''}> Completed &amp; cancelled</label><span class="os-muted">${visibleTasks.length} ${showClosedTasks ? 'completed or cancelled' : 'open'} ${planView === 'all' ? 'tasks' : `${planView} tasks`}</span></div>
    <section class="os-record-list" aria-label="Tasks">${visibleTasks.length ? visibleTasks.map(task => `<article class="os-record-card" id="task-${escapeHtml(task.taskId)}" data-task-id="${escapeHtml(task.taskId)}"><div class="os-record-heading"><div><h2>${escapeHtml(task.title)}</h2><small>${escapeHtml(task.status.replace('_', ' '))} · ${escapeHtml(task.priority)} priority${task.projectId ? ` · ${escapeHtml(projectNames.get(task.projectId) || 'Project unavailable')}` : ''} · Due ${escapeHtml(displayDate(task.dueAt))}</small></div><div class="os-record-actions"><button class="text-button" type="button" data-os-action="edit-task" data-task-id="${escapeHtml(task.taskId)}">Edit</button>${!['completed', 'cancelled'].includes(task.status) ? `<button class="text-button" type="button" data-os-action="complete-task" data-task-id="${escapeHtml(task.taskId)}">Complete</button><button class="text-button" type="button" data-os-action="cancel-task" data-task-id="${escapeHtml(task.taskId)}">Cancel</button>` : ''}<button class="text-button" type="button" data-os-action="delete-task" data-task-id="${escapeHtml(task.taskId)}">Delete</button></div></div>${task.completedAt ? `<p class="os-record-content">Completed ${escapeHtml(displayDate(task.completedAt))}</p>` : ''}</article>`).join('') : `<div class="os-empty"><h2>No ${showClosedTasks ? 'completed or cancelled' : planView === 'all' ? 'open' : planView} tasks${planView !== 'all' && !showClosedTasks ? ' with a matching due date' : ''}.</h2><p>Add a task when there is something you want to remember to do.</p></div>`}</section>
    <dialog class="os-dialog" id="plan-task-dialog"><form data-os-form="task"><div class="os-dialog-heading"><h2 data-dialog-title>New task</h2><button class="build-icon-button" type="button" data-os-action="close-dialog" aria-label="Close">×</button></div><label>Task<input name="title" required maxlength="200" placeholder="A clear next action"></label><div class="build-form-row"><label>Priority<select name="priority"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option></select></label><label>Status<select name="status"><option value="todo">To do</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label></div><label>Project<select name="projectId">${await renderProjectsForSelect()}</select></label><label>Due / reminder date &amp; time<input name="dueAt" type="datetime-local"></label><div class="build-dialog-actions"><button class="secondary-button" type="button" data-os-action="close-dialog">Cancel</button><button class="primary-button" type="submit">Save task</button></div></form></dialog>`;
}

async function taskToForm(task) {
  const form = document.querySelector('#plan-task-dialog form');
  form.dataset.taskId = task.taskId;
  form.querySelector('[data-dialog-title]').textContent = 'Edit task';
  form.elements.title.value = task.title;
  form.elements.priority.value = task.priority;
  form.elements.status.value = task.status;
  form.elements.projectId.value = task.projectId || '';
  form.elements.dueAt.value = dateTimeInputValue(task.dueAt);
}

async function renderActivity() {
  if (!actions) return;
  const events = (await actions.queryActivity({ limit: 1000 })).reverse();
  const term = activitySearch.trim().toLocaleLowerCase();
  const filtered = events.filter(event => (activitySource === 'all' || event.sourceModule === activitySource)
    && (!term || `${eventLabel(event)} ${event.sourceModule} ${event.subject.type} ${JSON.stringify(event.payload)}`.toLocaleLowerCase().includes(term)));
  roots.activity.innerHTML = `<div class="os-heading-row"><div><div class="eyebrow">MOHIT.OS · ACTIVITY</div><h1 id="activity-heading">Activity history</h1><p class="subtitle">A local timeline of meaningful project, task, and note changes.</p></div></div><div class="os-toolbar os-filter-toolbar"><label class="os-search">Search activity<input type="search" data-activity-search value="${escapeHtml(activitySearch)}" placeholder="Project, task, note, or change"></label><label>Source<select data-activity-source><option value="all">All areas</option>${[['build.projects', 'BUILD'], ['think.notes', 'THINK'], ['plan.tasks', 'PLAN'], ['learn.a2z-dsa', 'LEARN · A2Z']].map(([source, title]) => `<option value="${source}" ${activitySource === source ? 'selected' : ''}>${title}</option>`).join('')}</select></label></div><section class="os-record-list" aria-label="Recent activity">${filtered.length ? filtered.map(event => `<article class="os-activity-row" data-event-id="${escapeHtml(event.eventId)}" id="activity-${escapeHtml(event.eventId)}"><time datetime="${escapeHtml(event.occurredAt)}">${escapeHtml(displayDate(event.occurredAt))}</time><div><strong>${escapeHtml(eventLabel(event))}</strong><small>${escapeHtml(event.sourceModule)} · ${escapeHtml(event.subject.type)}</small></div></article>`).join('') : `<div class="os-empty"><h2>${term || activitySource !== 'all' ? 'No matching activity.' : 'No activity yet.'}</h2><p>Meaningful actions in BUILD, THINK, and PLAN will appear here.</p></div>`}</section>`;
}

function eventLabel(event) {
  const titles = {
    'project.created': `Project created: ${event.payload.name || ''}`,
    'project.updated': 'Project updated',
    'project.status_changed': `Project status changed to ${event.payload.status}`,
    'project.paused': 'Project paused',
    'project.resumed': 'Project resumed',
    'project.completed': 'Project completed',
    'project.resource_added': `Resource added: ${event.payload.title}`,
    'project.resource_updated': `Resource updated: ${event.payload.title}`,
    'project.resource_removed': `Resource removed: ${event.payload.title}`,
    'task.created': `Task created: ${event.payload.title}`,
    'task.updated': `Task updated: ${event.payload.title}`,
    'task.completed': `Task completed: ${event.payload.title}`,
    'task.deleted': `Task deleted: ${event.payload.title}`,
    'note.created': `${event.payload.noteType || 'Note'} created: ${event.payload.title}`,
    'note.updated': `Note updated: ${event.payload.title}`,
    'note.archived': `Note archived: ${event.payload.title}`,
    'note.restored': `Note restored: ${event.payload.title}`,
    'note.deleted': `Note deleted: ${event.payload.title}`
  };
  return titles[event.type] || event.type.replaceAll('.', ' ');
}

function openDialog(id) {
  document.getElementById(id)?.showModal();
}

function openGlobalSearch() {
  const dialog = document.querySelector('#os-search-dialog');
  if (!dialog.open) dialog.showModal();
  const input = dialog.querySelector('[data-global-search]');
  input.value = '';
  dialog.querySelector('[data-search-results]').innerHTML = '<p class="os-muted">Search projects, notes, tasks, and activity.</p>';
  input.focus();
}

function renderSearchGroups(groups) {
  const definitions = [
    ['projects', 'Projects'],
    ['notes', 'Notes'],
    ['tasks', 'Tasks'],
    ['activity', 'Activity']
  ];
  const content = definitions.map(([key, title]) => {
    const results = groups[key];
    if (!results.length) return '';
    return `<section class="os-search-group"><h3>${title} <span>${results.length}</span></h3>${results.map(result => `<button type="button" class="os-search-result" data-search-result="${escapeHtml(result.type)}" data-result-id="${escapeHtml(result.id)}"><strong>${escapeHtml(result.title)}</strong><small>${escapeHtml(result.subtitle || '')}</small></button>`).join('')}</section>`;
  }).join('');
  return content || '<p class="os-muted">No matching results.</p>';
}

async function navigateToSearchResult(resultType, resultId) {
  const dialog = document.querySelector('#os-search-dialog');
  dialog.close();
  if (resultType === 'project') {
    setArea('build');
    document.dispatchEvent(new CustomEvent('mohit-os:open-project', { detail: { projectId: resultId } }));
    return;
  }

  if (resultType === 'note') {
    showArchivedNotes = false;
    noteTypeFilter = 'all';
    noteProjectFilter = 'all';
    noteSearch = '';
    setArea('think');
    await refreshArea();
    document.querySelector(`#note-${CSS.escape(resultId)}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else if (resultType === 'task') {
    showClosedTasks = false;
    planView = 'all';
    setArea('plan');
    await refreshArea();
    document.querySelector(`#task-${CSS.escape(resultId)}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else if (resultType === 'activity') {
    activitySearch = '';
    activitySource = 'all';
    setArea('activity');
    await refreshArea();
    document.querySelector(`#activity-${CSS.escape(resultId)}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

async function refreshArea() {
  if (waiting) return;
  waiting = true;
  try {
    if (currentArea === 'think') await renderThink();
    else if (currentArea === 'plan') await renderPlan();
    else if (currentArea === 'activity') await renderActivity();
  } catch (error) {
    const root = roots[currentArea];
    if (root) {
      root.innerHTML = '<p class="os-feedback is-error" role="alert">Could not load local MOHIT.OS data.</p>';
      console.error('MOHIT.OS module data could not be loaded.', error);
    }
  } finally {
    waiting = false;
  }
}

document.addEventListener('click', event => {
  if (event.target.closest('[data-os-search-open]')) {
    openGlobalSearch();
    return;
  }
  const searchResult = event.target.closest('[data-search-result]');
  if (searchResult) {
    navigateToSearchResult(searchResult.dataset.searchResult, searchResult.dataset.resultId)
      .catch(error => console.error('Could not open the selected search result.', error));
    return;
  }
  const planViewButton = event.target.closest('[data-plan-view]');
  if (planViewButton) {
    planView = planViewButton.dataset.planView;
    refreshArea();
    return;
  }
  const moduleButton = event.target.closest('[data-area-module]');
  if (moduleButton) {
    const area = moduleButton.dataset.areaModule;
    if (area === 'build') {
      setArea('build');
      return;
    }
    if (area === 'learn') {
      setArea('learn');
      location.hash = 'dashboard';
      document.querySelector('[data-page="dashboard"]').click();
      return;
    }
    setArea(area);
    refreshArea();
    return;
  }
  const sectionButton = event.target.closest('[data-os-section]');
  if (sectionButton) {
    const area = sectionButton.dataset.osSection;
    setArea(area);
    refreshArea();
    return;
  }
  const actionButton = event.target.closest('[data-os-action]');
  if (!actionButton) return;
  const action = actionButton.dataset.osAction;
  if (action === 'close-dialog') return actionButton.closest('dialog')?.close();
  if (action === 'new-note') {
    const form = document.querySelector('#note-dialog form');
    delete form.dataset.noteId;
    form.reset();
    form.elements.type.value = actionButton.dataset.noteType || 'Note';
    form.querySelector('[data-dialog-title]').textContent = 'New capture';
    return openDialog('note-dialog');
  }
  if (action === 'new-task') {
    const form = document.querySelector('#plan-task-dialog form');
    delete form.dataset.taskId;
    form.reset();
    form.querySelector('[data-dialog-title]').textContent = 'New task';
    return openDialog('plan-task-dialog');
  }
  if (action === 'toggle-notes') {
    showArchivedNotes = !showArchivedNotes;
    return refreshArea();
  }
  if (action === 'edit-note') {
    repository.getNote(actionButton.dataset.noteId).then(note => note && noteToForm(note)).then(() => openDialog('note-dialog')).catch(error => message(roots.think, error.message, true));
    return;
  }
  if (action === 'edit-task') {
    repository.getTask(actionButton.dataset.taskId).then(task => task && taskToForm(task)).then(() => openDialog('plan-task-dialog')).catch(error => message(roots.plan, error.message, true));
    return;
  }
  const run = async operation => {
    try {
      await operation();
      await refreshArea();
    } catch (error) {
      const root = roots[currentArea];
      if (root) message(root, error.message || 'Could not save this change.', true);
    }
  };
  if (action === 'archive-note') run(() => actions.archiveNote(actionButton.dataset.noteId));
  else if (action === 'restore-note') run(() => actions.updateNote(actionButton.dataset.noteId, { status: 'active', archivedAt: null }));
  else if (action === 'delete-note') run(() => actions.deleteNote(actionButton.dataset.noteId));
  else if (action === 'complete-task') run(() => actions.completeTask(actionButton.dataset.taskId));
  else if (action === 'cancel-task') run(() => actions.cancelTask(actionButton.dataset.taskId));
  else if (action === 'delete-task') run(() => actions.deleteTask(actionButton.dataset.taskId));
});

document.addEventListener('input', event => {
  if (event.target.matches('[data-note-search]')) {
    noteSearch = event.target.value;
    const start = event.target.selectionStart;
    refreshArea().then(() => {
      const input = roots.think.querySelector('[data-note-search]');
      input?.focus();
      input?.setSelectionRange(start, start);
    });
    return;
  }
  if (event.target.matches('[data-activity-search]')) {
    activitySearch = event.target.value;
    const start = event.target.selectionStart;
    refreshArea().then(() => {
      const input = roots.activity.querySelector('[data-activity-search]');
      input?.focus();
      input?.setSelectionRange(start, start);
    });
    return;
  }
  if (event.target.matches('[data-global-search]')) {
    const query = event.target.value;
    const generation = ++globalSearchGeneration;
    if (!query.trim()) {
      document.querySelector('[data-search-results]').innerHTML = '<p class="os-muted">Search projects, notes, tasks, and activity.</p>';
      return;
    }
    if (!actions) {
      document.querySelector('[data-search-results]').innerHTML = '<p class="os-feedback is-error" role="alert">Local MOHIT.OS storage is unavailable.</p>';
      return;
    }
    actions.searchOS(query).then(groups => {
      if (generation === globalSearchGeneration) {
        document.querySelector('[data-search-results]').innerHTML = renderSearchGroups(groups);
      }
    }).catch(error => {
      if (generation === globalSearchGeneration) {
        document.querySelector('[data-search-results]').innerHTML = `<p class="os-feedback is-error" role="alert">${escapeHtml(error.message || 'Search failed.')}</p>`;
      }
    });
  }
});

document.addEventListener('change', event => {
  if (event.target.matches('[data-note-type-filter]')) {
    noteTypeFilter = event.target.value;
    refreshArea();
  } else if (event.target.matches('[data-note-project-filter]')) {
    noteProjectFilter = event.target.value;
    refreshArea();
  } else if (event.target.matches('[data-plan-view]')) {
    planView = event.target.dataset.planView;
    refreshArea();
  } else if (event.target.matches('[data-show-closed]')) {
    showClosedTasks = event.target.checked;
    refreshArea();
  } else if (event.target.matches('[data-activity-source]')) {
    activitySource = event.target.value;
    refreshArea();
  }
});

document.addEventListener('submit', event => {
  const form = event.target.closest('form[data-os-form]');
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form);
  const submit = async () => {
    try {
      if (form.dataset.osForm === 'note') {
        const changes = {
          type: data.get('type'),
          title: data.get('title'),
          content: data.get('content'),
          projectId: data.get('projectId') || null,
          tags: String(data.get('tags') || '').split(',').map(tag => tag.trim()).filter(Boolean)
        };
        if (form.dataset.noteId) await actions.updateNote(form.dataset.noteId, changes);
        else await actions.createNote(changes);
      } else {
        const changes = {
          title: data.get('title'),
          status: data.get('status'),
          priority: data.get('priority'),
          projectId: data.get('projectId') || null,
          dueAt: dateTimeInputIso(data.get('dueAt'))
        };
        if (form.dataset.taskId) await actions.updateTask(form.dataset.taskId, changes);
        else await actions.createTask(changes);
      }
      form.closest('dialog').close();
      await refreshArea();
    } catch (error) {
      message(roots[currentArea], error.message || 'Could not save this change.', true);
    } finally {
      delete form.dataset.noteId;
      delete form.dataset.taskId;
    }
  };
  submit();
});

async function initialize() {
  try {
    [repository, actions] = await Promise.all([window.MOHIT_OS_FOUNDATION_READY, window.MOHIT_OS_ACTIONS_READY]);
    if (!repository || !actions) return;
    const hashArea = location.hash.slice(1).split('/')[0];
    if (['think', 'plan', 'activity'].includes(hashArea)) {
      setArea(hashArea);
      await refreshArea();
    }
  } catch (error) {
    console.error('MOHIT.OS modules could not initialize.', error);
  }
}

initialize();
