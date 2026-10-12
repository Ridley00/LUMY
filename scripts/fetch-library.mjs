// Default: verify all stored bytes without replacing the curated catalogs.
// --verify-links also checks source HTTP responses.
// --download-missing restores only recorded originals with the SAME SHA-256.
// This script never imports executable book HTML or changes childSafe reviews.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const library = path.join(root, 'library');
const args = new Set(process.argv.slice(2));
const selectedId = [...args].find(arg => arg.startsWith('--id='))?.slice(5);
const selected = id => !selectedId || selectedId === id;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = async file => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
const catalog = await readJson(path.join(root, 'content/resources.json'));
const report = await readJson(path.join(root, 'content/library-report.json'));
const reader = await readJson(path.join(root, 'content/books.json'));
const manifest = await readJson(path.join(library, 'bookdash-reader-manifest.json'));
const checkedAt = new Date().toISOString();
const results = [];
const links = [];

function contained(base, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative)) throw new Error('Expected relative path');
  const file = path.resolve(base, relative);
  const rel = path.relative(base, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Path escaped library');
  return file;
}
function signature(bytes, name) {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.pdf') return bytes.subarray(0, 5).toString() === '%PDF-' && bytes.includes(Buffer.from('%%EOF'));
  if (ext === '.epub' || ext === '.zip') return bytes.subarray(0, 2).toString() === 'PK' && bytes.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (ext === '.jpg') return bytes[0] === 255 && bytes[1] === 216;
  if (ext === '.webp') return bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  if (ext === '.png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return false;
}
async function verify(file, expected, kind) {
  try {
    const bytes = await readFile(file);
    const actual = sha256(bytes);
    results.push({ file: path.relative(root, file).replaceAll('\\', '/'), kind, valid: signature(bytes, file) && actual === expected.sha256 && bytes.length === expected.bytes, bytes: bytes.length, sha256: actual });
  } catch (error) {
    results.push({ file: path.relative(root, file).replaceAll('\\', '/'), kind, valid: false, error: error.code || error.message });
  }
}
const resources = new Map(catalog.resources.map(item => [item.id, item]));
if (resources.size !== catalog.resources.length) throw new Error('Duplicate resource id');
if (selectedId && !resources.has(selectedId)) throw new Error('Unknown --id');
for (const r of resources.values()) {
  if (!r.levels?.length || r.levels.some(level => !Number.isInteger(level) || level < 0 || level > 11)) throw new Error(`Invalid levels: ${r.id}`);
  if (!['method', 'book', 'workbook', 'exam', 'bank'].includes(r.kind)) throw new Error(`Invalid kind: ${r.id}`);
  if (r.status === 'downloaded' && !r.localFile) throw new Error(`Missing file: ${r.id}`);
  if (r.childSafe && !reader.books.some(book => book.resourceId === r.id && book.childSafe === true)) throw new Error(`Missing reader review: ${r.id}`);
}
for (const file of report.files.filter(file => selected(file.resourceId))) {
  const local = contained(library, file.localFile);
  try { await readFile(local); }
  catch (error) {
    if (error.code === 'ENOENT' && args.has('--download-missing') && resources.get(file.resourceId)?.downloadAllowed && file.artifactType !== 'local_archive_of_unchanged_publisher_jpegs') {
      try {
        if (!file.sourceUrl?.startsWith('https://')) throw new Error('No verified HTTPS source');
        const response = await fetch(file.sourceUrl, { signal: AbortSignal.timeout(45000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (!signature(bytes, file.localFile) || sha256(bytes) !== file.sha256 || bytes.length !== file.bytes) throw new Error('Edition changed: new review required; nothing written');
        await writeFile(local, bytes, { flag: 'wx' });
      } catch (e) { results.push({ file: file.localFile, kind: 'restore', valid: false, error: e.cause?.code || e.message }); }
    }
  }
  await verify(local, file, 'catalog-original-or-archive');
}
for (const book of manifest.books.filter(book => selected(book.id))) {
  const view = reader.books.find(item => item.id === book.id);
  if (!view || view.pages.length !== book.images.length) throw new Error(`Reader mismatch: ${book.id}`);
  for (let i = 0; i < book.images.length; i++) {
    const page = book.images[i];
    await verify(contained(library, `bookdash-reader-sources/${book.id}/${page.file}`), page, 'publisher-jpeg');
    if (view.pages[i] !== '/' + page.readerFile.replace(/^public\//, '')) throw new Error(`Reader URL mismatch: ${book.id}/${i}`);
    await verify(contained(root, page.readerFile), { bytes: page.readerBytes, sha256: page.readerSha256 }, 'reader-webp');
  }
}
if (report.readerLibrary?.logo) await verify(contained(root, report.readerLibrary.logo.path), report.readerLibrary.logo, 'publisher-logo');
if (args.has('--verify-links')) {
  const queue = catalog.resources.filter(r => selected(r.id));
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const r = queue.shift();
      try {
        const response = await fetch(r.url, { signal: AbortSignal.timeout(25000) });
        const body = await response.text();
        const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim();
        const challenge = /just a moment|access denied|checking your browser|client challenge/i.test(title || '');
        links.push({ id: r.id, url: r.url, httpStatus: response.status, accessible: response.ok && !challenge, checkedAt: new Date().toISOString(), title });
      } catch (e) { links.push({ id: r.id, url: r.url, accessible: false, checkedAt: new Date().toISOString(), error: e.cause?.code || e.message }); }
    }
  }));
}
const check = { checkedAt, scope: selectedId || 'all', passed: results.every(r => r.valid), checkedFiles: results.length, validFiles: results.filter(r => r.valid).length, checkedBytes: results.filter(r => r.valid).reduce((n, r) => n + r.bytes, 0), files: results, sourceHttpChecks: links };
await mkdir(path.join(library, '.qa'), { recursive: true });
await writeFile(path.join(library, '.qa/verification-latest.json'), JSON.stringify(check, null, 2) + '\n');
report.localIntegrityCheck = { checkedAt, scope: check.scope, passed: check.passed, checkedFiles: check.checkedFiles, validFiles: check.validFiles, checkedBytes: check.checkedBytes, reportFile: 'library/.qa/verification-latest.json' };
await writeFile(path.join(root, 'content/library-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: check.passed, resources: catalog.resources.length, checkedFiles: check.checkedFiles, validFiles: check.validFiles, checkedBytes: check.checkedBytes, sourceChecks: links.length }));
if (!check.passed) process.exitCode = 1;
