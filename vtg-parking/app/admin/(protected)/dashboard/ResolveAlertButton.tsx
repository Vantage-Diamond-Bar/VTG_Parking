'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ResolveAlertButton({ alertId, label }: { alertId: string; label: string }) {
  const [resolving, setResolving] = useState(false);
  const router = useRouter();

  async function handleResolve() {
    setResolving(true);
    try {
      const res = await fetch(`/api/admin/alerts/${alertId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: '' }),
      });
      if (res.ok) router.refresh();
    } finally {
      setResolving(false);
    }
  }

  return (
    <button
      onClick={handleResolve}
      disabled={resolving}
      className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
    >
      {resolving ? '…' : label}
    </button>
  );
}
