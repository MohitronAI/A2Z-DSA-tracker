const SOURCE_MODULE = 'build.projects';
const root = document.querySelector('#build-app');
const buildPage = document.querySelector('#build-page');
const learnNavigation = document.querySelector('[data-area-nav="learn"]');
const buildNavigation = document.querySelector('[data-area-nav="build"]');
const learnLabel = document.querySelector('[data-area-label="learn"]');
const buildLabel = document.querySelector('[data-area-label="build"]');
const areaTabs = [...document.querySelectorAll('.os-area')];
const projectsById = new Map();
let repository = null;
let currentProjectId = null;
let busy = false;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

function formatDate(value) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Not set';
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function dateInputValue(value) {
  return value ? value.slice(0, 10) : '';
}

function dateInputIso(value) {
  return value ? new Date(`${value}T12:00:00.000Z`).toISOString() : null;
}

function setArea(area) {
  const isBuild = area === 'build';
  buildPage.classList.toggle('active', isBuild);
  learnNavigation.hidden = isBuild;
  learnLabel.hidden = isBuild;
  buildNavigation.hidden = !isBuild;
  buildLabel.hidden = !isBuild;
  areaTabs.forEach(tab => {
    const active = isBuild ? tab.hasAttribute('data-build-nav') : tab.textContent.trim() === 'LEARN';
    tab.classList.toggle('active', active);
    if (active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
  if (isBuild) {
    document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page === buildPage));
    document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.hasAttribute('data-build-nav')));
    const crumb = document.querySelector('.breadcrumb');
    crumb.setAttribute('aria-label', 'MOHIT.OS, BUILD, Projects');
    crumb.innerHTML = `<span>MOHIT.OS</span><span>/</span><span>BUILD</span><span>/</span><b>Projects</b><span class="breadcrumb-page-separator">/</span><b id="crumb-current">${currentProjectId ? 'Project' : 'Projects'}</b>`;
    location.hash = currentProjectId ? `build-project/${encodeURIComponent(currentProjectId)}` : 'build-projects';
  } else {
    const crumb = document.querySelector('.breadcrumb');
    crumb.setAttribute('aria-label', 'MOHIT.OS, LEARN, A2Z DSA');
    crumb.innerHTML = '<span>MOHIT.OS</span><span>/</span><span>LEARN</span><span>/</span><b>A2Z DSA</b><span class="breadcrumb-page-separator">/</span><b id="crumb-current">Dashboard</b>';
  }
}

function setMessage(message, isError = false) {
  const target = root.querySelector('[data-build-feedback]');
  if (!target) return;
  target.textContent = message;
  target.classList.toggle('is-error', isError);
}

function showError(error) {
  setMessage(error instanceof Error ? error.message : 'Could not save this change. Please try again.', true);
}

function projectCard(project, tasks) {
  const nextAction = tasks.find(task => task.taskId === project.nextActionId);
  return `<button class="build-project-card" type="button" data-open-project="${escapeHtml(project.projectId)}">
    <span class="build-project-title">${escapeHtml(project.name)}</span>
    <span class="build-badges"><span class="build-badge status-${project.status}">${escapeHtml(project.status.replace('_', ' '))}</span><span class="build-badge importance-${project.importance}">${escapeHtml(project.importance)}</span></span>
    <span class="build-card-label">CURRENT</span><span class="build-card-state">${escapeHtml(project.currentState || 'Add a short note about where you stopped.')}</span>
    <span class="build-card-label">NEXT ACTION</span><span class="build-card-next">${escapeHtml(nextAction?.title || 'Choose a task as the next action')}</span>
    <span class="build-card-meta"><span>Last activity ${escapeHtml(formatDate(project.lastActivityAt))}</span><span>Review ${escapeHtml(formatDate(project.nextReviewAt))}</span></span>
  </button>`;
}

async function renderProjectList() {
  currentProjectId = null;
  if (buildPage.classList.contains('active')) {
    location.hash = 'build-projects';
    document.querySelector('#crumb-current').textContent = 'Projects';
  }
  const projects = await repository.listProjects();
  projectsById.clear();
  projects.forEach(project => projectsById.set(project.projectId, project));
  const cards = await Promise.all(projects.map(async project => projectCard(project, await repository.listTasks({ projectId: project.projectId }))));
  const activeProjects = projects.filter(project => project.status === 'active');
  const otherProjects = projects.filter(project => project.status !== 'active');
  root.innerHTML = `<div class="build-heading-row">
    <div><div class="eyebrow">BUILD · PROJECTS</div><h1 id="build-heading">Projects</h1><p class="subtitle">Pick up where you left off.</p></div>
    <button class="primary-button" type="button" data-action="new-project">＋ New Project</button>
  </div>
  <p class="build-feedback" data-build-feedback role="status"></p>
  ${projects.length ? `${activeProjects.length ? `<section class="build-project-section"><div class="build-section-heading"><h2>Active Projects</h2><span>${activeProjects.length}</span></div><div class="build-project-grid" aria-label="Active projects">${activeProjects.map(project => cards[projects.indexOf(project)]).join('')}</div></section>` : ''}
    ${otherProjects.length ? `<section class="build-project-section"><div class="build-section-heading"><h2>${activeProjects.length ? 'Paused & completed' : 'Projects'}</h2><span>${otherProjects.length}</span></div><div class="build-project-grid" aria-label="Other projects">${otherProjects.map(project => cards[projects.indexOf(project)]).join('')}</div></section>` : ''}`
    : `<section class="build-empty"><span class="build-empty-mark">▣</span><h2>No projects yet.</h2><p>Create a project to remember where you stopped and what to do next.</p><button class="primary-button" type="button" data-action="new-project">＋ Create your first project</button></section>`}
  <dialog class="build-dialog" id="project-dialog">
    <form data-form="project">
      <div class="build-dialog-heading"><div><div class="eyebrow">BUILD · PROJECT</div><h2 data-dialog-title>New Project</h2></div><button class="build-icon-button" type="button" data-action="close-dialog" aria-label="Close">×</button></div>
      <label>Project name<input name="name" required maxlength="120" placeholder="e.g. VisionGuide"></label>
      <label>Importance<select name="importance"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option></select></label>
      <label>Current state<textarea name="currentState" rows="3" maxlength="1200" placeholder="Where did you stop?"></textarea></label>
      <label>Blockers <span class="build-field-hint">One per line</span><textarea name="blockers" rows="2" maxlength="1200" placeholder="Anything in the way?"></textarea></label>
      <label>Next review<input name="nextReviewAt" type="date"></label>
      <div class="build-dialog-actions"><button class="secondary-button" type="button" data-action="close-dialog">Cancel</button><button class="primary-button" type="submit">Save Project</button></div>
    </form>
  </dialog>`;
}

function eventLabel(event) {
  const title = event.payload?.title || event.payload?.name;
  const messages = {
    'project.created': title ? `Created ${title}` : 'Created project',
    'project.updated': 'Updated project details',
    'project.state_updated': 'Updated current state',
    'project.status_changed': `Project ${event.payload?.status || 'status updated'}`,
    'project.next_action_changed': event.payload?.taskId ? 'Changed the Next Action' : 'Cleared the Next Action',
    'task.created': title ? `Created task: ${title}` : 'Created a task',
    'task.completed': title ? `Completed task: ${title}` : 'Completed a task',
    'task.updated': title ? `Updated task: ${title}` : 'Updated a task'
  };
  return messages[event.type] || event.type.replaceAll('.', ' ');
}

function taskRow(task, project) {
  const selected = project.nextActionId === task.taskId;
  return `<article class="build-task ${selected ? 'is-next-action' : ''}">
    <div class="build-task-main">
      <span class="build-task-title">${escapeHtml(task.title)}</span>
      <span class="build-task-meta"><span>${escapeHtml(task.status.replace('_', ' '))}</span><span>${escapeHtml(task.priority)} priority</span>${task.dueAt ? `<span>Due ${escapeHtml(formatDate(task.dueAt))}</span>` : ''}${task.scheduledAt ? `<span>Scheduled ${escapeHtml(formatDate(task.scheduledAt))}</span>` : ''}</span>
    </div>
    <div class="build-task-actions">
      <button class="text-button" type="button" data-action="edit-task" data-task-id="${escapeHtml(task.taskId)}">Edit</button>
      ${task.status !== 'completed' && task.status !== 'cancelled' ? `<button class="text-button" type="button" data-action="complete-task" data-task-id="${escapeHtml(task.taskId)}">Complete</button>` : ''}
      ${selected ? '<span class="build-next-label">NEXT</span>' : task.status !== 'completed' && task.status !== 'cancelled' ? `<button class="text-button" type="button" data-action="set-next" data-task-id="${escapeHtml(task.taskId)}">Set next</button>` : ''}
    </div>
  </article>`;
}

async function renderProjectDetail(projectId) {
  let project = await repository.getProject(projectId);
  if (!project) {
    setMessage('That project could not be found.', true);
    await renderProjectList();
    return;
  }
  currentProjectId = projectId;
  const tasks = await repository.listTasks({ projectId });
  const events = await repository.queryProjectActivity(projectId, { limit: 200 });
  const nextAction = tasks.find(task => task.taskId === project.nextActionId);
  const taskOptions = tasks.filter(task => task.status !== 'completed' && task.status !== 'cancelled');
  root.innerHTML = `<button class="build-back-link" type="button" data-action="back-projects">← All projects</button>
  <div class="build-detail-heading">
    <div><div class="eyebrow">BUILD · PROJECT</div><h1 id="build-heading">${escapeHtml(project.name)}</h1><div class="build-badges"><span class="build-badge status-${project.status}">${escapeHtml(project.status.replace('_', ' '))}</span><span class="build-badge importance-${project.importance}">${escapeHtml(project.importance)}</span></div></div>
    <button class="secondary-button" type="button" data-action="edit-project">Edit Project</button>
  </div>
  <p class="build-feedback" data-build-feedback role="status"></p>
  <section class="build-next-panel"><div class="build-panel-eyebrow">NEXT ACTION</div>${nextAction ? `<strong>→ ${escapeHtml(nextAction.title)}</strong><small>${escapeHtml(nextAction.status.replace('_', ' '))}</small>` : '<strong>No next action selected</strong><small>Choose a task below. MOHIT.OS will not invent one.</small>'}</section>
  <div class="build-detail-grid">
    <section class="build-panel"><div class="build-panel-heading"><div><div class="eyebrow">CURRENT STATE</div><h2>Where things stand</h2></div><button class="text-button" type="button" data-action="edit-state">Edit</button></div><p class="build-prose">${escapeHtml(project.currentState || 'No current state recorded yet.')}</p></section>
    <section class="build-panel"><div class="build-panel-heading"><div><div class="eyebrow">NEXT REVIEW</div><h2>${escapeHtml(formatDate(project.nextReviewAt))}</h2></div><button class="text-button" type="button" data-action="edit-review">Change</button></div><p class="build-prose">Set a date to review this project again.</p></section>
    <section class="build-panel"><div class="build-panel-heading"><div><div class="eyebrow">BLOCKERS</div><h2>${project.blockers.length ? `${project.blockers.length} to resolve` : 'No blockers'}</h2></div><button class="text-button" type="button" data-action="edit-blockers">Edit</button></div>${project.blockers.length ? `<ul class="build-blockers">${project.blockers.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p class="build-prose">Nothing is blocking progress right now.</p>'}</section>
    <section class="build-panel build-tasks-panel"><div class="build-panel-heading"><div><div class="eyebrow">PROJECT TASKS</div><h2>Tasks <span class="build-count">${tasks.length}</span></h2></div><button class="secondary-button" type="button" data-action="new-task">＋ Add Task</button></div>
      ${tasks.length ? `<div class="build-task-list">${tasks.map(task => taskRow(task, project)).join('')}</div>` : '<p class="build-prose">No tasks yet. Add the first concrete step when you are ready.</p>'}
      ${taskOptions.length ? `<label class="build-next-select">Set Next Action<select data-action="select-next"><option value="">Choose a task…</option>${taskOptions.map(task => `<option value="${escapeHtml(task.taskId)}" ${project.nextActionId === task.taskId ? 'selected' : ''}>${escapeHtml(task.title)}</option>`).join('')}</select></label>` : ''}
    </section>
    <section class="build-panel build-history-panel"><div class="build-panel-heading"><div><div class="eyebrow">ACTIVITY</div><h2>History</h2></div><span class="build-history-count">${events.length} events</span></div>
      ${events.length ? `<ol class="build-history">${events.map(event => `<li><time datetime="${escapeHtml(event.occurredAt)}">${escapeHtml(formatDate(event.occurredAt))}</time><span>${escapeHtml(eventLabel(event))}</span></li>`).join('')}</ol>` : '<p class="build-prose">Project activity will appear here as you work.</p>'}
    </section>
  </div>
  <dialog class="build-dialog" id="project-dialog"><form data-form="project-edit">
    <div class="build-dialog-heading"><div><div class="eyebrow">BUILD · PROJECT</div><h2>Edit Project</h2></div><button class="build-icon-button" type="button" data-action="close-dialog" aria-label="Close">×</button></div>
    <label>Project name<input name="name" required maxlength="120" value="${escapeHtml(project.name)}"></label>
    <div class="build-form-row"><label>Status<select name="status">${['active','paused','completed','archived'].map(value => `<option value="${value}" ${project.status === value ? 'selected' : ''}>${value.replace('_', ' ')}</option>`).join('')}</select></label><label>Importance<select name="importance">${['low','medium','high'].map(value => `<option value="${value}" ${project.importance === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label></div>
    <label>Current state<textarea name="currentState" rows="4" maxlength="1200">${escapeHtml(project.currentState)}</textarea></label>
    <label>Blockers <span class="build-field-hint">One per line</span><textarea name="blockers" rows="3" maxlength="1200">${escapeHtml(project.blockers.join('\n'))}</textarea></label>
    <label>Next review<input name="nextReviewAt" type="date" value="${dateInputValue(project.nextReviewAt)}"></label>
    <div class="build-dialog-actions"><button class="secondary-button" type="button" data-action="close-dialog">Cancel</button><button class="primary-button" type="submit">Save Changes</button></div>
  </form></dialog>
  <dialog class="build-dialog" id="task-dialog"><form data-form="task">
    <div class="build-dialog-heading"><div><div class="eyebrow">BUILD · TASK</div><h2 data-dialog-title>New Task</h2></div><button class="build-icon-button" type="button" data-action="close-dialog" aria-label="Close">×</button></div>
    <label>Task title<input name="title" required maxlength="200" placeholder="A clear next step"></label>
    <div class="build-form-row"><label>Priority<select name="priority"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option></select></label><label>Status<select name="status"><option value="todo">To do</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label></div>
    <div class="build-form-row"><label>Due date<input name="dueAt" type="date"></label><label>Scheduled for<input name="scheduledAt" type="date"></label></div>
    <div class="build-dialog-actions"><button class="secondary-button" type="button" data-action="close-dialog">Cancel</button><button class="primary-button" type="submit">Create Task</button></div>
  </form></dialog>`;
}

async function refresh() {
  if (!repository || busy) return;
  try {
    if (currentProjectId) await renderProjectDetail(currentProjectId);
    else await renderProjectList();
  } catch (error) {
    showError(error);
  }
}

function openDialog(id) {
  const dialog = document.getElementById(id);
  if (dialog && !dialog.open) dialog.showModal();
}

function closeDialogs() {
  document.querySelectorAll('.build-dialog[open]').forEach(dialog => dialog.close());
}

async function perform(action) {
  if (busy) return;
  busy = true;
  try {
    await action();
  } catch (error) {
    showError(error);
  } finally {
    busy = false;
    if (buildPage.classList.contains('active')) await refresh();
  }
}

document.addEventListener('click', event => {
  const areaSwitch = event.target.closest('[data-area-switch="learn"]');
  if (areaSwitch) {
    location.hash = 'dashboard';
    document.querySelector('[data-page="dashboard"]').click();
    return;
  }
  const button = event.target.closest('[data-build-nav]');
  if (button) {
    event.preventDefault();
    if (!repository) return setMessage('Local project storage is unavailable. Refresh to try again.', true);
    setArea('build');
    location.hash = currentProjectId
      ? `build-project/${encodeURIComponent(currentProjectId)}`
      : 'build-projects';
    perform(() => currentProjectId ? renderProjectDetail(currentProjectId) : renderProjectList());
    return;
  }
  const pageButton = event.target.closest('[data-page]');
  if (pageButton) {
    location.hash = 'dashboard';
    buildPage.classList.remove('active');
    learnNavigation.hidden = false;
    learnLabel.hidden = false;
    buildNavigation.hidden = true;
    buildLabel.hidden = true;
    areaTabs.forEach(tab => {
      const active = tab.textContent.trim() === 'LEARN';
      tab.classList.toggle('active', active);
      if (active) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
    const crumb = document.querySelector('.breadcrumb');
    crumb.setAttribute('aria-label', 'MOHIT.OS, LEARN, A2Z DSA');
    crumb.innerHTML = `<span>MOHIT.OS</span><span>/</span><span>LEARN</span><span>/</span><b>A2Z DSA</b><span class="breadcrumb-page-separator">/</span><b id="crumb-current">${pageButton.dataset.page}</b>`;
    return;
  }
  const projectCardButton = event.target.closest('[data-open-project]');
  if (projectCardButton) {
    currentProjectId = projectCardButton.dataset.openProject;
    document.querySelector('#crumb-current').textContent = 'Project';
    location.hash = `build-project/${encodeURIComponent(currentProjectId)}`;
    perform(() => renderProjectDetail(currentProjectId));
    return;
  }
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;
  const actionName = actionButton.dataset.action;
  if (actionName === 'close-dialog') return closeDialogs();
  if (actionName === 'new-project') return openDialog('project-dialog');
  if (actionName === 'back-projects') {
    location.hash = 'build-projects';
    return perform(renderProjectList);
  }
  if (actionName === 'edit-project' || actionName === 'edit-state' || actionName === 'edit-review' || actionName === 'edit-blockers') return openDialog('project-dialog');
  if (actionName === 'new-task') return openDialog('task-dialog');
  if (actionName === 'complete-task') return perform(async () => { await repository.completeTask(actionButton.dataset.taskId); });
  if (actionName === 'set-next') return perform(async () => { await repository.setProjectNextAction(currentProjectId, actionButton.dataset.taskId); });
  if (actionName === 'edit-task') {
    repository.getTask(actionButton.dataset.taskId).then(task => {
      if (!task) throw new Error('That task could not be found.');
      const form = document.querySelector('#task-dialog form');
      form.dataset.form = 'task-edit';
      form.dataset.taskId = task.taskId;
      form.querySelector('[data-dialog-title]').textContent = 'Edit Task';
      form.querySelector('input[name="title"]').value = task.title;
      form.querySelector('select[name="priority"]').value = task.priority;
      form.querySelector('select[name="status"]').value = task.status;
      form.querySelector('input[name="dueAt"]').value = dateInputValue(task.dueAt);
      form.querySelector('input[name="scheduledAt"]').value = dateInputValue(task.scheduledAt);
      form.querySelector('button[type="submit"]').textContent = 'Save Task';
      openDialog('task-dialog');
    }).catch(showError);
  }
});

document.addEventListener('change', event => {
  const select = event.target.closest('[data-action="select-next"]');
  if (select) perform(async () => { await repository.setProjectNextAction(currentProjectId, select.value || null); });
});

document.addEventListener('submit', event => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form);
  if (form.dataset.form === 'project') {
    perform(async () => {
      const project = await repository.createProject({
        name: data.get('name'),
        importance: data.get('importance'),
        currentState: data.get('currentState'),
        blockers: String(data.get('blockers') || '').split('\n').map(value => value.trim()).filter(Boolean),
        nextReviewAt: dateInputIso(data.get('nextReviewAt'))
      });
      currentProjectId = project.projectId;
      location.hash = `build-project/${encodeURIComponent(project.projectId)}`;
      document.querySelector('#crumb-current').textContent = 'Project';
      closeDialogs();
      await renderProjectDetail(project.projectId);
    });
  } else if (form.dataset.form === 'project-edit') {
    perform(async () => {
      await repository.updateProject(currentProjectId, {
        name: data.get('name'),
        status: data.get('status'),
        importance: data.get('importance'),
        currentState: data.get('currentState'),
        blockers: String(data.get('blockers') || '').split('\n').map(value => value.trim()).filter(Boolean),
        nextReviewAt: dateInputIso(data.get('nextReviewAt'))
      });
      closeDialogs();
    });
  } else if (form.dataset.form === 'task') {
    perform(async () => {
      await repository.createTask({
        title: data.get('title'),
        priority: data.get('priority'),
        status: data.get('status'),
        dueAt: dateInputIso(data.get('dueAt')),
        scheduledAt: dateInputIso(data.get('scheduledAt')),
        projectId: currentProjectId
      });
      closeDialogs();
    });
  } else if (form.dataset.form === 'task-edit') {
    perform(async () => {
      await repository.updateTask(form.dataset.taskId, {
        title: data.get('title'),
        priority: data.get('priority'),
        status: data.get('status'),
        dueAt: dateInputIso(data.get('dueAt')),
        scheduledAt: dateInputIso(data.get('scheduledAt'))
      });
      form.dataset.form = 'task';
      delete form.dataset.taskId;
      closeDialogs();
    });
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && buildPage.classList.contains('active')) closeDialogs();
});

async function initialize() {
  try {
    repository = await window.MOHIT_OS_FOUNDATION_READY;
    if (!repository) {
      root.innerHTML = '<p class="build-message is-error">Local project storage is unavailable. The A2Z tracker remains available.</p>';
      return;
    }
    const match = location.hash.match(/^#build-project\/(.+)$/);
    if (match) currentProjectId = decodeURIComponent(match[1]);
    if (location.hash.startsWith('#build-')) {
      setArea('build');
      await refresh();
    }
  } catch (error) {
    root.innerHTML = `<p class="build-message is-error">${escapeHtml(error.message || 'Could not initialize BUILD storage.')}</p>`;
  }
}

initialize();
