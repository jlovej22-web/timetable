import { spawn } from 'node:child_process';
import { createLargeScaleFixture } from './fixtures/large-scale.mjs';

const fixture = createLargeScaleFixture();
const started = performance.now();
const memoryBefore = process.memoryUsage().rss;
const child = spawn(process.env.PYTHON ?? 'python', ['engine/timetable_engine.py'], {
  cwd: new URL('..', import.meta.url), stdio: ['pipe', 'pipe', 'pipe'],
});
let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk; });
child.stderr.on('data', (chunk) => { stderr += chunk; });
child.stdin.end(`${JSON.stringify({ type: 'solve', input: fixture })}\n`);
const exitCode = await new Promise((resolve) => child.on('close', resolve));
const elapsedMs = performance.now() - started;
const memoryDeltaMiB = (process.memoryUsage().rss - memoryBefore) / 1024 / 1024;
if (exitCode !== 0) throw new Error(`Engine exited ${exitCode}: ${stderr.trim()}`);
const messages = stdout.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const result = messages.find((message) => message.type === 'result')?.candidate;
const occupied = new Set();
const hardViolations = result?.entries?.reduce((count, entry) => {
  const keys = [`class:${entry.classId}:${entry.day}:${entry.period}`, `teacher:${entry.teacherId}:${entry.day}:${entry.period}`];
  return count + keys.reduce((conflicts, key) => {
    if (occupied.has(key)) return conflicts + 1;
    occupied.add(key);
    return conflicts;
  }, 0);
}, 0) ?? 1;
console.log(JSON.stringify({
  fixture: { teachers: fixture.teachers.length, classes: fixture.classes.length, lessons: fixture.assignments.length },
  timingMs: Number(elapsedMs.toFixed(2)),
  nodeRssDeltaMiB: Number(memoryDeltaMiB.toFixed(2)),
  engineElapsedMs: Number((elapsedMs).toFixed(2)),
  engineStatus: result?.status,
  hardViolations,
}, null, 2));
if (hardViolations !== 0 || result?.validationIssues?.length || result?.status !== 'VALID') process.exitCode = 1;