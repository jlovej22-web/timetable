import assert from 'node:assert/strict';
import test from 'node:test';
import { access, readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));

test('Windows release uses a deterministic x64 NSIS Setup artifact', () => {
  assert.equal(packageJson.version, '1.0.0');
  assert.equal(packageJson.build.artifactName, 'SchoolTimetableSetup.${ext}');
  assert.deepEqual(packageJson.build.win.target[0].arch, ['x64']);
  assert.equal(packageJson.build.win.target[0].target, 'nsis');
});

test('installer is per-user and does not delete user data', () => {
  assert.equal(packageJson.build.nsis.perMachine, false);
  assert.equal(packageJson.build.nsis.deleteAppDataOnUninstall, false);
  assert.equal(packageJson.build.nsis.allowToChangeInstallationDirectory, true);
});

test('packaged application carries the Windows engine executable', () => {
  assert.deepEqual(packageJson.build.extraResources, [{
    from: 'engine/dist/timetable-engine.exe',
    to: 'engine/timetable-engine.exe',
  }]);
  assert.match(packageJson.scripts['build:engine'], /PyInstaller/);
  assert.match(packageJson.scripts['build:engine'], /timetable-engine\.spec/);
  assert.match(packageJson.scripts.build, /desktop:build/);
  assert.match(packageJson.scripts['build:win'], /build:engine/);
  assert.match(packageJson.scripts['build:win'], /run build/);
  assert.match(packageJson.scripts['build:win'], /electron-builder --win nsis --x64/);
});

test('packaged renderer uses hash routing for file URLs', async () => {
  const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(appSource, /window\.location\.protocol === 'file:'/);
  assert.match(appSource, /hook=\{useHashLocation\}/);
});

test('project-owned engine and scalable fixture are present', async () => {
  await access(new URL('../engine/timetable_engine.py', import.meta.url));
  const fixture = await import('../tools/fixtures/large-scale.mjs');
  const data = fixture.createLargeScaleFixture();
  assert.equal(data.teachers.length, 100);
  assert.equal(data.classes.length, 40);
  assert.equal(data.assignments.length, 1000);
});