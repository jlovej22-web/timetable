import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ProjectDatabase } from './database.js';
import type { BaseEntity, BaseRecord, ProjectInput, SchoolSettings } from './types.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
let database: ProjectDatabase;
type SolverJob = { child: ChildProcessWithoutNullStreams; senderId: number };
let solverJob: SolverJob | undefined;

async function prepareDatabasePath() {
  const userData = app.getPath('userData');
  const dataDir = path.join(userData, 'data');
  const databasePath = path.join(dataDir, 'school.db');
  const legacyPath = path.join(userData, 'school.db');
  await mkdir(dataDir, { recursive: true });
  if (!existsSync(databasePath) && existsSync(legacyPath)) {
    await rename(legacyPath, databasePath);
    for (const suffix of ['-wal', '-shm']) {
      if (existsSync(`${legacyPath}${suffix}`)) await rename(`${legacyPath}${suffix}`, `${databasePath}${suffix}`);
    }
  }
  return databasePath;
}

function engineCommand(): { command: string; args: string[] } | undefined {
  if (app.isPackaged) {
    const executable = path.join(process.resourcesPath, 'engine', 'timetable-engine.exe');
    return existsSync(executable) ? { command: executable, args: [] } : undefined;
  }
  const source = path.join(currentDir, '..', 'engine', 'timetable_engine.py');
  return existsSync(source) ? { command: process.env.PYTHON ?? 'python', args: [source] } : undefined;
}

function runSolver(event: Electron.IpcMainInvokeEvent, input: unknown, profile: unknown): Promise<unknown> {
  if (solverJob) throw new Error('이미 실행 중인 Solver 작업이 있습니다.');
  const engine = engineCommand();
  if (!engine) throw new Error('패키지 Solver 엔진을 찾을 수 없습니다. resources/engine/timetable-engine.exe를 포함해 다시 패키징하세요.');
  return new Promise((resolve, reject) => {
    const child = spawn(engine.command, engine.args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    solverJob = { child, senderId: event.sender.id };
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (error?: Error, result?: unknown) => {
      if (settled) return;
      settled = true;
      if (solverJob?.child === child) solverJob = undefined;
      error ? reject(error) : resolve(result);
    };
    const consume = (line: string) => {
      try {
        const message = JSON.parse(line) as { type?: string; progress?: number; message?: string; candidate?: unknown };
        if (message.type === 'progress') event.sender.send('solver:progress', {
          progress: Math.max(0, Math.min(100, Number(message.progress) || 0)),
          message: String(message.message ?? ''),
        });
        if (message.type === 'result') finish(undefined, message.candidate);
        if (message.type === 'error') finish(new Error(String(message.message ?? 'Solver 엔진이 요청을 처리하지 못했습니다.')));
      } catch {
        finish(new Error(`Solver 엔진이 잘못된 응답을 반환했습니다: ${line.slice(0, 200)}`));
      }
    };
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() ?? '';
      lines.filter(Boolean).forEach(consume);
    });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.once('error', (error) => finish(new Error(`Solver 엔진을 시작하지 못했습니다: ${error.message}`)));
    child.once('close', (code, signal) => {
      if (stdout.trim()) consume(stdout.trim());
      if (!settled) finish(new Error(signal === 'SIGTERM'
        ? 'Solver 작업이 취소되었습니다.'
        : `Solver 엔진이 결과 없이 종료되었습니다 (code ${code ?? 'unknown'}). ${stderr.trim()}`));
    });
    child.stdin.end(`${JSON.stringify({ type: 'solve', input, profile })}\n`);
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    show: false,
    backgroundColor: '#f4f7f5',
    webPreferences: {
      preload: path.join(currentDir, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => window.show());
  if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(path.join(currentDir, '../public/index.html'));
  }
}

app.whenReady().then(async () => {
  try {
    database = new ProjectDatabase(await prepareDatabasePath());
  } catch (error) {
    await dialog.showMessageBox({
      type: 'error',
      title: '학교시간표 시작 오류',
      message: '사용자 데이터베이스를 열거나 업데이트하지 못했습니다.',
      detail: error instanceof Error ? error.message : String(error),
    });
    app.quit();
    return;
  }
  ipcMain.handle('projects:list', () => database.list());
  ipcMain.handle('projects:create', (_event, input: ProjectInput) => database.create(input));
  ipcMain.handle('projects:update', (_event, id: string, updates) => database.update(id, updates));
  ipcMain.handle('projects:rename', (_event, id: string, name: string) => database.rename(id, name));
  ipcMain.handle('projects:duplicate', (_event, id: string) => database.duplicate(id));
  ipcMain.handle('projects:delete', (_event, id: string) => database.remove(id));
  ipcMain.handle('projects:open', (_event, id: string) => database.touch(id));
  ipcMain.handle('base-data:list', (_event, projectId: string, entity: BaseEntity) =>
    database.listBaseData(projectId, entity));
  ipcMain.handle('base-data:upsert', (_event, projectId: string, entity: BaseEntity, record: BaseRecord) =>
    database.upsertBaseData(projectId, entity, record));
  ipcMain.handle('base-data:delete', (_event, projectId: string, entity: BaseEntity, id: string) =>
    database.removeBaseData(projectId, entity, id));
  ipcMain.handle('settings:get', (_event, projectId: string) => database.getSettings(projectId));
  ipcMain.handle('settings:save', (_event, projectId: string, settings: SchoolSettings) =>
    database.saveSettings(projectId, settings));
  ipcMain.handle('files:save', async (_event, requestOrName: any, binary?: Uint8Array) => {
    const request = typeof requestOrName === 'string'
      ? { filename: requestOrName, content: binary }
      : requestOrName;
    const extension = String(request.filename).endsWith('.xlsx') ? 'xlsx' : 'schoolttbackup';
    const result = await dialog.showSaveDialog({
      defaultPath: request.filename,
      filters: [{ name: extension === 'xlsx' ? 'Excel 통합 문서' : '학교 시간표 백업', extensions: [extension] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const content = typeof request.content === 'string' ? request.content : Buffer.from(request.content);
    await writeFile(result.filePath, content);
    return { canceled: false, path: result.filePath };
  });
  ipcMain.handle('files:choose-backup', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: '학교 시간표 백업', extensions: ['schoolttbackup', 'json'] }],
    });
    if (result.canceled || !result.filePaths[0]) return undefined;
    return { path: result.filePaths[0], content: await readFile(result.filePaths[0], 'utf8') };
  });
  ipcMain.handle('files:read', (_event, filePath: string) => readFile(filePath, 'utf8'));
  ipcMain.handle('backup:restore-atomic', async (_event, backup: any) => {
    const backupDir = path.join(app.getPath('userData'), 'backups');
    await mkdir(backupDir, { recursive: true });
    database.backupDatabase(path.join(backupDir, `pre-restore-${Date.now()}.sqlite`));
    database.restoreAtomic(backup);
  });
  ipcMain.handle('solver:available', () => Boolean(engineCommand()));
  ipcMain.handle('solver:solve', (event, input: unknown, profile: unknown) => runSolver(event, input, profile));
  ipcMain.handle('solver:cancel', (event) => {
    if (!solverJob || solverJob.senderId !== event.sender.id) return false;
    solverJob.child.kill();
    return true;
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  solverJob?.child.kill();
  database?.close();
});