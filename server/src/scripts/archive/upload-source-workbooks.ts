/**
 * Upload the commissioner's original workbooks to the private Storage bucket
 * the archive serves them from (features/archive/sourceWorkbooks.ts).
 *
 *   ./scripts/with-prod-db.sh npx tsx src/scripts/archive/upload-source-workbooks.ts <dir>           # dry run
 *   ./scripts/with-prod-db.sh npx tsx src/scripts/archive/upload-source-workbooks.ts <dir> --apply
 *
 * <dir> holds the Drive downloads as <driveFileId>.xls (archive-work/byid).
 * Each file is checked against its recorded size and SHA-256 BEFORE upload,
 * uploaded byte-for-byte, then downloaded again and re-checked. An object that
 * already exists is never overwritten: it's verified and skipped, or the run
 * stops if it differs. Safe to re-run.
 *
 * Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment only
 * (no .env fallback, which would quietly target the local stack).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  SOURCE_WORKBOOK_BUCKET, SOURCE_WORKBOOKS, workbookObjectKey, type SourceWorkbook,
} from "../../features/archive/sourceWorkbooks.js";

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

async function main() {
  const [dir, ...flags] = process.argv.slice(2);
  const apply = flags.includes("--apply");
  if (!dir) throw new Error("usage: upload-source-workbooks.ts <dir> [--apply]");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (run through scripts/with-prod-db.sh).");
  console.log(`Target: ${new URL(url).host}  bucket: ${SOURCE_WORKBOOK_BUCKET}  ${apply ? "APPLY" : "dry run"}`);

  // One object per distinct file (2003 and 2004 share one).
  const objects = new Map<string, { wb: SourceWorkbook; years: number[]; bytes: Buffer }>();
  for (const wb of SOURCE_WORKBOOKS) {
    const path = join(dir, `${wb.driveFileId}.xls`);
    if (!existsSync(path)) throw new Error(`${wb.year}: missing ${path}`);
    const bytes = readFileSync(path);
    if (bytes.length !== wb.bytes || sha256(bytes) !== wb.sha256) {
      throw new Error(`${wb.year}: ${path} is not the recorded file (size ${bytes.length}, expected ${wb.bytes})`);
    }
    const k = workbookObjectKey(wb);
    const seen = objects.get(k);
    if (seen) seen.years.push(wb.year);
    else objects.set(k, { wb, years: [wb.year], bytes });
  }
  console.log(`${SOURCE_WORKBOOKS.length} seasons, ${objects.size} distinct files, all match their recorded SHA-256.`);

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw new Error(`listing buckets: ${listError.message}`);
  const bucket = buckets.find((b) => b.name === SOURCE_WORKBOOK_BUCKET);
  if (bucket?.public) throw new Error(`bucket ${SOURCE_WORKBOOK_BUCKET} is PUBLIC; the workbooks name owners. Make it private first.`);
  if (!bucket) {
    console.log(`Bucket ${SOURCE_WORKBOOK_BUCKET} doesn't exist${apply ? ": creating it (private)" : " (would be created, private)"}.`);
    if (apply) {
      const { error } = await supabase.storage.createBucket(SOURCE_WORKBOOK_BUCKET, { public: false });
      if (error) throw new Error(`creating bucket: ${error.message}`);
    }
  }

  let uploaded = 0, verified = 0;
  for (const [k, { wb, years, bytes }] of objects) {
    const label = `${years.join("/")} ${wb.fileName}`;
    const existing = bucket ? await supabase.storage.from(SOURCE_WORKBOOK_BUCKET).download(k) : { data: null };
    if (existing.data) {
      const got = Buffer.from(await existing.data.arrayBuffer());
      if (sha256(got) !== wb.sha256) throw new Error(`${label}: stored object ${k} differs from the original. Not overwriting; investigate.`);
      console.log(`  ok (already stored)  ${label}`);
      verified++;
      continue;
    }
    if (!apply) { console.log(`  would upload  ${label}  (${bytes.length} bytes) -> ${k}`); continue; }
    const { error } = await supabase.storage.from(SOURCE_WORKBOOK_BUCKET)
      .upload(k, bytes, { contentType: "application/vnd.ms-excel", upsert: false });
    if (error) throw new Error(`${label}: upload failed: ${error.message}`);
    const back = await supabase.storage.from(SOURCE_WORKBOOK_BUCKET).download(k);
    if (!back.data || sha256(Buffer.from(await back.data.arrayBuffer())) !== wb.sha256) {
      throw new Error(`${label}: uploaded, but the stored copy doesn't match. Investigate before serving.`);
    }
    console.log(`  uploaded + verified  ${label}`);
    uploaded++;
  }
  console.log(apply
    ? `Done: ${uploaded} uploaded, ${verified} already stored, all verified by SHA-256.`
    : `Dry run: ${objects.size - verified} to upload, ${verified} already stored. Re-run with --apply.`);
}

main().catch((err) => { console.error(String(err instanceof Error ? err.message : err)); process.exit(1); });
