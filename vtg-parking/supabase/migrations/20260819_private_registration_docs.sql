-- Private registration-docs bucket: store the object path, not a public URL.
--
-- The registration-docs bucket holds DMV registration documents (PII). It was
-- created Public, so anyone holding a URL could read any document. The app now
-- mints short-lived signed URLs at read time (POST /api/documents/signed-url),
-- and signing needs the object path rather than a URL.
--
-- EXPAND/CONTRACT, deliberately not a rename. A RENAME COLUMN would break the
-- running deployment the instant it lands and stay broken until the new build
-- goes live. Adding a second column instead lets both versions run at once:
--   old code reads/writes registration_doc_url
--   new code reads/writes registration_doc_path
-- so this migration is safe to apply before, during, or after the deploy.
--
-- The old column is dropped later, in a follow-up migration, once the new build
-- is confirmed healthy — see the bottom of this file.

-- ─── 1. Add the new column ───────────────────────────────────────────────────
ALTER TABLE resident_vehicles
  ADD COLUMN IF NOT EXISTS registration_doc_path text;

COMMENT ON COLUMN resident_vehicles.registration_doc_path IS
  'Object path inside the PRIVATE registration-docs bucket, e.g. "{unit_id}/ABC123.pdf". Never a URL — sign it at read time. Stored rather than derived: residents can change license_plate after upload, and the stored file is not renamed.';

-- ─── 2. Backfill from the existing public URLs ───────────────────────────────
-- Strips the public-object prefix, leaving "{unit_id}/{filename}".
-- Idempotent: only touches rows that still look like a public URL and have no
-- path yet, so re-running cannot corrupt values written by the new code.
UPDATE resident_vehicles
   SET registration_doc_path = regexp_replace(
         registration_doc_url,
         '^.*/storage/v1/object/public/registration-docs/', '')
 WHERE registration_doc_path IS NULL
   AND registration_doc_url LIKE '%/storage/v1/object/public/registration-docs/%';

-- ─── 3. Verify the backfill before going further ─────────────────────────────
-- Every row that has a document must now have a usable path, and no path may
-- still be a URL. Fails loudly rather than leaving documents unreadable once
-- the bucket goes private.
DO $$
DECLARE
  v_missing integer;
  v_urlish  integer;
BEGIN
  SELECT count(*) INTO v_missing
  FROM resident_vehicles
  WHERE registration_doc_url IS NOT NULL AND registration_doc_path IS NULL;

  SELECT count(*) INTO v_urlish
  FROM resident_vehicles
  WHERE registration_doc_path LIKE 'http%';

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % row(s) have a doc URL but no path', v_missing;
  END IF;

  IF v_urlish > 0 THEN
    RAISE EXCEPTION 'Backfill wrong: % path(s) are still URLs', v_urlish;
  END IF;
END $$;

-- ─── 4. Follow-up, NOT part of this migration ────────────────────────────────
-- Once the new build is live and documents are confirmed viewable, drop the old
-- column in a separate migration:
--
--   ALTER TABLE resident_vehicles DROP COLUMN registration_doc_url;
--
-- Until then it stays as the rollback path: reverting the deploy restores a
-- fully working system with no database change.
--
-- Flipping the bucket itself is the last step of all, and only after the new
-- build is verified — it is what actually breaks the old public URLs:
--
--   UPDATE storage.buckets SET public = false WHERE id = 'registration-docs';
--   -- instant rollback: SET public = true
