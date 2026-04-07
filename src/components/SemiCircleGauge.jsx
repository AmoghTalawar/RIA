import { motion } from 'framer-motion';

/**
 * SemiCircleGauge – renders a publication/citation target gauge
 * matching the PPT design: a semicircle with colored zones
 * (Poor → Average → Good → Excellent) and a needle.
 */

const ZONES = [
  { label: 'Poor', start: 0, end: 40, color: '#B91C1C' },
  { label: 'Average', mid: true, start: 40, end: 60, color: '#D97706' },
  { label: 'Good', start: 60, end: 80, color: '#0F766E' },
  { label: 'Excellent', start: 80, end: 100, color: '#15803D' },
];

export default function SemiCircleGauge({
  actual,
  target,
  label,
  subtitle,
  size = 200,
}) {
  const pct = target > 0 ? Math.min((actual / target) * 100, 100) : 0;

  // SVG dimensions
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 16;
  const strokeWidth = 18;
  const innerR = r - strokeWidth / 2;

  // Helper: angle from percentage (0% = 180°, 100% = 0°)
  const pctToAngle = (p) => Math.PI - (p / 100) * Math.PI;

  // Build arc paths for each zone
  const arcPath = (startPct, endPct, radius) => {
    const a1 = pctToAngle(startPct);
    const a2 = pctToAngle(endPct);
    const x1 = cx + radius * Math.cos(a1);
    const y1 = cy - radius * Math.sin(a1);
    const x2 = cx + radius * Math.cos(a2);
    const y2 = cy - radius * Math.sin(a2);
    const largeArc = endPct - startPct > 50 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 0 ${x2} ${y2}`;
  };

  // Needle angle
  const needleAngle = pctToAngle(pct);
  const needleLen = r - 6;
  const nx = cx + needleLen * Math.cos(needleAngle);
  const ny = cy - needleLen * Math.sin(needleAngle);

  // Zone labels positions
  const zoneLabelPositions = [
    { pct: 20, label: 'Poor' },
    { pct: 50, label: 'Average' },
    { pct: 70, label: 'Good' },
    { pct: 90, label: 'Excellent' },
  ];

  // Tick mark positions
  const ticks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 30} viewBox={`0 0 ${size} ${size / 2 + 30}`}>
        {/* Zone arcs */}
        {ZONES.map((zone) => (
          <path
            key={zone.label}
            d={arcPath(zone.start, zone.end, innerR)}
            fill="none"
            stroke={zone.color}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
          />
        ))}

        {/* Tick marks */}
        {ticks.map((t) => {
          const angle = pctToAngle(t);
          const outerR = innerR + strokeWidth / 2 + 2;
          const tickR = outerR + 6;
          const x1 = cx + outerR * Math.cos(angle);
          const y1 = cy - outerR * Math.sin(angle);
          const x2 = cx + tickR * Math.cos(angle);
          const y2 = cy - tickR * Math.sin(angle);
          // Show numbers for major ticks
          const isMain = t % 20 === 0 || t === 50;
          const lx = cx + (tickR + 10) * Math.cos(angle);
          const ly = cy - (tickR + 10) * Math.sin(angle);
          return (
            <g key={t}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#78716C" strokeWidth={1} />
              {isMain && (
                <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fill="#44403C" fontSize={9} fontFamily="Inter">
                  {t}
                </text>
              )}
            </g>
          );
        })}

        {/* Zone text labels along the arc */}
        {zoneLabelPositions.map((zl) => {
          const angle = pctToAngle(zl.pct);
          const lr = innerR - 14;
          const lx = cx + lr * Math.cos(angle);
          const ly = cy - lr * Math.sin(angle);
          const rotation = -(angle * 180) / Math.PI + 90;
          return (
            <text
              key={zl.label}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#44403C"
              fontSize={8}
              fontWeight={500}
              fontFamily="Inter"
              transform={`rotate(${rotation}, ${lx}, ${ly})`}
            >
              {zl.label}
            </text>
          );
        })}

        {/* Needle */}
        <motion.line
          x1={cx}
          y1={cy}
          initial={{ x2: cx + needleLen * Math.cos(Math.PI), y2: cy - needleLen * Math.sin(Math.PI) }}
          animate={{ x2: nx, y2: ny }}
          transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
          stroke="#1C1917"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        {/* Needle center dot */}
        <circle cx={cx} cy={cy} r={4} fill="#1C1917" />

        {/* Value text */}
        <text x={cx} y={cy + 18} textAnchor="middle" fill="#1C1917" fontSize={13} fontWeight={700} fontFamily="'JetBrains Mono', monospace">
          {actual} / {target}
        </text>
      </svg>

      {/* Label */}
      {label && (
        <p className="text-center font-heading font-medium text-kle-dark text-sm mt-xs">{label}</p>
      )}
      {subtitle && (
        <p className="text-center text-xs text-smoke">{subtitle}</p>
      )}
    </div>
  );
}
