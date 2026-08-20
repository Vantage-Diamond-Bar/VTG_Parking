import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { deleteRegistrationDocsIfUnreferenced } from '@/lib/registration-docs'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const { data, error } = await supabaseAdmin
    .from('units')
    .update(body)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, unit: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // resident_vehicles cascades on units, so deleting a unit silently takes its
  // vehicle rows with it — and their documents would be stranded in the bucket
  // with nothing left pointing at them. Collect the paths first.
  const { data: vehicles } = await supabaseAdmin
    .from('resident_vehicles')
    .select('registration_doc_path')
    .eq('unit_id', id)

  const { error } = await supabaseAdmin
    .from('units')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await deleteRegistrationDocsIfUnreferenced(
    (vehicles ?? []).map((v) => v.registration_doc_path)
  )
  return NextResponse.json({ success: true })
}
