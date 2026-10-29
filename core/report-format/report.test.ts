// Tests accepted reports and rejected inputs through the public validation API.
import { fixtureValue } from "./fixtures/contract.ts";

import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { reportSchema, validateReport, type Report } from "./index.ts";
import {
  completeReport,
  emptyReport,
  warningsOnlyReport,
} from "./fixtures/contract.ts";

type MutableObject = { [key: string]: unknown };

function objectAt(report: Report, path: string): MutableObject {
  return path
    .split("/")
    .filter(Boolean)
    .reduce<unknown>(
      (value, key) => (value as MutableObject)[key],
      report,
    ) as MutableObject;
}

function rejects(report: unknown, code?: string, path?: string) {
  const result = validateReport(report);
  assert.equal(result.valid, false);
  if (result.valid) throw new Error("Expected invalid report");
  assert.ok(result.errors.length > 0);
  for (const error of result.errors) {
    assert.ok(error.path === "" || error.path.startsWith("/"));
    assert.ok(error.message.trim().length > 0);
  }
  if (code)
    assert.ok(
      result.errors.some((error) => error.code === code),
      JSON.stringify(result.errors),
    );
  if (path)
    assert.ok(
      result.errors.some((error) => error.path === path),
      JSON.stringify(result.errors),
    );
  return result.errors;
}

describe("public report boundary", () => {
  for (const [name, fixture] of [
    ["complete", completeReport],
    ["empty", emptyReport],
    ["warnings only", warningsOnlyReport],
  ] as const) {
    it(`accepts a ${name} report`, () => {
      const report = fixture();
      assert.deepEqual(validateReport(report), { valid: true, report });
    });
  }
  it("exports a versioned JSON Schema", () => {
    assert.equal(typeof reportSchema, "object");
    assert.ok("$schema" in reportSchema);
    assert.equal(reportSchema.properties.schemaVersion.const, "0.1");
    assert.equal(completeReport().schemaVersion, "0.1");
  });
  for (const input of [null, undefined, true, 12, "{}", [], {}]) {
    it(`rejects non-report input ${JSON.stringify(input)}`, () => {
      rejects(input);
    });
  }
  for (const version of [
    "0.1.0",
    "1",
    "1.0",
    "1.0.0",
    "1.0.1",
    "2.0.0",
    "",
    1,
    null,
  ]) {
    it(`rejects unsupported version ${JSON.stringify(version)}`, () => {
      const report = completeReport();
      Object.assign(report, { schemaVersion: version });
      rejects(report, "unsupported-version", "/schemaVersion");
    });
  }
  it("does not mutate valid or invalid input or previous diagnostics", () => {
    for (const valid of [true, false]) {
      const report = completeReport();
      if (!valid)
        fixtureValue(report.issues[1]).id = fixtureValue(report.issues[0]).id;
      const snapshot = structuredClone(report);
      const first = structuredClone(validateReport(report));
      assert.deepEqual(validateReport(report), first);
      assert.deepEqual(report, snapshot);
      validateReport(emptyReport());
      assert.deepEqual(validateReport(report), first);
    }
  });
  it("preserves authored text without trimming or normalizing", () => {
    const report = completeReport();
    report.review.title = "  Authored title\n";
    assert.deepEqual(validateReport(report), { valid: true, report });
  });
});

describe("strict schema", () => {
  const objectPaths = [
    "",
    "/review",
    "/review/areas/0",
    "/issues/0",
    "/issues/0/scope",
    "/issues/0/locations/0",
    "/issues/1/scope",
    "/warnings/0",
    "/warnings/0/scope",
    "/issues/0/evidence",
    "/issues/1/evidence",
    "/issues/0/evidence/before",
    "/issues/0/evidence/before/viewport",
    "/issues/0/evidence/before/imageDimensions",
    "/issues/0/evidence/before/scroll",
    "/issues/0/evidence/proposedAfter",
  ];
  for (const path of objectPaths) {
    it(`rejects unknown fields at ${path || "root"}`, () => {
      const report = completeReport();
      objectAt(report, path).unexpected = true;
      rejects(report, "schema");
    });
  }
  it("rejects future and removed top-level fields", () => {
    for (const field of [
      "categories",
      "implementationPlan",
      "modelId",
      "status",
    ]) {
      const report = completeReport();
      objectAt(report, "")[field] = [];
      rejects(report, "schema");
    }
  });
  it("rejects legacy evidence arrays without rewriting or dropping entries", () => {
    for (const evidence of [
      [],
      [fixtureValue(completeReport().issues[0]).evidence],
      [
        fixtureValue(completeReport().issues[0]).evidence,
        fixtureValue(completeReport().issues[1]).evidence,
      ],
      null,
      {},
    ]) {
      const report = completeReport();
      objectAt(report, "/issues/0").evidence = evidence;
      const original = structuredClone(report);
      rejects(report, "schema", "/issues/0/evidence");
      assert.deepEqual(report, original);
    }
  });
  it("keeps warnings screenshot-free", () => {
    const report = completeReport();
    objectAt(report, "/warnings/0").evidence = fixtureValue(
      report.issues[0],
    ).evidence;
    rejects(report, "schema");
  });
  it("requires boolean area coverage", () => {
    const report = completeReport();
    objectAt(report, "/review/areas/0").reviewed = "true";
    rejects(report, "schema");
  });
  for (const key of ["limitations", "outstandingQuestions"]) {
    for (const value of [[" "], [12], null, "none"]) {
      it(`rejects malformed ${key}: ${JSON.stringify(value)}`, () => {
        const report = completeReport();
        objectAt(report, "/review")[key] = value;
        rejects(report, "schema");
      });
    }
  }
  for (const path of [
    "",
    "/review",
    "/review/areas/0",
    "/issues/0",
    "/warnings/0",
    "/issues/0/evidence/before",
    "/issues/0/evidence/before/viewport",
    "/issues/0/evidence/before/imageDimensions",
    "/issues/0/evidence/before/scroll",
  ]) {
    for (const key of Object.keys(objectAt(completeReport(), path))) {
      if (
        [
          "reproductionSteps",
          "proposedAfter",
          "baseUrl",
          "githubRepository",
        ].includes(key)
      )
        continue;
      it(`requires ${path}/${key}`, () => {
        const report = completeReport();
        delete objectAt(report, path)[key];
        rejects(report, "schema");
      });
    }
  }
  for (const [path, field] of [
    ["/review", "title"],
    ["/review", "scope"],
    ["/review", "evidenceSummary"],
    ["/review/areas/0", "id"],
    ["/review/areas/0", "name"],
    ["/issues/0", "id"],
    ["/issues/0", "title"],
    ["/issues/0", "problem"],
    ["/issues/0", "suggestedSolution"],
    ["/issues/0", "priorityRationale"],
    ["/issues/0", "benefit"],
    ["/warnings/0", "concern"],
    ["/warnings/0", "uncertainty"],
    ["/warnings/0", "nextVerification"],
    ["/issues/0/evidence", "observation"],
    ["/issues/0/evidence", "support"],
    ["/issues/1/evidence", "method"],
    ["/issues/1/evidence", "location"],
    ["/issues/1/evidence", "state"],
  ] as const) {
    it(`requires nonblank ${path}/${field}`, () => {
      const report = completeReport();
      objectAt(report, path)[field] = " \n\t ";
      rejects(report, "schema");
    });
  }
  for (const field of [
    "locations",
    "acceptanceCriteria",
    "reproductionSteps",
    "evidence",
  ]) {
    it(`rejects empty issue ${field}`, () => {
      const report = completeReport();
      objectAt(report, "/issues/0")[field] = [];
      rejects(report, "schema");
    });
  }
  for (const [field, value] of [
    ["category", "other"],
    ["category", ["color", "typography"]],
    ["priority", "critical"],
    ["priority", 1],
    ["locations", [""]],
    ["acceptanceCriteria", [" "]],
    ["reproductionSteps", [""]],
  ]) {
    it(`rejects invalid issue ${field}: ${JSON.stringify(value)}`, () => {
      const report = completeReport();
      objectAt(report, "/issues/0")[String(field)] = value;
      rejects(report, "schema");
    });
  }
  for (const scope of [
    { kind: "areas", areaIds: [] },
    { kind: "areas", areaIds: ["settings", "settings"] },
    { kind: "areas", areaIds: [" "] },
    { kind: "app-wide", areaIds: ["settings"] },
    { kind: "unknown" },
  ]) {
    it(`rejects malformed scope ${JSON.stringify(scope)}`, () => {
      const report = completeReport();
      Object.assign(fixtureValue(report.issues[0]), { scope });
      rejects(report, "schema");
    });
  }
  for (const value of [
    "2026-10-26",
    "2026-10-26T12:30:00",
    "2026-02-30T12:30:00Z",
    "2026-13-01T12:30:00Z",
    "yesterday",
  ]) {
    it(`rejects invalid or timezone-free datetime ${value}`, () => {
      const report = completeReport();
      report.review.reviewedAt = value;
      rejects(report, "schema");
    });
  }
  for (const value of [
    "2026-10-26T12:30:00Z",
    "2026-10-26T12:30:00.123+05:30",
  ]) {
    it(`accepts timezone datetime ${value}`, () => {
      const report = completeReport();
      report.review.reviewedAt = value;
      assert.equal(validateReport(report).valid, true);
    });
  }
});

describe("IDs and area references", () => {
  it("rejects duplicate areas", () => {
    const report = completeReport();
    fixtureValue(report.review.areas[1]).id = fixtureValue(
      report.review.areas[0],
    ).id;
    rejects(report, "duplicate-id");
  });
  it("rejects duplicate issues", () => {
    const report = completeReport();
    fixtureValue(report.issues[1]).id = fixtureValue(report.issues[0]).id;
    rejects(report, "duplicate-id");
  });
  it("rejects duplicate warnings", () => {
    const report = completeReport();
    report.warnings.push(structuredClone(fixtureValue(report.warnings[0])));
    rejects(report, "duplicate-id");
  });
  it("uses one issue and warning ID namespace", () => {
    const report = completeReport();
    fixtureValue(report.warnings[0]).id = fixtureValue(report.issues[0]).id;
    rejects(report, "duplicate-id");
  });
  it("keeps the area ID namespace separate", () => {
    const report = completeReport();
    fixtureValue(report.issues[0]).id = fixtureValue(report.review.areas[0]).id;
    assert.equal(validateReport(report).valid, true);
  });
  for (const path of ["/issues/1/scope", "/warnings/0/scope"]) {
    it(`rejects missing area reference in ${path}`, () => {
      const report = completeReport();
      objectAt(report, path).areaIds = ["missing"];
      rejects(report, "invalid-reference");
    });
  }
  it("allows references to explicitly unreviewed areas", () =>
    assert.equal(validateReport(warningsOnlyReport()).valid, true));
  it("does not run semantic checks on malformed input", () => {
    const report = completeReport();
    fixtureValue(report.issues[1]).id = fixtureValue(report.issues[0]).id;
    objectAt(report, "/review").areas = null;
    assert.ok(rejects(report).every((error) => error.code === "schema"));
  });
});

describe("evidence boundary", () => {
  for (const [metadata, field] of [
    ["viewport", "width"],
    ["viewport", "height"],
    ["imageDimensions", "width"],
    ["imageDimensions", "height"],
    ["scroll", "x"],
    ["scroll", "y"],
  ] as const) {
    it(`rejects proposal mismatch in ${metadata}/${field}`, () => {
      const report = completeReport();
      const proposalMetadata = objectAt(
        report,
        `/issues/0/evidence/proposedAfter/${metadata}`,
      );
      proposalMetadata[field] = Number(proposalMetadata[field]) + 1;
      rejects(report, "inconsistent-evidence");
    });
  }
  for (const key of [
    "route",
    "viewport",
    "imageDimensions",
    "scroll",
    "state",
  ]) {
    it(`rejects proposal ${key} mismatch`, () => {
      const report = completeReport();
      const proposal = objectAt(report, "/issues/0/evidence/proposedAfter");
      const replacements: MutableObject = {
        route: "/other",
        viewport: { width: 640, height: 800 },
        imageDimensions: { width: 1280, height: 1600 },
        scroll: { x: 0, y: 120.25 },
        state: "Menu closed",
      };
      proposal[key] = replacements[key];
      rejects(report, "inconsistent-evidence");
    });
  }
  it("accepts screenshot without a proposal", () => {
    const report = completeReport();
    delete objectAt(report, "/issues/0/evidence").proposedAfter;
    assert.equal(validateReport(report).valid, true);
  });
  for (const variant of [
    { kind: "unknown" },
    { kind: "nonvisual", before: {} },
    { kind: "screenshot", method: "DOM inspection" },
  ]) {
    it(`rejects mixed or unknown evidence ${JSON.stringify(variant)}`, () => {
      const report = completeReport();
      Object.assign(objectAt(report, "/issues/0/evidence"), variant);
      rejects(report, "schema");
    });
  }
  for (const key of ["viewport", "imageDimensions"]) {
    for (const value of [0, -1, 1.5, "800", NaN, Infinity, -Infinity]) {
      it(`rejects ${key} width ${String(value)}`, () => {
        const report = completeReport();
        objectAt(report, `/issues/0/evidence/before/${key}`).width = value;
        rejects(report, "schema");
      });
    }
  }
  for (const value of [NaN, Infinity, -Infinity, "0"]) {
    it(`rejects invalid scroll ${String(value)}`, () => {
      const report = completeReport();
      objectAt(report, "/issues/0/evidence/before/scroll").y = value;
      rejects(report, "schema");
    });
  }
  const unsafePaths = [
    "",
    " ",
    "../before.png",
    "images/../before.png",
    "/before.png",
    "//host/before.png",
    "C:/before.png",
    "images\\before.png",
    "https://host/before.png",
    "data:image/png;base64,abc",
    "javascript:alert(1)",
    "images/before.png?q=x",
    "images/before.png#fragment",
    "images/\u0000before.png",
    "images/\nbefore.png",
    "%2e%2e/before.png",
    "images/%2e%2e/before.png",
    "%252e%252e/before.png",
    "%2Fbefore.png",
    "%5cbefore.png",
    "images%2f..%2fbefore.png",
    "images/before.png%3Fq=x",
    "images/before.png%23fragment",
    "https%3A%2F%2Fhost/before.png",
    "%20https%3A%2F%2Fhost/before.png",
    "images/%00before.png",
    "images/%250abefore.png",
    "%25zz%252f..%252fsecret.png",
    "images/%25foo/%252e%252e/secret.png",
    " https://host/before.png",
    " //host/before.png",
    " /before.png",
    "%20https://host/before.png",
    "%20%2Fbefore.png",
  ];
  for (const image of unsafePaths) {
    it(`rejects unsafe image reference ${JSON.stringify(image)}`, () => {
      const report = completeReport();
      objectAt(report, "/issues/0/evidence/before").image = image;
      rejects(report);
    });
  }
  for (const image of [
    "./images/before.png",
    "images/account menu.png",
    "images/café.png",
    "images/account%20menu.png",
    "images%2Fbefore.png",
    "images/100%25.png",
  ]) {
    it(`accepts safe relative reference ${image}`, () => {
      const report = completeReport();
      objectAt(report, "/issues/0/evidence/before").image = image;
      assert.equal(validateReport(report).valid, true);
    });
  }
  for (const image of [
    "images/%before.png",
    "images/%2before%ZZ.png",
    "images/%E0%A4%A.png",
  ]) {
    it(`rejects malformed image encoding ${image}`, () => {
      const report = completeReport();
      objectAt(report, "/issues/0/evidence/before").image = image;
      rejects(report);
    });
  }
});

describe("structured finding locations", () => {
  for (const url of [
    "/onboarding",
    "/",
    "/settings?tab=profile#name",
    "/help.html",
  ]) {
    it(`preserves an authored location reference ${url}`, () => {
      const report = completeReport();
      fixtureValue(report.issues[0]).locations = [{ name: "Settings", url }];
      assert.deepEqual(validateReport(report), { valid: true, report });
    });
  }
  for (const url of [
    "https://example.com/settings",
    "src/Settings.tsx:42",
    "Settings screen — validation state",
    "settings",
    "//example.com/settings",
    "/\\example.com/settings",
    "/settings with spaces",
    "/settings\n",
    "/settings\tprofile",
    "/settings\u0000",
    "/settings\u007f",
    "/settings\u00a0profile",
  ]) {
    it(`rejects a location that is not an app route ${JSON.stringify(url)}`, () => {
      const report = completeReport();
      fixtureValue(report.issues[0]).locations = [{ name: "Settings", url }];
      const errors = rejects(report, "schema");
      assert.ok(
        errors.some((error) => error.path === "/issues/0/locations/0/url"),
      );
    });
  }
  for (const value of [
    "/settings: account menu",
    null,
    {},
    { name: "Settings" },
    { url: "/settings" },
    { name: " ", url: "/settings" },
    { name: "Settings", url: " " },
    { name: 12, url: "/settings" },
    { name: "Settings", url: false },
  ]) {
    it(`rejects a malformed or legacy location ${JSON.stringify(value)}`, () => {
      const report = completeReport();
      objectAt(report, "/issues/0").locations = [value];
      rejects(report, "schema");
    });
  }
});

describe("optional reviewed app base URL", () => {
  for (const baseUrl of [
    undefined,
    "https://example.com",
    "https://example.com/app/",
    "http://localhost:3000",
  ]) {
    it(`accepts base URL ${String(baseUrl)}`, () => {
      const report = completeReport();
      if (baseUrl === undefined) delete report.review.baseUrl;
      else report.review.baseUrl = baseUrl;
      assert.deepEqual(validateReport(report), { valid: true, report });
    });
  }
  for (const baseUrl of [
    "",
    "/settings",
    "ftp://example.com",
    "https:///example.com",
    "javascript:alert(1)",
    "https://user:password@example.com",
    "https://example.com/ bad",
    "https://example.com/\\bad",
    "https://example.com/\nsettings",
  ]) {
    it(`rejects unsafe or non-web base URL ${JSON.stringify(baseUrl)}`, () => {
      const report = completeReport();
      report.review.baseUrl = baseUrl;
      rejects(report, "schema", "/review/baseUrl");
    });
  }
});

describe("optional GitHub repository", () => {
  for (const githubRepository of [
    undefined,
    "https://github.com/example/example-app",
    "https://github.com/Example-Org/repo_name.v2",
    "https://github.com/a/b",
    "https://github.com/example/.github",
  ]) {
    it(`accepts repository ${String(githubRepository)} without changing input`, () => {
      const report = completeReport();
      if (githubRepository === undefined) delete report.review.githubRepository;
      else report.review.githubRepository = githubRepository;
      const original = structuredClone(report);
      assert.deepEqual(validateReport(report), { valid: true, report });
      assert.deepEqual(report, original);
    });
  }
  for (const githubRepository of [
    "",
    null,
    12,
    {},
    [],
    "example/repo",
    "http://github.com/example/repo",
    "https://gitlab.com/example/repo",
    "https://github.com.evil.test/example/repo",
    "https://user:secret@github.com/example/repo",
    "https://github.com/example",
    "https://github.com/example/repo/issues",
    "https://github.com/example/repo/",
    "https://github.com/example/repo.git",
    "https://github.com/example/repo?token=secret",
    "https://github.com/example/repo#readme",
    " https://github.com/example/repo",
    "https://github.com/example/repo\n",
    "https://github.com/example/..",
    "https://github.com/example/%2e%2e",
  ]) {
    it(`rejects malformed repository ${JSON.stringify(githubRepository)}`, () => {
      const report = completeReport();
      objectAt(report, "/review").githubRepository = githubRepository;
      rejects(report, "schema", "/review/githubRepository");
    });
  }
});
