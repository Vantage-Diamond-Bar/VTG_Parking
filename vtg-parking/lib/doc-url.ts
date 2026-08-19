// Client-side helper for reading registration documents.
//
// The registration-docs bucket is private, so a document path is not viewable
// on its own — the browser has to trade it for a short-lived signed URL. Kept
// separate from lib/registration-docs.ts, which is server-only (it imports the
// service-role Supabase client).

export async function fetchRegistrationDocUrl(params: {
  vehicle_id: string
  /** Residents pass both; admins pass neither and authenticate by session cookie. */
  unit_id?: string
  token?: string
}): Promise<string | null> {
  try {
    const res = await fetch('/api/documents/signed-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.url ?? null
  } catch {
    return null
  }
}
