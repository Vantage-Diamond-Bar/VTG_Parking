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
