import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockIn, mockRemove, mockFrom, mockStorageFrom } = vi.hoisted(() => {
  const mockIn = vi.fn()
  const mockRemove = vi.fn()
  const mockFrom = vi.fn(() => ({ select: vi.fn(() => ({ in: mockIn })) }))
  const mockStorageFrom = vi.fn(() => ({ remove: mockRemove }))
  return { mockIn, mockRemove, mockFrom, mockStorageFrom }
})

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: mockFrom, storage: { from: mockStorageFrom } },
}))

import { deleteRegistrationDocsIfUnreferenced } from './registration-docs'

const A = 'unit-1/AAA111.pdf'
const B = 'unit-1/BBB222.jpg'

/** Rows that still point at a document. */
function stillReferenced(paths: string[]) {
  mockIn.mockResolvedValue({ data: paths.map((p) => ({ registration_doc_path: p })), error: null })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRemove.mockResolvedValue({ error: null })
})

describe('deleteRegistrationDocsIfUnreferenced', () => {
  it('removes a document nothing points at any more', async () => {
    stillReferenced([])
    const result = await deleteRegistrationDocsIfUnreferenced([A])
    expect(mockRemove).toHaveBeenCalledWith([A])
    expect(result).toEqual({ deleted: 1, skipped: 0 })
  })

  // Object paths are {unit_id}/{plate}.ext and update_doc upserts, so two rows
  // genuinely can share a file: rename a vehicle's plate A→B, then register a
  // new vehicle as plate A and its upload lands on the original path.
  it('keeps a document another vehicle still references', async () => {
    stillReferenced([A])
    const result = await deleteRegistrationDocsIfUnreferenced([A])
    expect(mockRemove).not.toHaveBeenCalled()
    expect(result).toEqual({ deleted: 0, skipped: 1 })
  })

  it('removes only the unreferenced ones from a batch', async () => {
    stillReferenced([A])
    const result = await deleteRegistrationDocsIfUnreferenced([A, B])
    expect(mockRemove).toHaveBeenCalledWith([B])
    expect(result).toEqual({ deleted: 1, skipped: 1 })
  })

  it('ignores nulls and blanks without touching storage', async () => {
    const result = await deleteRegistrationDocsIfUnreferenced([null, undefined, ''])
    expect(mockFrom).not.toHaveBeenCalled()
    expect(mockRemove).not.toHaveBeenCalled()
    expect(result).toEqual({ deleted: 0, skipped: 0 })
  })

  it('deduplicates repeated paths', async () => {
    stillReferenced([])
    await deleteRegistrationDocsIfUnreferenced([A, A, A])
    expect(mockRemove).toHaveBeenCalledWith([A])
  })

  // The row is already gone by the time this runs. Throwing here would turn a
  // successful deletion into an error for the user, and the worst case of
  // giving up is the orphan we already had.
  it('keeps files and reports rather than throwing when the check fails', async () => {
    mockIn.mockResolvedValue({ data: null, error: { message: 'db down' } })
    const result = await deleteRegistrationDocsIfUnreferenced([A])
    expect(mockRemove).not.toHaveBeenCalled()
    expect(result).toEqual({ deleted: 0, skipped: 1 })
  })

  it('does not throw when storage removal fails', async () => {
    stillReferenced([])
    mockRemove.mockResolvedValue({ error: { message: 'storage down' } })
    const result = await deleteRegistrationDocsIfUnreferenced([A])
    expect(result).toEqual({ deleted: 0, skipped: 1 })
  })

  it('does not throw when the client blows up entirely', async () => {
    mockIn.mockRejectedValue(new Error('boom'))
    await expect(deleteRegistrationDocsIfUnreferenced([A])).resolves.toEqual({
      deleted: 0,
      skipped: 1,
    })
  })
})
