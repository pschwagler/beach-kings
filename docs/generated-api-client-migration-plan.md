# Generated API Client Migration Plan

## Goal

Move Beach Kings toward generated TypeScript API types and client code from the FastAPI OpenAPI schema, so backend route contracts become the source of truth for mobile and web API usage.

This is not a big-bang replacement plan. The migration should improve contract safety while keeping feature work moving.

## Why Do This

Generated API code helps with:

- Catching backend/frontend contract drift before runtime.
- Removing duplicated hand-written endpoint wrappers across mobile and web.
- Making missing endpoints obvious.
- Improving request payload typing, not just response typing.
- Reducing manual synchronization between Pydantic schemas and TypeScript interfaces.
- Making refactors safer when route paths, request bodies, or response fields change.

The main risk is generating weak types from a weak OpenAPI schema. If a backend route uses `dict`, `list`, `list[dict]`, `Any`, or raw `request.json()`, generated TypeScript will also be weak. The plan therefore starts by improving the OpenAPI contract before relying on generated code broadly.

## Target Architecture

The long-term target is:

- FastAPI route request and response schemas are defined with Pydantic models.
- CI exports and validates `openapi.json`.
- Generated TypeScript types are produced from `openapi.json`.
- A generated or typed API client is the default path for new frontend API calls.
- Existing hand-written API adapters remain only where they intentionally reshape backend data into UI-specific view models.
- Mobile and web consume the same generated contract package.

Recommended package boundary:

```text
apps/backend
  FastAPI routes + Pydantic schemas

packages/api-contract
  generated OpenAPI JSON
  generated TypeScript schema types
  optional generated low-level client

packages/api-client
  stable app-facing API wrappers
  thin adapters over generated calls
  UI-specific normalization where needed

apps/mobile, apps/web
  consume packages/api-client
```

## Phase 0: Contract Baseline

Objective: Understand and preserve the current API surface before changing client generation.

Work:

- Add a script that exports the backend OpenAPI schema to a committed file, for example `packages/api-contract/openapi.json`.
- Add a CI check that regenerates the schema and fails if the committed schema is stale.
- Record current weak spots:
  - routes using `response_model=dict`
  - routes using `response_model=list`, `list[dict]`, or `List[Any]`
  - routes reading body payloads with `await request.json()`
  - client methods returning untyped `response.data`
- Add a short report or checklist that ranks route groups by product importance.

Deliverables:

- `openapi.json` can be generated deterministically.
- CI detects schema drift.
- The team has a visible list of contract gaps.

Exit criteria:

- Generating OpenAPI does not require a running production service.
- Schema generation works locally and in CI.
- No frontend code has been migrated yet.

## Phase 1: OpenAPI Quality Gate

Objective: Prevent new weak contracts from being added while gradually tightening existing ones.

Work:

- Add lint/check scripts that warn or fail on new loose route contracts.
- Prefer Pydantic request models over raw `request.json()`.
- Prefer Pydantic response models over `dict`, `Any`, and generic lists.
- Standardize common response envelopes:
  - success/message responses
  - paginated list responses
  - mutation responses
  - upload responses
  - error shapes, if exposed intentionally
- Document route schema conventions for new backend work.

Recommended policy:

- New routes must use typed request models when they accept JSON bodies.
- New routes must use typed response models unless there is a documented reason.
- Existing loose routes can stay temporarily, but touched routes should be tightened.

Deliverables:

- A backend API schema convention documented in this file or a dedicated backend API guide.
- CI or a local check that makes weak new contracts visible.
- Typed request and response schemas for the highest-traffic route groups.

Exit criteria:

- New backend API work has a clear contract standard.
- The worst loose contracts are known and prioritized.

## Phase 2: Generate TypeScript Types Only

Objective: Get value from generated contracts without changing runtime behavior.

Work:

- Add a generation script that creates TypeScript types from `openapi.json`.
- Commit generated output or generate it during build, but be consistent.
- Expose generated types from `packages/api-contract`.
- Compare generated types to existing `@beach-kings/shared` API interfaces.
- Start replacing manual API response types with generated types in low-risk areas.

Preferred migration pattern:

```ts
import type { paths, components } from "@beach-kings/api-contract";

type GetLeagueResponse =
  paths["/api/leagues/{league_id}"]["get"]["responses"]["200"]["content"]["application/json"];
```

Then wrap this in clearer local aliases:

```ts
export type LeagueDetailApiResponse = components["schemas"]["LeagueDetailResponse"];
```

Deliverables:

- Generated TypeScript schema types.
- A small set of manual shared types replaced or cross-checked by generated types.
- Type aliases for important API models.

Exit criteria:

- No application runtime behavior changed.
- Type generation is repeatable.
- Developers can import generated backend schema types in TypeScript.

## Phase 3: Add Contract Tests Around Current Client

Objective: Use generated types to verify the hand-written client before replacing it.

Work:

- Add compile-time checks that key `packages/api-client` methods return generated response types.
- Add request payload type checks for mutation methods.
- Add adapter tests where the API client reshapes backend fields into UI-ready models.
- Identify methods that are simple pass-throughs and methods that are true adapters.

Classify each API method:

- Pass-through: frontend wants exactly the backend response shape.
- Thin wrapper: path/query params are ergonomic, response is unchanged.
- Adapter: backend response is transformed into a UI-specific shape.
- Legacy/mock-backed: endpoint is missing, deprecated, or still mocked.

Deliverables:

- A method inventory for `packages/api-client`.
- Type-level checks for important pass-through and wrapper methods.
- Clear list of methods that should remain app-facing adapters.

Exit criteria:

- The current client is measured against generated types.
- High-risk mismatches are fixed before client generation begins.

## Phase 4: Introduce Generated Low-Level Client

Objective: Add generated runtime calls underneath the existing app-facing client API.

Work:

- Choose a generated client approach:
  - generated fetch client
  - typed OpenAPI fetch wrapper
  - generated Axios client
- Keep authentication, token refresh, base URL, and error handling centralized.
- Do not force screens to call generated endpoints directly yet.
- Start replacing internals of `packages/api-client` methods with generated low-level calls.

Recommended approach:

- Preserve `packages/api-client` as the stable app-facing facade.
- Use generated code below it.
- Let adapters continue to normalize awkward backend shapes for mobile and web.

Example target shape:

```ts
export async function getLeague(id: number): Promise<LeagueDetail> {
  const raw = await generatedClient.GET("/api/leagues/{league_id}", {
    params: { path: { league_id: id } },
  });

  return mapLeagueDetail(raw.data);
}
```

Deliverables:

- Generated low-level client is wired to auth and base URL.
- A small domain area uses generated calls internally.
- Existing mobile/web call sites do not need broad rewrites.

Exit criteria:

- One route group has been migrated behind the existing facade.
- Error handling and auth behavior match the old Axios client.
- Tests prove no app-facing API behavior changed.

## Phase 5: Migrate Domain by Domain

Objective: Replace hand-written request/response typing incrementally.

Suggested order:

1. Stable read-only public endpoints.
2. Authenticated read endpoints.
3. Simple mutations with typed request bodies.
4. Complex domain workflows.
5. Uploads, downloads, websockets, and long-running jobs.
6. Admin-only endpoints.

For each domain:

- Tighten backend schemas first.
- Regenerate OpenAPI.
- Replace hand-written low-level calls with generated calls.
- Keep or add app-facing adapters where screens depend on normalized shapes.
- Update tests.
- Remove obsolete manual shared types after all consumers move off them.

Deliverables per domain:

- Backend request/response models are typed.
- Generated types are used by the client.
- App-facing behavior is covered by tests.
- Manual duplicate types are deleted or marked as view models.

Exit criteria:

- The migrated domain no longer depends on manually synchronized API response interfaces.
- Any remaining manual types are intentionally UI/view-model types.

## Phase 6: Consolidate Web and Mobile API Usage

Objective: Make generated-contract-backed API access the default for both apps.

Work:

- Route web and mobile through the same `packages/api-client` facade where practical.
- Remove duplicate endpoint wrappers in `apps/web/src/services` when equivalent shared methods exist.
- Keep app-specific wrappers only for app-specific behavior.
- Standardize query parameter handling, pagination, and error extraction.
- Standardize mutation invalidation patterns in each app.

Deliverables:

- Shared client methods cover common web and mobile API use.
- Duplicate web/mobile endpoint wrappers are reduced.
- API errors are shaped consistently for UI code.

Exit criteria:

- New common API calls are added once, in the shared client.
- Screens rarely construct raw endpoint paths directly.

## Phase 7: Make Generated Contracts the Default

Objective: Complete the cultural and technical migration.

Work:

- Require OpenAPI-backed types for new API client methods.
- Fail CI when generated types are stale.
- Fail CI when new route contracts are loose without an explicit exception.
- Document the workflow for changing an API:
  1. update Pydantic schema
  2. update route
  3. regenerate OpenAPI/types
  4. update client adapter
  5. update app tests
- Remove old manual API types that duplicate generated schemas.

Deliverables:

- API contract generation is part of normal development.
- Manual API response types are rare.
- Contract drift is caught in CI.

Exit criteria:

- Backend schema changes create visible TypeScript changes.
- Frontend compile/test failures point directly to contract mismatches.
- The generated contract package is trusted by both apps.

## What Should Remain Hand-Written

Generated code should not replace every abstraction.

Keep these hand-written:

- UI view models.
- Data normalization helpers.
- Date/time formatting.
- Query cache keys.
- Domain-specific error messages.
- Auth/session lifecycle code.
- File upload helpers when generated code is awkward.
- Websocket clients.
- Analytics or logging wrappers.

Generated code should own:

- Route paths.
- HTTP methods.
- Path params.
- Query params.
- JSON request body types.
- JSON response body types.
- Basic operation names, if the chosen generator supports them cleanly.

## Tooling Criteria

Pick generation tools based on these requirements:

- Supports FastAPI OpenAPI output cleanly.
- Generates readable TypeScript.
- Works in React Native.
- Does not force a hard dependency on browser-only APIs.
- Allows custom fetch/Axios transport for auth headers and token refresh.
- Produces stable diffs.
- Can generate types separately from runtime client code.
- Does not make common endpoint calls more verbose than the current client facade.

Avoid adopting a generator that requires screens to use awkward generated operation names directly. The app-facing client should stay ergonomic.

## CI Checks

Recommended checks:

- `generate:openapi`: exports `openapi.json`.
- `check:openapi`: verifies committed schema is current.
- `generate:api-types`: generates TypeScript types.
- `check:api-types`: verifies generated TypeScript is current.
- `check:route-contracts`: flags new loose response models and raw JSON request bodies.
- TypeScript build for `packages/api-contract`.
- TypeScript build for `packages/api-client`.

## Migration Rules

- Do not migrate every endpoint at once.
- Do not expose raw generated calls directly to screens as the primary pattern.
- Do not delete manual shared types until all consumers are migrated or the type is clearly a UI view model.
- Do not accept weak generated types as a success condition. If generated output is `any`, fix the backend schema first.
- Prefer improving touched domains over pausing feature work for a broad cleanup.

## Success Metrics

Track progress with simple counts:

- Number of routes with typed request bodies.
- Number of routes with precise response models.
- Number of API client methods backed by generated types.
- Number of duplicate manual API response interfaces removed.
- Number of raw endpoint strings remaining in app code.
- Number of CI failures caught due to contract drift.

## Recommended First Milestone

The first milestone should stop before runtime generated clients:

1. Generate and commit OpenAPI.
2. Generate TypeScript schema types.
3. Add CI drift checks.
4. Tighten contracts for one small route group.
5. Use generated types in the existing API client for that route group.

That gives immediate contract safety and exposes tool friction without committing the whole codebase to a generated runtime client.
