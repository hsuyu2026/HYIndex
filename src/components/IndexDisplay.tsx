import { formatIndex, formatSigned } from '../engine/calculations';

export function getDirectionTone(val: number | null | undefined): {
  textClass: string;
  bgClass: string;
  borderClass: string;
  arrow: string;
} {
  if (val === null || val === undefined || Number.isNaN(val) || Math.abs(val) < 1e-9) {
    return {
      textClass: 'text-[#94A3B8]',
      bgClass: 'bg-[#1E2530]/60',
      borderClass: 'border-[#334155]',
      arrow: '—',
    };
  }
  if (val > 0) {
    return {
      textClass: 'text-[#EF4444]',
      bgClass: 'bg-[#EF4444]/10',
      borderClass: 'border-[#EF4444]/30',
      arrow: '▲',
    };
  }
  return {
    textClass: 'text-[#22C55E]',
    bgClass: 'bg-[#22C55E]/10',
    borderClass: 'border-[#22C55E]/30',
    arrow: '▼',
  };
}

export function ChangeDisplay({
  points,
  suffix = '點',
  percent,
  percentPrefix = '',
  size = 'md',
}: {
  points: number | null | undefined;
  suffix?: string;
  percent?: number | null;
  percentPrefix?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const tone = getDirectionTone(points);
  const sizeClass =
    size === 'lg' ? 'text-lg' : size === 'sm' ? 'text-xs' : 'text-sm';

  if (points === null || points === undefined || Number.isNaN(points)) {
    return (
      <span className={`font-mono tabular-nums text-[#64748B] ${sizeClass}`}>
        --
      </span>
    );
  }

  return (
    <span className={`font-mono tabular-nums font-medium inline-flex items-baseline gap-1.5 ${tone.textClass} ${sizeClass}`}>
      <span>
        <span aria-hidden="true">{tone.arrow}</span>
        {formatSigned(points, 2)}
        {suffix}
      </span>
      {percent !== null && percent !== undefined && !Number.isNaN(percent) && (
        <span>
          ({percentPrefix}
          {formatSigned(percent, 2)}%)
        </span>
      )}
    </span>
  );
}

export function ScoreValue({
  value,
  className = '',
}: {
  value: number | null | undefined;
  className?: string;
}) {
  return (
    <span className={`font-mono tabular-nums ${value === null || value === undefined ? 'text-[#64748B]' : 'text-[#F8FAFC]'} ${className}`}>
      {formatIndex(value)}
    </span>
  );
}
