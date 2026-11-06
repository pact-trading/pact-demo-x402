'use client';

import { useEffect, useState } from 'react';

/** Sightline's generated mark follows the merchant's current Pact logo. */
export function Mark({ className = 'h-6 w-6' }: { className?: string }) {
  const [src, setSrc] = useState('/brand/sightline.png');
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch('/api/brand', { cache: 'no-store' });
        if (!response.ok) return;
        const brand = (await response.json()) as { logoUrl: string | null };
        if (active && brand.logoUrl) {
          setSrc(brand.logoUrl);
          document.querySelector('link[rel="icon"]')?.setAttribute('href', brand.logoUrl);
        }
      } catch { /* Keep the bundled logo while the API is unavailable. */ }
    };
    void load();
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={24} height={24} className={`${className} rounded-md object-cover`} referrerPolicy="no-referrer" />
  );
}
export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <Mark />
      <span className="text-[17px] font-semibold leading-none tracking-tight text-fg">Sightline</span>
    </span>
  );
}
