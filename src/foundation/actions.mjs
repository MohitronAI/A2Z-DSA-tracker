const A2Z_PROGRESS_KEY = 'striver-a2z-progress-v1';
const REQUIRED_ACTIONS = [
  'readProject', 'createProject', 'updateProject', 'createTask', 'updateTask',
  'completeTask', 'createNote', 'updateNote', 'createReminder', 'setProjectNextAction', 'search',
  'queryActivity', 'queryA2ZProgress'
];

function requireText(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a non-empty string.`);
  return value;
}

export function actionServiceContract(actions) {
  return REQUIRED_ACTIONS.filter(name => typeof actions?.[name] !== 'function');
}

export function createMohitOsActions(repository, { storage = globalThis.localStorage } = {}) {
  if (!repository) throw new TypeError('A Foundation repository is required.');

  async function search(query, { includeArchived = false } = {}) {
    const term = String(query || '').trim().toLocaleLowerCase();
    if (!term) return [];
    const [projects, tasks, notes] = await Promise.all([
      repository.listProjects({ includeArchived }),
      repository.listTasks(),
      repository.listNotes({ status: includeArchived ? undefined : 'active' })
    ]);
    const results = [];
    for (const project of projects) {
      const resources = project.resources.map(resource => `${resource.title} ${resource.url}`).join(' ');
      if (`${project.name} ${project.description} ${project.currentState} ${project.blockers.join(' ')} ${resources}`.toLocaleLowerCase().includes(term)) {
        results.push({ type: 'project', id: project.projectId, title: project.name, subtitle: project.currentState, updatedAt: project.updatedAt, projectId: project.projectId });
      }
    }
    for (const task of tasks) {
      if (!includeArchived && ['completed', 'cancelled'].includes(task.status)) continue;
      if (task.title.toLocaleLowerCase().includes(term)) {
        results.push({ type: 'task', id: task.taskId, title: task.title, subtitle: task.status, updatedAt: task.updatedAt, projectId: task.projectId });
      }
    }
    for (const note of notes) {
      if (`${note.title} ${note.content} ${note.tags.join(' ')}`.toLocaleLowerCase().includes(term)) {
        results.push({ type: 'note', id: note.noteId, title: note.title, subtitle: note.tags.join(', '), updatedAt: note.updatedAt, projectId: note.projectId });
      }
    }
    return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
  }

  async function queryA2ZProgress() {
    if (!storage || typeof storage.getItem !== 'function') {
      throw new Error('A2Z progress storage is unavailable.');
    }
    const raw = storage.getItem(A2Z_PROGRESS_KEY);
    if (raw === null) return { schemaVersion: 2, progress: {} };
    let state;
    try {
      state = JSON.parse(raw);
    } catch {
      throw new Error('A2Z progress storage contains invalid JSON.');
    }
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      throw new Error('A2Z progress storage has an invalid record.');
    }
    const progress = state.completed || state.progress || {};
    if (!progress || typeof progress !== 'object' || Array.isArray(progress)) {
      throw new Error('A2Z progress map has an invalid record.');
    }
    return {
      schemaVersion: 2,
      progress: Object.fromEntries(Object.entries(progress).map(([lessonId, entry]) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [lessonId, null];
        return [lessonId, {
          completed: entry.completed === true,
          firstStartedAt: entry.firstStartedAt ?? null,
          completedAt: entry.completedAt ?? null,
          lastActivityAt: entry.lastActivityAt ?? null,
          revisionId: typeof entry.revisionId === 'string' ? entry.revisionId : ''
        }];
      }).filter(([, entry]) => entry !== null))
    };
  }

  return Object.freeze({
    readProject: projectId => repository.getProject(requireText(projectId, 'projectId')),
    createProject: input => repository.createProject(input),
    updateProject: (projectId, changes) => repository.updateProject(requireText(projectId, 'projectId'), changes),
    addProjectResource: (projectId, input) => repository.addProjectResource(projectId, input),
    updateProjectResource: (projectId, resourceId, input) => repository.updateProjectResource(projectId, resourceId, input),
    removeProjectResource: (projectId, resourceId) => repository.removeProjectResource(projectId, resourceId),
    setProjectNextAction: (projectId, taskId) => repository.setProjectNextAction(projectId, taskId),
    createTask: input => repository.createTask({ ...input, sourceModule: input.sourceModule || 'plan.tasks' }),
    updateTask: (taskId, changes = {}) => repository.updateTask(requireText(taskId, 'taskId'), { ...changes, sourceModule: changes.sourceModule || 'plan.tasks' }),
    completeTask: (taskId, { sourceModule = 'plan.tasks' } = {}) => repository.updateTask(requireText(taskId, 'taskId'), { status: 'completed', sourceModule }),
    cancelTask: taskId => repository.updateTask(requireText(taskId, 'taskId'), { status: 'cancelled', sourceModule: 'plan.tasks' }),
    deleteTask: taskId => repository.deleteTask(requireText(taskId, 'taskId'), { sourceModule: 'plan.tasks' }),
    createNote: input => repository.createNote(input),
    updateNote: (noteId, changes) => repository.updateNote(requireText(noteId, 'noteId'), changes),
    archiveNote: noteId => repository.archiveNote(requireText(noteId, 'noteId')),
    deleteNote: noteId => repository.deleteNote(requireText(noteId, 'noteId')),
    createReminder: input => {
      const dueAt = input.dueAt ?? input.remindAt;
      if (!dueAt) throw new TypeError('A reminder requires a dueAt or remindAt value.');
      return repository.createTask({ ...input, dueAt, sourceModule: 'plan.tasks' });
    },
    search,
    queryActivity: options => repository.queryEvents(options),
    queryA2ZProgress
  });
}
