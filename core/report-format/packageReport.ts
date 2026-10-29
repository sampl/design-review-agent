// Packages validated data and real PNG evidence into a report that opens offline.
import {
  copyFile,
  link,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";
import { inflateSync } from "node:zlib";
import Ajv from "ajv";
import {
  reportSchema,
  validateReport,
  type Capture,
  type Report,
} from "./index.ts";
import { safeImageReference } from "./validateReport.ts";

export type PackageReportOptions = {
  report: unknown;
  evidenceDirectory: string;
  outputDirectory: string;
  viewerDirectory: string;
  coverageCaptures?: Capture[];
};

const validCaptures = new Ajv({ strict: false }).compile<Capture[]>({
  type: "array",
  definitions: reportSchema.definitions,
  items: { $ref: "#/definitions/capture" },
});

function captures(report: Report): Capture[] {
  return report.issues.flatMap(({ evidence }) =>
    evidence.kind === "screenshot"
      ? [
          evidence.before,
          ...(evidence.proposedAfter ? [evidence.proposedAfter] : []),
        ]
      : [],
  );
}

function isContained(directory: string, filename: string): boolean {
  const path = relative(directory, filename);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`);
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let checksum = value;
  for (let bit = 0; bit < 8; bit++)
    checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0);
  return checksum >>> 0;
});

// The 256-entry table covers every masked byte index below.
function pngChecksum(bytes: Buffer): number {
  let checksum = 0xffffffff;
  for (const byte of bytes)
    checksum = (checksum >>> 8) ^ crcTable[(checksum ^ byte) & 255]!;
  return (checksum ^ 0xffffffff) >>> 0;
}

function pngDimensions(bytes: Buffer): { width: number; height: number } {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (
    bytes.length < 45 ||
    !bytes.subarray(0, 8).equals(signature) ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.toString("ascii", 12, 16) !== "IHDR"
  )
    throw new Error("Screenshot evidence must be a PNG image.");
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!width || !height || width * height > 100_000_000)
    throw new Error("Screenshot dimensions exceed the supported image bounds.");
  const bitDepth = bytes.readUInt8(24);
  const colorType = bytes.readUInt8(25);
  const channels = new Map([
    [0, 1],
    [2, 3],
    [3, 1],
    [4, 2],
    [6, 4],
  ]).get(colorType);
  const permittedDepths =
    colorType === 0
      ? [1, 2, 4, 8, 16]
      : colorType === 3
        ? [1, 2, 4, 8]
        : [8, 16];
  if (
    !channels ||
    !permittedDepths.includes(bitDepth) ||
    bytes[26] ||
    bytes[27] ||
    bytes[28]
  )
    throw new Error(
      "Screenshot PNG must use supported non-interlaced encoding.",
    );
  // Verify the compressed image is readable rather than accepting only a forged header.
  const compressed: Buffer[] = [];
  let offset = 8;
  let ended = false;
  while (offset + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(offset);
    const end = offset + size + 12;
    if (end > bytes.length) throw new Error("Screenshot PNG is truncated.");
    if (
      pngChecksum(bytes.subarray(offset + 4, end - 4)) !==
      bytes.readUInt32BE(end - 4)
    )
      throw new Error("Screenshot PNG checksum is invalid.");
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") compressed.push(bytes.subarray(offset + 8, end - 4));
    if (type === "IEND") {
      ended = true;
      break;
    }
    offset = end;
  }
  if (!ended || !compressed.length)
    throw new Error("Screenshot PNG is missing image data.");
  const rowLength = Math.ceil((width * bitDepth * channels) / 8) + 1;
  const expectedLength = rowLength * height;
  if (expectedLength > 512_000_000)
    throw new Error("Screenshot decoded image exceeds supported bounds.");
  const pixels = inflateSync(Buffer.concat(compressed), {
    maxOutputLength: expectedLength,
  });
  if (pixels.length !== expectedLength)
    throw new Error("Screenshot PNG image data does not match its dimensions.");
  for (let row = 0; row < height; row++)
    if (pixels.readUInt8(row * rowLength) > 4)
      throw new Error("Screenshot PNG contains an invalid row filter.");
  return { width, height };
}

export function embeddedReportJson(report: Report): string {
  return JSON.stringify(report)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export async function packageReport({
  report: input,
  evidenceDirectory,
  outputDirectory,
  viewerDirectory,
  coverageCaptures = [],
}: PackageReportOptions): Promise<{
  report: Report;
  outputDirectory: string;
  captures: Capture[];
}> {
  const validation = validateReport(input);
  if (!validation.valid)
    throw new Error(
      `Report validation failed: ${validation.errors.map(({ path, message }) => `${path}: ${message}`).join("; ")}`,
    );
  const report = structuredClone(validation.report);
  if (!validCaptures(coverageCaptures))
    throw new Error("Invalid coverage screenshot metadata.");
  const packagedCaptures = structuredClone(coverageCaptures);
  const evidenceRoot = await realpath(evidenceDirectory);
  const images = new Map<string, Buffer>();
  const names = new Map<string, string>();
  for (const capture of [...captures(report), ...packagedCaptures]) {
    if (!safeImageReference(capture.image))
      throw new Error(
        "Screenshot evidence must use a safe relative image path.",
      );
    const originalPath = resolve(
      evidenceRoot,
      decodeURIComponent(capture.image),
    );
    const sourcePath = await realpath(originalPath);
    if (
      !isContained(evidenceRoot, sourcePath) ||
      !(await stat(sourcePath)).isFile()
    )
      throw new Error(
        "Screenshot evidence must stay inside its evidence directory.",
      );
    const bytes = await readFile(sourcePath);
    if (bytes.length > 25_000_000)
      throw new Error("Screenshot evidence exceeds the 25 MB file limit.");
    const dimensions = pngDimensions(bytes);
    if (
      dimensions.width !== capture.imageDimensions.width ||
      dimensions.height !== capture.imageDimensions.height
    )
      throw new Error(
        `Screenshot dimensions do not match report metadata: ${capture.image}`,
      );
    let outputName = names.get(sourcePath);
    if (!outputName) {
      outputName = `images/${createHash("sha256").update(bytes).digest("hex")}.png`;
      names.set(sourcePath, outputName);
      images.set(outputName, bytes);
    }
    capture.image = outputName;
  }
  const [template, script, stylesheet] = await Promise.all([
    readFile(join(viewerDirectory, "index.html"), "utf8"),
    readFile(join(viewerDirectory, "viewer.js"), "utf8"),
    readFile(join(viewerDirectory, "viewer.css"), "utf8"),
  ]);
  const html = template
    .replace(
      '<link rel="stylesheet" href="./viewer.css" />',
      () => `<style>${stylesheet}</style>`,
    )
    .replace(
      '<script src="./viewer.js" defer></script>',
      () =>
        `<script type="application/json" id="design-qa-report">${embeddedReportJson(report)}</script>`,
    )
    .replace(
      "</body>",
      () =>
        `<script>${script.replace(/<\/script/gi, "<\\/script")}</script></body>`,
    );
  if (!html.includes('id="design-qa-report"'))
    throw new Error("Viewer template is missing its supported asset markers.");
  const destination = resolve(outputDirectory);
  await mkdir(dirname(destination), { recursive: true });
  const staging = await mkdtemp(
    join(dirname(destination), ".design-qa-report-"),
  );
  const published: string[] = [];
  const files = [
    "index.html",
    "report.json",
    "report.schema.json",
    "run-evidence.json",
    ...images.keys(),
  ];
  try {
    await mkdir(join(staging, "images"));
    await writeFile(join(staging, "index.html"), html);
    await writeFile(
      join(staging, "report.json"),
      JSON.stringify(report, null, 2),
    );
    await writeFile(
      join(staging, "run-evidence.json"),
      JSON.stringify({ captures: packagedCaptures }, null, 2),
    );
    await copyFile(
      join(viewerDirectory, "report.schema.json"),
      join(staging, "report.schema.json"),
    );
    for (const [filename, bytes] of images)
      await writeFile(join(staging, filename), bytes);
    await mkdir(destination, { recursive: true });
    const destinationRoot = await realpath(destination);
    await mkdir(join(destination, "images"), { recursive: true });
    if (
      !isContained(destinationRoot, await realpath(join(destination, "images")))
    )
      throw new Error(
        "Report images destination must not escape the report folder.",
      );
    // Link staged files exclusively: a caller's existing files are never overwritten.
    // Publish HTML last so an incomplete folder is never presented as a finished review.
    for (const filename of [
      ...files.filter((name) => name !== "index.html"),
      "index.html",
    ]) {
      await link(join(staging, filename), join(destination, filename));
      published.push(filename);
    }
    return { report, outputDirectory: destination, captures: packagedCaptures };
  } catch (error) {
    for (const filename of published) await rm(join(destination, filename));
    throw error;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
