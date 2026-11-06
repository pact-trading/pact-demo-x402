'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usd } from '@/lib/chain';
import { loadDesk } from '@/lib/client/vault';

/** Header pill: the desk's balance when one exists in this browser, otherwise "Open a desk". */
export function DeskBadge() {
  const [balance, setBalance] = useState<string | null>(null);
  const [has, setHas] = useState(false);
  useEffect(() => {
    // Re-read the desk on every refresh event: it may have just been opened or forgotten.
    const tick = () => {
      const desk = loadDesk();
      setHas(!!desk);
      if (!desk) return setBalance(null);
      fetch(`/api/vault/${desk.account}`).then(r => (r.ok ? r.json() : null)).then(v => v && setBalance(v.balanceMinor)).catch(() => undefined);
    };
    void tick();
    const id = setInterval(tick, 15_000);
    window.addEventListener('sightline:refresh', tick);
    return () => { clearInterval(id); window.removeEventListener('sightline:refresh', tick); };
  }, []);
  if (!has) return <Link href="/desk" className="btn btn-mint !py-2">Open a desk</Link>;
  return (
    <Link href="/desk" className="btn btn-ghost !py-2">
      <span className="size-2 rounded-full bg-mint live-dot" />
      <span className="num">{balance === null ? '…' : usd(balance)}</span>
      <span className="text-dim">USDT</span>
    </Link>
  );
}
