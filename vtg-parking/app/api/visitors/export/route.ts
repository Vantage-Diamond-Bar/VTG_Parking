import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdmin } from '@/lib/auth';
import { formatPDT } from '@/lib/utils';
import * as XLSX from 'xlsx';

// Prevent CSV/Excel formula injection: cells starting with =, +, -, @ are
// prefixed with a tab so spreadsheet apps treat them as plain text.
function sanitizeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `\t${value}` : value;
}

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') || 'csv';

  const { data, error } = await supabaseAdmin
    .from('visitor_registrations')
    .select('*, units(address)')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data || []).map((v: any) => ({
    'Access Code': v.access_code ?? '',
    'Unit': v.units?.address ?? '',
    'Guest': sanitizeCell(v.visitor_name ?? ''),
    'Plate': sanitizeCell(v.license_plate ?? ''),
    'State': v.plate_state ?? '',
    'Make': sanitizeCell(v.make ?? ''),
    'Model': sanitizeCell(v.model ?? ''),
    'Color': v.color ?? '',
    'Start': formatPDT(v.start_datetime, { short: true }),
    'End': formatPDT(v.end_datetime, { short: true }),
    'Created': formatPDT(v.created_at, { short: true }),
  }));

  if (format === 'excel') {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Visitors');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="visitors.xlsx"',
      },
    });
  }

  // CSV format
  if (rows.length === 0) {
    return new NextResponse('', {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="visitors.csv"',
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
      'Content-Disposition': 'attachment; filename="visitors.csv"',
    },
  });
}
