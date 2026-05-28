'use client';

import { useState, useEffect, useRef } from 'react';

interface Unit {
  id: string;
  address: string;
}

interface UnitSearchInputProps {
  units: Unit[];
  value: string;             // selected unit_id ('' if none)
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
}

export default function UnitSearchInput({
  units,
  value,
  onChange,
  placeholder = 'Type to search your unit address…',
  className = '',
}: UnitSearchInputProps) {
  const [inputText, setInputText] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync display text when value is set/cleared externally
  useEffect(() => {
    const unit = units.find((u) => u.id === value);
    setInputText(unit?.address ?? '');
  }, [value, units]);

  // Close dropdown on outside click; restore address if user abandoned mid-type
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        const unit = units.find((u) => u.id === value);
        setInputText(unit?.address ?? '');
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [value, units]);

  const filtered = units.filter((u) =>
    inputText.trim() === ''
      ? true
      : u.address.toLowerCase().includes(inputText.trim().toLowerCase())
  );

  function handleInputChange(text: string) {
    setInputText(text);
    setOpen(true);
    if (text.trim() === '') onChange('');   // clear selection when field is emptied
  }

  function handleSelect(unit: Unit) {
    setInputText(unit.address);
    onChange(unit.id);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={inputText}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
      />

      {open && (
        <ul className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm text-gray-400 italic">No matching addresses</li>
          ) : (
            filtered.map((u) => {
              const query = inputText.trim().toLowerCase();
              const addr = u.address;
              const idx = query ? addr.toLowerCase().indexOf(query) : -1;

              return (
                <li
                  key={u.id}
                  // onMouseDown + preventDefault keeps the input focused while selecting
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(u); }}
                  className={`px-4 py-2.5 text-sm cursor-pointer transition-colors
                    ${u.id === value
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  {idx >= 0 ? (
                    <>
                      {addr.slice(0, idx)}
                      <span className="font-semibold text-blue-600">{addr.slice(idx, idx + query.length)}</span>
                      {addr.slice(idx + query.length)}
                    </>
                  ) : (
                    addr
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
