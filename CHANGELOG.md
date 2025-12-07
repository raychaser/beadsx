# Changelog

All notable changes to the BeadsX extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2025-12-07

### Added
- Initial marketplace release on VS Code Marketplace and Open VSX Registry
- Git hooks with Husky for code quality enforcement
- Pre-commit hook: lint-staged with Biome + unit tests
- Pre-push hook: full E2E test suite with Playwright

### Changed
- Reduced VSIX package size from 174 MB to ~19 KB by excluding dev files

## [0.1.x] - Pre-release versions

### Features
- Tree view panel showing beads issues
- Status icons for issue states (open, in_progress, blocked, closed)
- Filter issues by status (All, Open, Ready, Recent)
- Auto-reload issues at configurable interval
- Issue detail panel with full information
- Dependency visualization in tree view
- Short ID display option
- Configurable `bd` command path
- Recent issues filter with configurable time window
