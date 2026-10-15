#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const EMU_PER_PX = 9525;
const requireFromHere = createRequire(import.meta.url);
const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = {};
  const allowed = new Set(['manifest', 'out', 'build-dir', 'workspace-dir']);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') {
      console.log('Usage: node package_images.mjs --manifest PATH --out PATH --build-dir PATH [--workspace-dir PATH]');
      console.log('Manifest/workspace paths resolve from cwd. Relative output/build paths resolve from the manifest directory and must remain inside workspace-dir (default: cwd).');
      process.exit(0);
    }
    if (!token.startsWith('--')) fail(`Unknown argument: ${token}`);
    const key = token.slice(2);
    if (!allowed.has(key)) fail(`Unknown option: --${key}`);
    if (Object.hasOwn(args, key)) fail(`Duplicate option: --${key}`);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for --${key}`);
    args[key] = value;
    i += 1;
  }
  for (const key of ['manifest', 'out', 'build-dir']) {
    if (!args[key]) fail(`Required argument missing: --${key}`);
  }
  return args;
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function parsePng(bytes, label) {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    fail(`${label}: expected a PNG file`);
  }
  if (bytes.readUInt32BE(12) !== 0x49484452) fail(`${label}: PNG has no IHDR`);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!width || !height) fail(`${label}: PNG dimensions are zero`);
  let position = 8;
  let ended = false;
  const dataChunks = [];
  while (position < bytes.length) {
    if (position + 12 > bytes.length) fail(`${label}: truncated PNG chunk`);
    const length = bytes.readUInt32BE(position);
    const chunkEnd = position + 12 + length;
    if (chunkEnd > bytes.length) fail(`${label}: truncated PNG chunk payload`);
    const type = bytes.subarray(position + 4, position + 8).toString('ascii');
    const payloadEnd = position + 8 + length;
    const checksum = bytes.readUInt32BE(payloadEnd);
    if (crc32(bytes.subarray(position + 4, payloadEnd)) !== checksum) fail(`${label}: PNG chunk CRC mismatch`);
    if (type === 'IDAT') dataChunks.push(bytes.subarray(position + 8, payloadEnd));
    if (type === 'IEND') {
      if (length !== 0 || chunkEnd !== bytes.length) fail(`${label}: invalid PNG IEND`);
      ended = true;
    }
    position = chunkEnd;
  }
  if (!ended || !dataChunks.length) fail(`${label}: incomplete PNG`);
  try {
    if (!inflateSync(Buffer.concat(dataChunks)).length) fail(`${label}: empty PNG pixel stream`);
  } catch (error) { fail(`${label}: invalid PNG pixel stream`); }
  return { width, height };
}

function resolveInside(root, relativeValue, label) {
  if (typeof relativeValue !== 'string' || !relativeValue.trim()) fail(`${label}: path is required`);
  if (path.isAbsolute(relativeValue)) fail(`${label}: path must be relative to the manifest`);
  const resolved = path.resolve(root, relativeValue);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    fail(`${label}: path escapes the manifest directory`);
  }
  return resolved;
}

async function readManifest(manifestPath) {
  let raw;
  try {
    raw = await fs.readFile(manifestPath, 'utf8');
  } catch (error) {
    fail(`Cannot read manifest ${manifestPath}: ${error.message}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch (error) {
    fail(`Invalid JSON manifest: ${error.message}`);
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) fail('Manifest must be a JSON object');
  if (typeof manifest.title !== 'string' || !manifest.title.trim()) fail('Manifest title is required');
  const size = manifest.slide_size ?? { width: 1280, height: 720 };
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
    fail('slide_size.width and slide_size.height must be positive numbers');
  }
  if (!Array.isArray(manifest.slides) || manifest.slides.length === 0) fail('Manifest slides must be a non-empty array');

  const root = path.dirname(manifestPath);
  const ids = new Set();
  const imageHashes = new Set();
  const imagePaths = new Set();
  const slides = [];
  for (let index = 0; index < manifest.slides.length; index += 1) {
    const item = manifest.slides[index];
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail(`slides[${index}] must be an object`);
    if (typeof item.id !== 'string' || !item.id.trim()) fail(`slides[${index}].id is required`);
    if (ids.has(item.id)) fail(`Duplicate slide id: ${item.id}`);
    ids.add(item.id);
    if (typeof item.title !== 'string' || !item.title.trim()) fail(`slides[${index}].title is required`);
    let imagePath = resolveInside(root, item.image_file, `slides[${index}].image_file`);
    try { imagePath = await fs.realpath(imagePath); } catch (error) { fail(`Cannot read slides[${index}] image ${item.image_file}: ${error.message}`); }
    if (path.relative(root, imagePath).startsWith('..') || path.isAbsolute(path.relative(root, imagePath))) fail(`${item.image_file}: resolved image escapes the manifest directory`);
    const imageKey = path.normalize(imagePath).toLowerCase();
    if (imagePaths.has(imageKey)) fail(`Duplicate image_file: ${item.image_file}`);
    imagePaths.add(imageKey);
    let bytes;
    try {
      bytes = await fs.readFile(imagePath);
    } catch (error) {
      fail(`Cannot read slides[${index}] image ${item.image_file}: ${error.message}`);
    }
    const dimensions = parsePng(bytes, item.image_file);
    const expectedRatio = size.width / size.height;
    const actualRatio = dimensions.width / dimensions.height;
    if (Math.abs(actualRatio - expectedRatio) > 0.005) {
      fail(`${item.image_file}: aspect ratio ${dimensions.width}x${dimensions.height} does not match slide_size ${size.width}x${size.height}`);
    }
    const digest = sha256(bytes);
    if (imageHashes.has(digest)) fail(`Duplicate image content: ${item.image_file}`);
    imageHashes.add(digest);
    let promptPath = null;
    if (item.prompt_file !== undefined && item.prompt_file !== null) {
      promptPath = resolveInside(root, item.prompt_file, `slides[${index}].prompt_file`);
      try { promptPath = await fs.realpath(promptPath); } catch (error) { fail(`Cannot read prompt_file ${item.prompt_file}: ${error.message}`); }
      if (path.relative(root, promptPath).startsWith('..') || path.isAbsolute(path.relative(root, promptPath))) fail(`${item.prompt_file}: resolved prompt escapes the manifest directory`);
    }
    if (item.notes !== undefined && typeof item.notes !== 'string') fail(`slides[${index}].notes must be a string`);
    if (item.sources !== undefined && (!Array.isArray(item.sources) || item.sources.some(source => typeof source !== 'string'))) {
      fail(`slides[${index}].sources must be an array of strings`);
    }
    if (item.insert_after_original !== undefined && item.insert_after_original !== null &&
        (!Number.isInteger(item.insert_after_original) || item.insert_after_original < 0)) {
      fail(`slides[${index}].insert_after_original must be a non-negative integer or null`);
    }
    slides.push({
      id: item.id,
      title: item.title,
      notes: item.notes ?? '',
      sources: item.sources ?? [],
      insert_after_original: item.insert_after_original ?? null,
      image_file: item.image_file,
      imagePath,
      prompt_file: item.prompt_file ?? null,
      promptPath,
      bytes,
      width: dimensions.width,
      height: dimensions.height,
      sha256: digest,
    });
  }
  return { manifest, manifestPath, root, slideSize: size, slides };
}

function resolveArtifactSpecifier() {
  const configured = process.env.ARTIFACT_TOOL_PACKAGE?.trim();
  const modulePaths = process.env.RUNTIME_NODE_MODULES?.trim() ? [process.env.RUNTIME_NODE_MODULES.trim()] : undefined;
  const request = configured || '@oai/artifact-tool';
  try {
    const resolved = path.isAbsolute(request) ? requireFromHere.resolve(request) : requireFromHere.resolve(request, modulePaths ? { paths: modulePaths } : undefined);
    return pathToFileURL(resolved).href;
  } catch (error) {
    fail(`Cannot resolve ${request}. Discover the runtime with load_workspace_dependencies and set ARTIFACT_TOOL_PACKAGE or RUNTIME_NODE_MODULES: ${error.message}`);
  }
}

async function packageSlides(input, outPath, buildDir, workspaceDir) {
  const artifact = await import(resolveArtifactSpecifier());
  const { Presentation, PresentationFile, FileBlob } = artifact;
  if (!Presentation || !PresentationFile || !FileBlob) fail('Resolved artifact-tool package does not export Presentation, PresentationFile, and FileBlob');
  const presentation = Presentation.create({ slideSize: input.slideSize });
  for (const page of input.slides) {
    const slide = presentation.slides.add();
    slide.background.fill = '#F8F4EB';
    slide.images.add({
      blob: page.bytes,
      contentType: 'image/png',
      alt: page.title,
      fit: 'cover',
      position: { left: 0, top: 0, width: input.slideSize.width, height: input.slideSize.height },
    });
    const noteLines = [`${page.id}: ${page.title}`];
    if (page.insert_after_original !== null) noteLines.push(`Suggested insertion after original slide ${page.insert_after_original}.`);
    if (page.notes) noteLines.push(page.notes);
    if (page.sources.length) noteLines.push('Sources:', ...page.sources);
    slide.speakerNotes.textFrame.setText(noteLines.join('\n'));
  }

  const candidatePath = path.join(buildDir, 'candidate.pptx');
  await (await PresentationFile.exportPptx(presentation)).save(candidatePath);
  const skillDir = process.env.PRESENTATIONS_SKILL_DIR?.trim();
  const pythonExecutable = process.env.RUNTIME_PYTHON?.trim();
  if (!skillDir) fail('PRESENTATIONS_SKILL_DIR is required; use the directory containing the presentations SKILL.md from the available skills catalog');
  if (!pythonExecutable) fail('RUNTIME_PYTHON is required; discover it with load_workspace_dependencies');
  const utilityPath = path.join(skillDir, 'container_tools', 'artifact_tool_utils.mjs');
  const integrityPath = path.join(skillDir, 'container_tools', 'inspect_presentation_package_integrity.py');
  const layoutPath = path.join(skillDir, 'container_tools', 'inspect_presentation_layout_geometry.py');
  for (const file of [utilityPath, integrityPath, layoutPath]) {
    try { await fs.access(file); } catch (error) { fail(`Presentation skill resource is unavailable: ${file}`); }
  }
  const { finalizePresentation } = await import(pathToFileURL(utilityPath).href);
  if (typeof finalizePresentation !== 'function') fail(`finalizePresentation is unavailable in ${utilityPath}`);
  const expectedWidthEmu = Math.round(input.slideSize.width * EMU_PER_PX);
  const expectedHeightEmu = Math.round(input.slideSize.height * EMU_PER_PX);
  const receipt = await finalizePresentation({
    explicitTotalSlideCount: input.slides.length,
    requiredNativeTableOwnerSlides: [],
    requiredNativeChartOwnerSlides: [],
    workspaceDir,
    candidatePath,
    finalPath: outPath,
    pythonExecutable,
    integrityValidatorPath: integrityPath,
    layoutValidatorPath: layoutPath,
    layoutArgs: [`--expected-slide-size-emu`, `${expectedWidthEmu},${expectedHeightEmu}`, `--validate-bullet-geometry`, `--validate-heading-fit`],
    verifyArtifactToolImport: true,
    receiptPath: path.join(buildDir, 'validation.json'),
  });

  const renderedDir = path.join(buildDir, 'rendered');
  await fs.mkdir(renderedDir);
  const renderer = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--internal-render', input.manifestPath, outPath, renderedDir], { encoding: 'utf8', env: process.env });
  const renderReceiptPath = path.join(renderedDir, 'render_complete.json');
  let renderReceipt;
  try { renderReceipt = JSON.parse(await fs.readFile(renderReceiptPath, 'utf8')); }
  catch (error) { fail(`Re-import/render failed: ${renderer.stderr || renderer.error?.message || renderer.status}`); }
  if (renderReceipt.slide_count !== input.slides.length) fail('Rendered slide count differs from manifest');
  for (const filename of renderReceipt.files) parsePng(await fs.readFile(path.join(renderedDir, filename)), filename);
  // This Windows runtime can finish and save every render, then fail during
  // native renderer teardown. A complete receipt plus valid PNGs permits only
  // that known exit code; all other renderer failures remain fatal.
  const nativeTeardownCode = process.platform === 'win32' && [-1073740791, 3221226505].includes(renderer.status);
  if (renderer.status !== 0 && !nativeTeardownCode) fail(`Renderer exited with status ${renderer.status}: ${renderer.stderr}`);
  const packageManifest = {
    title: input.manifest.title,
    slide_size: input.slideSize,
    slides: input.slides.map(page => ({ id: page.id, title: page.title, image_file: page.image_file, prompt_file: page.prompt_file, sha256: page.sha256 })),
    output: path.basename(outPath),
    finalization: receipt,
    render_worker_exit_code: renderer.status,
    render_native_teardown_observed: nativeTeardownCode,
  };
  await fs.writeFile(path.join(buildDir, 'package_manifest.json'), JSON.stringify(packageManifest, null, 2), 'utf8');
}

async function renderWorker(manifestPath, outPath, renderedDir) {
  const input = await readManifest(path.resolve(manifestPath));
  const { PresentationFile, FileBlob } = await import(resolveArtifactSpecifier());
  const imported = await PresentationFile.importPptx(await FileBlob.load(outPath));
  const filenames = [];
  for (let index = 0; index < input.slides.length; index += 1) {
    const slide = imported.slides.getItem(index);
    if (!slide) fail(`Re-imported deck is missing slide ${index + 1}`);
    const preview = await imported.export({ slide, format: 'png', scale: 1 });
    const filename = `${String(index + 1).padStart(2, '0')}.png`;
    const bytes = new Uint8Array(await preview.arrayBuffer());
    parsePng(Buffer.from(bytes), filename);
    await fs.writeFile(path.join(renderedDir, filename), bytes);
    filenames.push(filename);
  }
  await fs.writeFile(path.join(renderedDir, 'render_complete.json'), JSON.stringify({ slide_count: input.slides.length, files: filenames }), 'utf8');
}

async function main() {
  if (process.argv[2] === '--internal-render') {
    await renderWorker(process.argv[3], process.argv[4], process.argv[5]);
    return;
  }
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = path.resolve(args.manifest);
  const manifestRoot = path.dirname(await fs.realpath(manifestPath));
  const workspaceDir = await fs.realpath(path.resolve(args['workspace-dir'] ?? process.cwd()));
  if (!(await fs.stat(workspaceDir)).isDirectory()) fail('--workspace-dir must identify an existing project directory');
  const outPath = path.resolve(manifestRoot, args.out);
  const buildDir = path.resolve(manifestRoot, args['build-dir']);
  if (path.extname(outPath).toLowerCase() !== '.pptx') fail('--out must use a .pptx extension');
  try { await fs.access(outPath); fail(`Refusing to overwrite existing output: ${outPath}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const outputDir = path.dirname(outPath);
  const withinWorkspace = candidate => {
    const relative = path.relative(workspaceDir, candidate);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  };
  const contains = (parent, candidate) => {
    const relative = path.relative(parent, candidate);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  };
  if (!withinWorkspace(buildDir) || !withinWorkspace(outPath)) fail('Output and build directory must remain inside workspace-dir');
  if (contains(buildDir, outputDir) || contains(outputDir, buildDir)) fail('Build and output directories must be separate and must not contain one another');
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(buildDir, { recursive: true });
  const realOutputDir = await fs.realpath(outputDir);
  const realBuildDir = await fs.realpath(buildDir);
  if (!withinWorkspace(realOutputDir) || !withinWorkspace(realBuildDir)) fail('Resolved output/build directory escapes workspace-dir');
  if (contains(realBuildDir, realOutputDir) || contains(realOutputDir, realBuildDir)) fail('Resolved build and output directories must not contain one another');
  const existing = await fs.readdir(buildDir);
  if (existing.length) fail(`Refusing to reuse non-empty build directory: ${buildDir}`);
  const input = await readManifest(manifestPath);
  await packageSlides(input, outPath, buildDir, workspaceDir);
  console.log(JSON.stringify({ ok: true, output: outPath, slide_count: input.slides.length, build_dir: buildDir }, null, 2));
}

main().then(() => process.exit(0)).catch(error => {
  console.error(`package_images: ERROR: ${error.message}`);
  process.exit(1);
});
