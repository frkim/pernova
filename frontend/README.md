# Control-tower frontend

The Vite React/TypeScript and MUI application follows
[ADR 001](../docs/adr/001-spa-and-deterministic-orchestration.md).
The [API contract](../docs/api-contract.md) remains authoritative.
Business data, costs and local identities are synthetic; a configured integration
does not imply verified connectivity.

## Tables and accessibility

Scenario comparison and agent cost attribution share `src/components/DomainTable.tsx`.
Both tables provide keyboard-operable sortable headers, labelled per-column filters,
five/ten/twenty-five-row pagination and a 300 ms debounced global search.
Filters and global search are case- and accent-insensitive substring matches.
Numeric filters match raw API values, not localized currency strings.
Sorting uses raw numeric values rather than formatted display text.
Filtering or paging never changes the selected approval target.
MUI DataGrid supplies keyboard cell navigation and horizontal scrolling on narrow screens.
Empty, loading and error states are explicit.

Client-side operations are restricted to the small, API-bounded scenario and agent
collections. Workflow history is paged by the backend.
Larger future collections require server-side sort/filter/search/paging and an
explicit contract change.

The shared table uses MUI DataGrid Community `@mui/x-data-grid` **9.16.0** (MIT),
the stable release researched for this change and compatible with the existing
MUI 9 and React 19 peers. No second UI kit or commercial DataGrid tier is needed.
The package and its lockfile URLs are pinned to the protected Microsoft CFS feed.
The GitHub advisory lookup for this exact direct dependency returned no advisories
on 2026-11-06; that does not certify transitive dependencies. The full frontend
audit was blocked by CFS HTTP 429 and must be completed separately.
Virtualization is disabled for these small bounded collections so every row on the
current page remains available to keyboard and assistive-technology navigation.

## Theme

`public/theme.js` restores the saved choice or OS preference synchronously in the
document head, before the application module. `src/ThemeController.tsx` owns the MUI
theme, follows OS changes until a choice is made, and synchronizes changes across
tabs. If persistence is unavailable, an explicit choice remains effective for the
current page session.

## Validation

From the repository root, using already restored dependencies:

```powershell
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run format:check
npm --prefix frontend run build
```

Table, theme, approval and FinOps behavior tests live alongside their components.
Automated behavior checks do not certify WCAG contrast or replace a manual
screen-reader and keyboard review of both palettes.
