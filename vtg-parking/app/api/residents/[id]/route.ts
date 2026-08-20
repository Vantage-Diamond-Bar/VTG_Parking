import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { deleteRegistrationDocsIfUnreferenced } from '@/lib/registration-docs'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { make, model, color, license_plate, plate_state, owner_phone, owner_phone_country_code, owner_email, opt_in_sms, opt_in_email, registrant_type } = body

  const { data, error } = await supabaseAdmin
    .from('resident_vehicles')
    .update({ make, model, color, license_plate, plate_state, owner_phone, owner_phone_country_code: owner_phone_country_code ?? null, owner_email, opt_in_sms, opt_in_email, registrant_type })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Read the document path before the row disappears with it.
  const { data: vehicle } = await supabaseAdmin
    .from('resident_vehicles')
    .select('registration_doc_path')
    .eq('id', id)
    .maybeSingle()

  const { error } = await supabaseAdmin
    .from('resident_vehicles')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await deleteRegistrationDocsIfUnreferenced([vehicle?.registration_doc_path])
  return NextResponse.json({ success: true })
}
