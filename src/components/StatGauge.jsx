import { motion } from 'framer-motion';

export default function StatGauge({
  actual,
  target,
  label,
  size = 'md',
  showLegend = true
}) {
  const percentage = target > 0 ? Math.min((actual / target) * 100, 120) : 0;
  
  // Determine zone and color
  const getZone = () => {
    if (percentage < 40) return { color: '#B91C1C', label: 'Critical', bgColor: 'rgba(185, 28, 28, 0.1)' };
    if (percentage < 60) return { color: '#B45309', label: 'At Risk', bgColor: 'rgba(180, 83, 9, 0.1)' };
    if (percentage < 80) return { color: '#0F766E', label: 'On Track', bgColor: 'rgba(15, 118, 110, 0.1)' };
    return { color: '#15803D', label: 'Excellent', bgColor: 'rgba(21, 128, 61, 0.1)' };
  };
  
  const zone = getZone();
  
  const sizeConfig = {
    sm: { width: 100, height: 100, stroke: 6, fontSize: 16, labelSize: 10 },
    md: { width: 140, height: 140, stroke: 8, fontSize: 24, labelSize: 11 },
    lg: { width: 180, height: 180, stroke: 10, fontSize: 32, labelSize: 12 },
  };
  
  const config = sizeConfig[size] || sizeConfig.md;
  const radius = (config.width - config.stroke) / 2;
  const circumference = Math.PI * radius; // Half circle
  const strokeDashoffset = circumference - (circumference * Math.min(percentage, 100)) / 100;

  return (
    <div className="flex flex-col items-center">
      <div 
        className="relative"
        style={{ width: config.width, height: config.height / 2 + 20 }}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={actual}
        aria-label={`${label}: ${actual} of ${target}`}
      >
        <svg
          width={config.width}
          height={config.height / 2 + 10}
          viewBox={`0 0 ${config.width} ${config.height / 2 + 10}`}
        >
          {/* Background arc */}
          <path
            d={`M ${config.stroke / 2} ${config.height / 2} 
                A ${radius} ${radius} 0 0 1 ${config.width - config.stroke / 2} ${config.height / 2}`}
            fill="none"
            stroke="#E0E7FF"
            strokeWidth={config.stroke}
            strokeLinecap="round"
          />
          
          {/* Colored arc */}
          <motion.path
            d={`M ${config.stroke / 2} ${config.height / 2} 
                A ${radius} ${radius} 0 0 1 ${config.width - config.stroke / 2} ${config.height / 2}`}
            fill="none"
            stroke={zone.color}
            strokeWidth={config.stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
        </svg>
        
        {/* Center text */}
        <div 
          className="absolute inset-0 flex flex-col items-center justify-end pb-1"
          style={{ paddingBottom: 4 }}
        >
          <span 
            className="font-mono font-bold text-kle-dark leading-none"
            style={{ fontSize: config.fontSize }}
          >
            {actual}
          </span>
          <span 
            className="text-smoke"
            style={{ fontSize: config.labelSize }}
          >
            / {target}
          </span>
        </div>
      </div>
      
      {/* Label */}
      <p 
        className="text-center font-heading font-medium text-kle-dark mt-sm"
        style={{ fontSize: config.labelSize + 1 }}
      >
        {label}
      </p>
      
      {/* Zone indicator */}
      {showLegend && (
        <div 
          className="flex items-center gap-xs mt-xs px-sm py-xs rounded-sm"
          style={{ backgroundColor: zone.bgColor }}
        >
          <div 
            className="w-2 h-2 rounded-full" 
            style={{ backgroundColor: zone.color }}
          />
          <span 
            className="text-micro uppercase font-semibold"
            style={{ color: zone.color, fontSize: 10 }}
          >
            {zone.label}
          </span>
          <span 
            className="font-mono text-graphite"
            style={{ fontSize: 10 }}
          >
            {percentage.toFixed(0)}%
          </span>
        </div>
      )}
    </div>
  );
}
