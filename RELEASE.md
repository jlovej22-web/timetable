# Windows release checklist

## Release approval record

Record the actual machine, date, installer version, and result for every row.
Do not approve a release while any required row is `PENDING` or `FAIL`.

| #   | Verification                                                                                                                 | Environment             | Date | Result  | Evidence / notes                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---- | ------- | ---------------------------------------------------------------------------- |
| 1   | GitHub Actions Windows release job succeeds and uploads `SchoolTimetableSetup-win-x64` containing `SchoolTimetableSetup.exe` | GitHub `windows-latest` | —    | PENDING | Record run URL and artifact name.                                            |
| 2   | Engine Python unit tests pass with OR-Tools installed                                                                        | GitHub `windows-latest` | —    | PENDING | Record run URL.                                                              |
| 3   | 100-teacher / 40-class benchmark returns `VALID` with zero hard violations                                                   | GitHub `windows-latest` | —    | PENDING | Record timing and run URL.                                                   |
| 4   | First per-user install and launch succeeds                                                                                   | Windows 10 x64          | —    | PENDING | Record Windows build and installer version.                                  |
| 5   | Desktop and Start menu shortcuts are created and launch the app                                                              | Windows 10 x64          | —    | PENDING | Record both shortcut paths.                                                  |
| 6   | A project remains after closing and reopening the app                                                                        | Windows 10 x64          | —    | PENDING | Record project name and database backup hash.                                |
| 7   | The project remains after reinstalling the same version                                                                      | Windows 10 x64          | —    | PENDING | Record installer version and database backup hash.                           |
| 8   | First install, launch, and both shortcuts succeed                                                                            | Windows 11 x64          | —    | PENDING | Record Windows build and installer version.                                  |
| 9   | A project remains after closing/reopening and reinstalling the same version                                                  | Windows 11 x64          | —    | PENDING | Record project name and database backup hash.                                |
| 10  | A project remains after installing a higher application version                                                              | Windows 11 x64          | —    | PENDING | Record old/new versions and database backup hash.                            |
| 11  | Uninstall preserves user data; reinstall restores access to the project                                                      | Windows 10 and 11 x64   | —    | PENDING | Confirm `%APPDATA%\school-timetable\data\school.db` remains on both systems. |

**Final approval:** PENDING

Approved by: —

Approval date: —

Release version: `1.0.0`

## Preflight record

These checks do not replace rows 1–11 above.

| Date       | Environment                                   | Check                            | Result | Evidence                                                                                         |
| ---------- | --------------------------------------------- | -------------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| 2026-09-07 | Replit Linux, Python 3.13, OR-Tools installed | Engine unit tests                | PASS   | `python -m unittest artifacts/school-timetable/engine/test_timetable_engine.py`: 2 tests passed. |
| 2026-09-07 | Replit Linux, Python 3.13, OR-Tools installed | 100-teacher / 40-class benchmark | PASS   | `VALID`, 1,000 lessons, 0 hard violations, 5972.12 ms.                                           |
| 2026-09-07 | Replit Linux, Node.js / pnpm workspace        | Typecheck and regression tests   | PASS   | Typecheck passed; 4 regression tests passed.                                                     |

## Build procedure

1. Set the production semantic version in `package.json`; the tag should be
   `v<that-version>`.
2. Dispatch `.github/workflows/windows-release.yml`. It installs OR-Tools and
   PyInstaller, builds the engine, runs type checking, regression tests, engine
   unit tests, and the large benchmark before packaging the installer.
3. Download `SchoolTimetableSetup-win-x64` and perform rows 4–11 on actual
   Windows 10 and Windows 11 x64 machines.
4. Publish only after all rows contain actual passing evidence and Final
   approval is changed to `APPROVED`.

## User data and updates

The installer is per-user (`perMachine: false`) and the NSIS configuration
sets `deleteAppDataOnUninstall: false`. Electron stores production data below:

`%APPDATA%\school-timetable\data\school.db`

This location is outside the installation directory, so install-directory
changes and normal in-place NSIS updates must not replace the database.
Versions that stored `school.db` directly below the app's userData directory
are migrated to the `data` directory on the next successful launch.
Users should still export a backup before an update or uninstall; preserving
data is not a substitute for a backup.

## Release limits

The CI package is produced on `windows-latest`. Linux development hosts can
run static checks and Node tests, but **cannot validate a real Windows NSIS
install, uninstall, update, shortcut, or userData preservation behavior**.
Those checks require a Windows machine or Windows CI runner. Benchmark output
is a measurement from the machine that runs it, not a release pass claim.
