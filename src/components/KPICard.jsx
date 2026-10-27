import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { motion } from 'framer-motion';

// Format number in Indian numbering system
function formatIndianNumber(num) {
  if (num === null || num === undefined) return '—';
  
  const numStr = num.toString();
  const lastThree = numStr.substring(numStr.length - 3);
  const otherNumbers = numStr.substring(0, numStr.length - 3);
  
  if (otherNumbers !== '') {
    return otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree;
  }
  return lastThree;
}

export default function KPICard({ 
  label, 
  value, 
  delta, 
  deltaLabel = 'vs last year',
  unit = '',
  accentColor = 'kle-crimson',
  icon: Icon,
  sparklineData,
  onClick
}) {
  const isPositive = delta > 0;
  const isNegative = delta < 0;
  const isNeutral = delta === 0;

  const getAccentClass = () => {
    switch (accentColor) {
      case 'teal': return 'bg-accent-teal';
      case 'gold': return 'bg-accent-gold';
      case 'indigo': return 'bg-accent-indigo';
      default: return 'bg-kle-crimson';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={`kpi-card cursor-pointer hover:shadow-hover transition-shadow ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`${label}: ${value}${unit}, ${delta}% ${deltaLabel}`}
    >
      {/* Accent Bar Override */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${getAccentClass()}`} />
      
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* Label */}
          <p className="text-micro uppercase tracking-wider text-smoke mb-sm">
            {label}
          </p>
          
          {/* Value */}
          <div className="flex items-baseline gap-xs">
            <span className="font-mono text-3xl font-bold text-kle-dark">
              {typeof value === 'number' ? formatIndianNumber(value) : value}
            </span>
            {unit && (
              <span className="text-label text-smoke">{unit}</span>
            )}
          </div>
          
          {/* Delta */}
          {delta !== undefined && (
            <div className="flex items-center gap-xs mt-sm">
              {isPositive && (
                <>
                  <TrendingUp size={14} className="text-success" />
                  <span className="text-label text-success font-medium">+{delta}%</span>
                </>
              )}
              {isNegative && (
                <>
                  <TrendingDown size={14} className="text-danger" />
                  <span className="text-label text-danger font-medium">{delta}%</span>
                </>
              )}
              {isNeutral && (
                <>
                  <Minus size={14} className="text-smoke" />
                  <span className="text-label text-smoke font-medium">0%</span>
                </>
              )}
              <span className="text-label text-smoke">{deltaLabel}</span>
            </div>
          )}
        </div>

        {/* Icon */}
        {Icon && (
          <div className={`p-sm rounded-md ${getAccentClass()} bg-opacity-10`}>
            <Icon size={20} className={`text-${accentColor === 'kle-crimson' ? 'kle-crimson' : `accent-${accentColor}`}`} />
          </div>
        )}
      </div>

      {/* Sparkline placeholder */}
      {sparklineData && sparklineData.length > 0 && (
        <div className="mt-md h-8 flex items-end gap-[2px]">
          {sparklineData.map((val, idx) => {
            const maxVal = Math.max(...sparklineData);
            const height = maxVal > 0 ? (val / maxVal) * 100 : 0;
            return (
              <div
                key={idx}
                className={`flex-1 ${getAccentClass()} bg-opacity-60 rounded-t-sm transition-all`}
                style={{ height: `${height}%` }}
              />
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
