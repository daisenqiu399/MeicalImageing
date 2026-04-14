# Repository Guidelines

## Project Structure & Module Organization

This repository is a Yarn 1 monorepo for the OHIF medical imaging viewer. `platform/app` is the main viewer application, while `platform/core`, `platform/ui`, `platform/ui-next`, `platform/i18n`, and `platform/cli` hold shared packages. Feature packages live in `extensions/*`, workflow-specific packages live in `modes/*`, and bundled extras live in `addOns/externals/*`. The local AI proxy is in `server/ai-proxy.js`.

End-to-end coverage lives in `tests/`: Playwright specs are in `tests/*.spec.ts`, page objects in `tests/pages`, and helpers in `tests/utils`. Treat `dist/`, `coverage/`, `tests/playwright-report`, and `tests/test-results` as generated output, not hand-edited source.

## Build, Test, and Development Commands

- `yarn install --frozen-lockfile`: install dependencies with the committed lockfile.
- `yarn dev`: start the viewer and local AI proxy together.
- `yarn dev:fast`: start the faster Rsbuild-based dev flow.
- `yarn build`: build production viewer bundles across workspaces.
- `yarn test:unit`: run Jest multi-project unit tests with coverage.
- `yarn test:e2e:ci`: run Playwright against the local server on port `3335`.
- `yarn test:e2e:ui`: open the Playwright UI runner.
- `yarn test:data`: initialize the `testdata` submodule if e2e fixtures are missing.

## Coding Style & Naming Conventions

Use Node 18+ and Yarn 1.x. Prettier is the formatting source of truth: 2-space indentation, single quotes, semicolons, trailing commas, and a 100-character line width. ESLint extends React and TypeScript rules, and control-flow braces are required.

Follow existing naming patterns: PascalCase for React components and page objects (`ViewportPageObject.ts`), camelCase for hooks and utilities (`useSessionStorage.tsx`, `getDirectURL.ts`), and kebab-case for package directories. Keep package entry files aligned with existing conventions such as `src/index.ts(x)` and `src/id.js`.

## Testing Guidelines

Place unit tests beside source as `*.test.js` or `*.test.ts`. Keep browser workflows in root-level Playwright specs named `*.spec.ts`. Snapshot baselines live under `tests/screenshots/chromium/...`; update them only when UI behavior intentionally changes, and mention that change in the PR.

## Commit & Pull Request Guidelines

Recent local history uses short imperative summaries, including Chinese commit messages. For shareable changes, follow the repo PR template and use semantic-release style titles such as `feat(MeasurementService): add ...` or `fix(Viewport): handle ...`. `yarn cm` starts the Commitizen prompt.

PRs should include context, a concise change summary, reproducible test steps, linked issues, and screenshots or GIFs for UI changes. Keep the PR title semantic-release compliant because it is intended to become the squash commit message.

## Configuration Tips

Start from `.env.example` for local configuration and never commit secrets. Prefer `yarn install --frozen-lockfile` to avoid unreviewed dependency drift.
