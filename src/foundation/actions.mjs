const A2Z_PROGRESS_KEY = 'striver-a2z-progress-v1';
const REQUIRED_ACTIONS = [
  'readProject', 'listProjects', 'createProject', 'updateProject',
  'readTask', 'listTasks', 'createTask', 'updateTask', 'completeTask',
  'readNote', 'listNotes', 'createNote', 'updateNote',
  'addProjectResource', 'updateProjectResource', 'removeProjectResource',
  'setProjectNextAction', 'createReminder', 'searchOS', 'search',
  'queryActivity', 'queryA2ZProgress'
];

function requireText(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a non-empty string.`);
  return value;
}

function eventTitle(event) {
  return event.payload?.title || event.payload?.name || event.type.replaceAll('.', ' ');
}

function sortResults(results) {
  return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)
    || a.type.localeCompare(b.type)
    || a.id.localeCompare(b.id));
}

export function actionServiceContract(actions) {
  return REQUIRED_ACTIONS.filter(name => typeof actions?.[name] !== 'function');
}

export function createMohitOsActions(repository, { storage = globalThis.localStorage } = {}) {
  if (!repository) throw new TypeError('A Foundation repository is required.');

  async function searchOS(query, { includeArchived = false } = {}) {
    const term = String(query || '').trim().toLocaleLowerCase();
    const groups = { projects: [], notes: [], tasks: [], activity: [] };
    if (!term) return groups;

    const [projects, tasks, notes, events] = await Promise.all([
      repository.listProjects({ includeArchived }),
      repository.listTasks(),
      repository.listNotes({ status: includeArchived ? undefined : 'active' }),
      repository.queryEvents({ limit: 1000 })
    ]);
    const projectNames = new Map(projects.map(project => [project.projectId, project.name]));

    for (const project of projects) {
      const resources = project.resources.map(resource => `${resource.title} ${resource.url}`).join(' ');
      if (`${project.name} ${project.description} ${project.currentState} ${project.blockers.join(' ')} ${resources}`.toLocaleLowerCase().includes(term)) {
        groups.projects.push({ type: 'project', id: project.projectId, title: project.name, subtitle: project.currentState, updatedAt: project.updatedAt, projectId: project.projectId });
      }
    }
    for (const task of tasks) {
      if (!includeArchived && ['completed', 'cancelled'].includes(task.status)) continue;
      const projectName = projectNames.get(task.projectId) || '';
      if (`${task.title} ${projectName}`.toLocaleLowerCase().includes(term)) {
        groups.tasks.push({ type: 'task', id: task.taskId, title: task.title, subtitle: `${task.status}${projectName ? ` · ${projectName}` : ''}`, updatedAt: task.updatedAt, projectId: task.projectId });
      }
    }
    for (const note of notes) {
      const projectName = projectNames.get(note.projectId) || '';
      if (`${note.type} ${note.title} ${note.content} ${note.tags.join(' ')} ${projectName}`.toLocaleLowerCase().includes(term)) {
        groups.notes.push({ type: 'note', id: note.noteId, title: note.title, subtitle: `${note.type}${projectName ? ` · ${projectName}` : ''}${note.tags.length ? ` · ${note.tags.join(', ')}` : ''}`, updatedAt: note.updatedAt, projectId: note.projectId });
      }
    }
    for (const event of events) {
      const relatedProject = event.subject.type === 'project'
        ? event.subject.id
        : event.relatedEntities.find(entity => entity.type === 'project')?.id || null;
      const searchable = `${event.type} ${event.sourceModule} ${event.subject.type} ${projectNames.get(relatedProject) || ''} ${JSON.stringify(event.payload)}`.toLocaleLowerCase();
      if (searchable.includes(term)) {
        groups.activity.push({
          type: 'activity',
          id: event.eventId,
          title: eventTitle(event),
          subtitle: `${event.type} · ${event.sourceModule}`,
          updatedAt: event.occurredAt,
          projectId: relatedProject
        });
      }
    }
    for (const group of Object.values(groups)) sortResults(group);
    return groups;
  }

  async function search(query, options) {
    const groups = await searchOS(query, options);
    return sortResults(Object.values(groups).flat());
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
    listProjects: options => repository.listProjects(options),
    createProject: input => repository.createProject(input),
    updateProject: (projectId, changes) => repository.updateProject(requireText(projectId, 'projectId'), changes),
    addProjectResource: (projectId, input) => repository.addProjectResource(requireText(projectId, 'projectId'), input),
    updateProjectResource: (projectId, resourceId, input) => repository.updateProjectResource(requireText(projectId, 'projectId'), requireText(resourceId, 'resourceId'), input),
    removeProjectResource: (projectId, resourceId) => repository.removeProjectResource(requireText(projectId, 'projectId'), requireText(resourceId, 'resourceId')),
    setProjectNextAction: (projectId, taskId) => repository.setProjectNextAction(requireText(projectId, 'projectId'), taskId === null ? null : requireText(taskId, 'taskId')),
    readTask: taskId => repository.getTask(requireText(taskId, 'taskId')),
    listTasks: options => repository.listTasks(options),
    createTask: input => repository.createTask({ ...input, sourceModule: input.sourceModule || 'plan.tasks' }),
    updateTask: (taskId, changes = {}) => repository.updateTask(requireText(taskId, 'taskId'), { ...changes, sourceModule: changes.sourceModule || 'plan.tasks' }),
    completeTask: (taskId, { sourceModule = 'plan.tasks' } = {}) => repository.updateTask(requireText(taskId, 'taskId'), { status: 'completed', sourceModule }),
    cancelTask: taskId => repository.updateTask(requireText(taskId, 'taskId'), { status: 'cancelled', sourceModule: 'plan.tasks' }),
    deleteTask: taskId => repository.deleteTask(requireText(taskId, 'taskId'), { sourceModule: 'plan.tasks' }),
    readNote: noteId => repository.getNote(requireText(noteId, 'noteId')),
    listNotes: options => repository.listNotes(options),
    createNote: input => repository.createNote(input),
    updateNote: (noteId, changes) => repository.updateNote(requireText(noteId, 'noteId'), changes),
    archiveNote: noteId => repository.archiveNote(requireText(noteId, 'noteId')),
    deleteNote: noteId => repository.deleteNote(requireText(noteId, 'noteId')),
    createReminder: input => {
      const dueAt = input.dueAt ?? input.remindAt;
      if (!dueAt) throw new TypeError('A reminder requires a dueAt or remindAt value.');
      return repository.createTask({ ...input, dueAt, sourceModule: 'plan.tasks' });
    },
    searchOS,
    search,
    queryActivity: options => repository.queryEvents(options),
    queryA2ZProgress
  });
}
