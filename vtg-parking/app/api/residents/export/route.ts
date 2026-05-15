import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionFromRequest } from '@/lib/auth';
import { formatPDT } from '@/lib/utils';
import * as XLSX from 'xlsx';

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') || 'csv';

  const { data, error } = await supabaseAdmin
    .from('resident_vehicles')
    .select('*, units(address)')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data || []).map((v: any) => ({
    'Address': v.units?.address ?? '',
    'Owner': v.owner_name ?? '',
    'Year': v.year ?? '',
    'Make': v.make ?? '',
    'Model': v.model ?? '',
    'Color': v.color ?? '',
    'Plate': v.license_plate ?? '',
    'State': v.plate_state ?? '',
    'Phone': [v.owner_phone_country_code, v.owner_phone].filter(Boolean).join(' ') || '',
    'Email': v.owner_email ?? '',
    'SMS Opt-in': v.opt_in_sms ? 'Yes' : 'No',
    'Email Opt-in': v.opt_in_email ? 'Yes' : 'No',
    'Registered Date': formatPDT(v.created_at, { dateOnly: true }),
  }));

  if (format === 'excel') {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Residents');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="residents.xlsx"',
      },
    });
  }

  // CSV format
  if (rows.length === 0) {
    return new NextResponse('', {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="residents.csv"',
      },
    });
  }

  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(','),
    ...rows.map((row: any) =>
      headers.map((h) => `"${String(row[h]).replace(/"/g, '""')}"`).join(',')
    ),
  ];
  const csv = csvLines.join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="residents.csv"',
    },
  });
}
