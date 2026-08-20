// Helpers for the PRIVATE registration-docs bucket.
//
// The bucket holds DMV registration documents (PII) and is not public: nothing
// may be handed to a browser except a short-lived signed URL minted here.
//
// resident_vehicles.registration_doc_path stores the object path, never a URL.

import { supabaseAdmin } from '@/lib/supabase'

export const REGISTRATION_DOCS_BUCKET = 'registration-docs'

// Signed URLs are handed to a browser and are bearer credentials until they
// expire — whoever holds one can read the document. Keep the window short; a
// viewer only needs long enough to open the file.
export const SIGNED_URL_TTL_SECONDS = 300

/**
 * Every object lives under `{unit_id}/`. Enforcing that prefix is what stops a
 * caller from pointing a vehicle row at another unit's document: the signed-URL
 * endpoint authorises by the vehicle's unit, so an unchecked path would let a
 * registrant read any file in the bucket by storing someone else's path.
 */
export function isPathOwnedByUnit(path: string, unit_id: string): boolean {
  if (!path || !unit_id) return false
  if (path.includes('..')) return false
  return path.startsWith(`${unit_id}/`)
}

/**
 * Removes registration documents that no vehicle row points at any more.
 *
 * Call this *after* the rows are gone. Deleting rows without deleting their
 * documents leaves unreachable PII sitting in the bucket forever; deleting the
 * file first risks a row that survives and now points at nothing.
 *
 * The reference check is not paranoia. Object paths are `{unit_id}/{plate}.ext`
 * and `update_doc` upserts, so two rows genuinely can share one file: rename a
 * vehicle's plate A→B, register another vehicle as plate A, and its upload
 * lands on the first vehicle's original path. Deleting one row's document
 * would then blank the other's.
 *
 * Best-effort by design — a storage failure must not turn a successful
 * deletion into an error for the user. Worst case is the orphan we already had.
 */
export async function deleteRegistrationDocsIfUnreferenced(
  paths: (string | null | undefined)[]
): Promise<{ deleted: number; skipped: number }> {
  const candidates = [...new Set(paths.filter((p): p is string => !!p))]
  if (candidates.length === 0) return { deleted: 0, skipped: 0 }

  try {
    const { data: stillUsed, error } = await supabaseAdmin
      .from('resident_vehicles')
      .select('registration_doc_path')
      .in('registration_doc_path', candidates)

    if (error) {
      console.error('[registration-docs] reference check failed, keeping files:', error.message)
      return { deleted: 0, skipped: candidates.length }
    }

    const referenced = new Set((stillUsed ?? []).map((r) => r.registration_doc_path))
    const removable = candidates.filter((p) => !referenced.has(p))
    if (removable.length === 0) return { deleted: 0, skipped: candidates.length }

    const { error: removeError } = await supabaseAdmin.storage
      .from(REGISTRATION_DOCS_BUCKET)
      .remove(removable)

    if (removeError) {
      console.error('[registration-docs] remove failed:', removeError.message)
      return { deleted: 0, skipped: candidates.length }
    }

    return { deleted: removable.length, skipped: candidates.length - removable.length }
  } catch (e) {
    console.error('[registration-docs] cleanup threw:', e)
    return { deleted: 0, skipped: candidates.length }
  }
}

/** Mints a short-lived signed URL, or null if the object is gone. */
export async function signRegistrationDoc(
  path: string,
  expiresIn: number = SIGNED_URL_TTL_SECONDS
): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from(REGISTRATION_DOCS_BUCKET)
    .createSignedUrl(path, expiresIn)

  if (error || !data) return null
  return data.signedUrl
}
