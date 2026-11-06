import { ArrowLeftRight, CandlestickChart, FileText, Newspaper, type LucideProps } from 'lucide-react';
import type { Endpoint } from '@/lib/catalog';

const ICONS = { prices: CandlestickChart, news: Newspaper, 'smart-money': ArrowLeftRight, insight: FileText } as const;

/** One icon per dataset, used in pricing, docs, the terminal and revenue. */
export function DatasetIcon({ id, ...props }: { id: Endpoint['id'] } & LucideProps) {
  const Icon = ICONS[id];
  return <Icon size={16} strokeWidth={1.75} aria-hidden {...props} />;
}
