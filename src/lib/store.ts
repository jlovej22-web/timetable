export type ProjectStatus = '준비 중' | '진행 중' | '완료';

export interface SchoolProject {
  id: string;
  schoolName: string;
  schoolYear: number;
  semester: 1 | 2;
  projectName: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'school_timetable_projects';

// Determine if we are in Electron preload environment
const getApi = () => (window as any).schoolTimetable?.projects;

export const projectStore = {
  async getProjects(): Promise<SchoolProject[]> {
    const api = getApi();
    if (api) return api.getProjects();
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  },
  async getProject(id: string): Promise<SchoolProject | undefined> {
    const projects = await this.getProjects();
    return projects.find((p: SchoolProject) => p.id === id);
  },
  async createProject(project: Omit<SchoolProject, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<SchoolProject> {
    const api = getApi();
    if (api) return api.createProject(project);
    const projects = await this.getProjects();
    const now = new Date().toISOString();
    const newProject: SchoolProject = {
      ...project,
      status: '준비 중',
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...projects, newProject]));
    return newProject;
  },
  async updateProject(id: string, updates: Partial<SchoolProject>): Promise<SchoolProject> {
    const api = getApi();
    if (api) return api.updateProject(id, updates);
    const projects = await this.getProjects();
    const index = projects.findIndex((p: SchoolProject) => p.id === id);
    if (index === -1) throw new Error('프로젝트를 찾을 수 없습니다.');
    const updated = { ...projects[index], ...updates, updatedAt: new Date().toISOString() };
    projects[index] = updated;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    return updated;
  },
  async deleteProject(id: string): Promise<void> {
    const api = getApi();
    if (api) return api.deleteProject(id);
    const projects = await this.getProjects();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects.filter((p: SchoolProject) => p.id !== id)));
  }
};
