'use client';

import { useState } from 'react';

export default function ResolveAlertButton({ alertId, label }: { alertId: string; label: string }) {
  const [resolving, setResolving] = useState(false);

  async function handleResolve() {
    setResolving(true);
    try {
      await fetch(`/api/admin/alerts/${alertId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: '' }),
      });
      window.location.reload();
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
