# Report contract

[Core README](../README.md)

Define the versioned report format shared by the local skill, future cloud service, and viewer. This module checks report data without accessing files or the network. It also provides the schema, TypeScript types derived from that schema, and packaging for complete report folders with PNG evidence.

## Architecture

- Keep one JSON Schema that can itself be stored as JSON. Derive TypeScript types from it rather than maintaining a separate definition.
- Use one validator to check the data format, references, scope, and consistency of evidence. It runs in browsers and Node without accessing files or the network. Callers parse the JSON and check the actual image files.
- Report text is displayed as text, never interpreted as HTML. Lists use structured arrays. Validation checks the supplied data without changing values, filling in missing fields, converting types, or standardizing the input.
- Exclude credentials, raw cookies, authorization headers, and secret-bearing URLs from report data and evidence.
- Own shared development fixtures: compact reports covering the contract, richer preview scenarios, and synthetic screenshot illustrations. Keep these outside the public report API and distributed review assets; the viewer consumes them for previews.

## Files

- [reportSchema.ts](reportSchema.ts) — Report format and TypeScript types derived from it
- [validateReport.ts](validateReport.ts) — Function to validate a report
- [packageReport.ts](packageReport.ts) — Filesystem asset validation and portable report generation.
- [fixtures/contract.ts](fixtures/contract.ts) — Fake reports for contract tests.
- [fixtures/scenarios.ts](fixtures/scenarios.ts) — Richer fake reports and edge cases for development previews.
- [fixtures/screenshots.ts](fixtures/screenshots.ts) — Synthetic screenshot illustrations for development.

Update this list and each file's purpose comment when files are added, edited, or removed.

## API

**Report format**

- The top-level report object contains only `schemaVersion`, `review`, `issues`, and `warnings`. Version `0.1` is supported; empty and warnings-only reports are valid. This prototype version is still being finalized: locations require name/root-relative-route objects and each issue requires one evidence object. Earlier string locations and evidence arrays are unsupported.
- Review context requires nonempty `title`, `reviewedAt` (ISO date/time with timezone), `scope`, and `evidenceSummary`, plus `areas`, `limitations`, and `outstandingQuestions` arrays. The last two contain nonempty strings and may be empty.
- Optional review `baseUrl` identifies the reviewed app for root-relative location routes. It must be an absolute HTTP(S) URL without credentials, whitespace, or backslashes. It is never inferred from the viewer origin.
- Optional review `githubRepository` identifies the destination for GitHub issue handoff. Use a canonical `https://github.com/OWNER/REPO` URL, without a trailing slash, clone `.git` suffix, credentials, query, fragment, or extra path. Repository existence and access are not checked; omit it when no destination is known.
- `areas` maps the product with stable unique `id`, nonempty `name`, and boolean `reviewed` for each area. Record partial coverage and untested states in `limitations`; a reviewed area does not imply exhaustive coverage.
- Issue and warning scopes are either `{kind: "areas", areaIds: [...]}` with nonempty, distinct existing area IDs, or `{kind: "app-wide"}`. Area references may include areas marked unreviewed; scope identifies relevance, while coverage records inspection. Review `scope` is a nonempty description of the overall review.
- Categories are a fixed vocabulary defined by the schema, not an authored report array. Use these IDs and display labels in this order, including empty categories when presenting a report:

- `accessibility`: Accessibility
- `color`: Color
- `typography`: Typography
- `layout-and-spacing`: Layout and spacing
- `components`: Components
- `interactions-and-motion`: Interactions and motion
- `navigation-and-flows`: Navigation and flows
- `content-and-imagery`: Content and imagery
- `states-and-feedback`: States and feedback
- `consistency-and-polish`: Consistency and polish

**Issues**

Every issue requires these fields:

- `id`: Nonempty, stable, unique string.
- `category`: Exactly one fixed category ID.
- `scope`: Relevant area IDs or app-wide scope, independent of precise locations and review coverage.
- `title`: Nonempty string describing the problem concisely.
- `problem`: Nonempty string explaining what fails or causes friction, for whom, and why the evidence supports it.
- `suggestedSolution`: Nonempty string with a concrete recommendation consistent with product intent, including unresolved questions or tradeoffs.
- `priority`: `high`, `medium`, or `low`, ordered by relative user impact.
- `priorityRationale`: Nonempty string explaining impact, reach, frequency, and confidence.
- `benefit`: Nonempty string with the expected user benefit; do not present untested results as measured.
- `locations`: Nonempty array of objects with required nonempty `name` and `url` strings. Author a human-readable name and a single-slash root-relative app route, optionally including a query or fragment. Full URLs, source paths, named screen/state references, protocol-relative URLs, whitespace, control characters, and backslashes are rejected. Viewers resolve routes against the authored review `baseUrl`; without app context they remain plain text. Unknown location fields are rejected.
- `acceptanceCriteria`: Nonempty array of strings defining observable implementation success.
- `evidence`: One required visual or nonvisual evidence object supporting the problem.

Optional `reproductionSteps` is a nonempty ordered array of nonempty strings explaining how to observe the problem. Group observations sharing a cause or reusable fix into one issue with multiple locations and one representative evidence object.

**Evidence and handoff**

- The evidence object requires nonempty `observation` and `support`, describing what was observed and how it supports the problem.
- Screenshot evidence has `kind: "screenshot"`, a `before` capture, and optional `proposedAfter` capture. Each capture requires `image`, `route`, `viewport` and `imageDimensions` with positive integer `width`/`height`, `scroll` with finite `x`/`y`, and nonempty `state`. Fractional and negative scroll positions are valid; full-page captures may exceed viewport dimensions.
- Nonvisual evidence has `kind: "nonvisual"` and nonempty `method`, `location`, and `state`, such as keyboard behavior or DOM semantics. It has no image fields.
- After images are temporary proposals. Their declared metadata must match the before capture except for the image reference. Authors must also verify equivalent framing and content; JSON validation cannot prove what pixels show. Issues have no fix status.
- Warnings require `id`, `category`, `scope`, `concern`, `uncertainty`, and `nextVerification`. Text is nonempty. Keep warnings evidence-free and separate from verified issues.
- Every issue and warning ID must be unique across both lists. Area IDs must be unique within the separate list of areas. Reports contain recommendations and acceptance criteria, with no separate implementation plan.

**Validation**

- Import `reportSchema`, schema-derived report types, and `validateReport` from `design-review-agent-core/report`. The schema is ordinary JSON-compatible data for producers and other tooling.
- `validateReport(value: unknown)` returns `{valid: true, report}` or `{valid: false, errors}`. Each error has a JSON Pointer `path`, human-readable `message`, and `code`: `schema`, `unsupported-version`, `duplicate-id`, `invalid-reference`, or `inconsistent-evidence`.
- Validate required fields, types, enums, nonempty content, dates, versions, unique IDs, valid area references, and consistent evidence. Reject unknown fields at every object boundary, including legacy categories, implementation plans, and fix status.
- Validate image references as safe relative paths. Do not read files, verify image bytes or dimensions, or prove that observations are true. Actual asset validation belongs to the PNG packager, outside the pure validation boundary.
- Keep behavior consistent across consumers; only explicit contract evolution introduces service metadata or new fields. Consumer code should use paths and codes rather than depending on exact error wording.

**Portable folder generation**

- Accept authored report JSON, an evidence directory, an output directory, and built viewer assets. Validate schema, references, and assets before producing output. The generator does not call a model or invent findings. The core CLI exposes this as its `package` command.
- Produce a complete folder with `index.html`, adjacent `report.json`, schema, capture receipt, and relative PNG images. Embed report data, viewer, styles, and validator in HTML so the extracted folder can open directly without HTTP, internet access, a CDN, remote fonts, or third-party scripts. Escape embedded data so report content cannot be executed as code.
- Resolve image references within the supplied evidence directory, copy with content-hash names, and rewrite a cloned report. Deduplicate identical bytes and validate actual PNG signature, chunk checksums, compressed image data, dimensions, and row filters. Support non-interlaced PNGs up to 25 MB per file, 100 million pixels, and 512 MB decoded. Reject missing assets, dimension mismatches, unsafe paths and escaping symlinks, and executable references.
- Treat report data and image files as untrusted input. Prepare the complete output before publishing it. Preserve unrelated destination files and refuse to replace files with names needed by the generated report.
- Publish HTML last. If publication fails, remove only files created by that attempt. Never silently overwrite an existing report.
- Packaging to a local folder is available now. Callers remain responsible for any future storage integrations.
- Execution capture metadata remains outside the report contract in `run-evidence.json`. The shared runner requires actual capture files even for zero-finding reports and checks route/viewport coverage; standalone packaging can accept a report without execution captures.

---

## Testing

- Use Vitest against the public validator, with synthetic fixtures kept separate from distributed review assets.
- Cover complete, empty, warnings-only, visual, nonvisual, paired-proposal, optional-reproduction, area-scoped, app-wide, and partial-coverage reports; test input remains unchanged.
- Accept reports with or without a GitHub repository; reject malformed and unsafe repository URLs.
- Reject missing/blank fields, malformed, legacy, or non-route location entries, evidence arrays, invalid types/enums/dates, nested unknown fields, unsupported versions, duplicate IDs and area references, missing area targets, unsafe image paths, and mismatched proposal metadata. Accept full-page captures and finite fractional/negative scroll positions.
- Generator and viewer tests reuse report fixtures to agree on contract acceptance. Generation tests cover missing/corrupt images, dimension mismatches, rewritten content-hash references, deduplication, authored text safety, escaping symlinks, destination-file preservation, collisions, and failure without publishing invalid output.

---

## TODO

### Personal prototype

- Consider returning evidence to an array when multiple visual or nonvisual observations per issue become useful.

- Consider fewer dependencies while preserving the report contract and validation guarantees.
- Consider a shared source of truth for categories such as accessibility outside the schema, balancing reuse across guidance and consumers against extra indirection and drift.
- Consider a separate report-generator module if additional storage adapters justify the boundary; retain pure browser/Node validation independently of filesystem packaging.
- Consider additional image formats only with matching byte/dimension validation and demonstrated capture needs.

### Friendly alpha

- Evolve the contract explicitly for hosted reviews: repository/revision attribution, preview URL, configuration, coverage, failures, measured evidence, model identifier, prompt/schema version, and evaluation configuration.
- Candidate finding metadata includes origin (`measured` or `ai`), page, scenario, viewport, measurements, and optional proposal reference. These are not additional fields accepted by the prototype contract.
- Consider multiple tags per finding alongside its single primary category; evolve the contract explicitly before accepting tags.

### Open beta

- Evolve the contract for previous findings and status when persistent review history is introduced.
