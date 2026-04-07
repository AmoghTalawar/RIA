import { motion } from 'framer-motion';
import { Target, TrendingUp, AlertCircle } from 'lucide-react';

/**
 * TargetProgressCard - Shows progress toward targets with traffic-light indicators
 * Green (≥90%), Amber (60-89%), Red (<60%)
 */
export default function TargetProgressCard({ 
  title, 
  current, 
  target, 
  unit = '', 
  period = 'Annual',
  subtitle,
  trend
}) {
  const percentage = target > 0 ? (current / target) * 100 : 0;
  
  const getStatus = () => {
    if (!target) return null;
    if (percentage >= 90) return { color: 'success', bg: 'bg-success', text: 'On Track', light: 'bg-success/10' };
    if (percentage >= 60) return { color: 'amber-500', bg: 'bg-amber-500', text: 'At Risk', light: 'bg-amber-500/10' };
    return { color: 'kle-crimson', bg: 'bg-kle-crimson', text: 'Off Track', light: 'bg-kle-crimson/10' };
  };

  const status = getStatus();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -2, boxShadow: '0 8px 16px rgba(0,0,0,0.1)' }}
      className="panel cursor-default transition-all"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-sm">
        <div className="flex-1">
          <div className="flex items-center gap-xs mb-xs">
            <Target size={14} className={status ? `text-${status.color}` : 'text-kle-crimson'} />
            <h4 className="font-heading font-semibold text-sm text-kle-dark">
              {title}
            </h4>
          </div>
          {subtitle && (
            <p className="text-micro text-smoke">{subtitle}</p>
          )}
        </div>
        
        {/* Traffic Light Indicator */}
        {target && status && <div className={`w-3 h-3 rounded-full ${status.bg} shadow-md`} title={status.text} />}
      </div>

      {/* Progress Bar & Values */}
      <div className="mb-sm">
        <div className="flex items-end justify-between mb-xs">
          <div>
            {target && <p className="text-label text-smoke">{period} Target</p>}
            {!target && <p className="text-label text-smoke">{period || 'Current'}</p>}
            <p className="font-mono text-h2 font-bold text-kle-dark">
              {current.toLocaleString('en-IN')}
              {target ? <span className="text-body text-smoke font-normal"> / {target.toLocaleString('en-IN')}</span> : null}
              {unit && <span className="text-label text-smoke ml-xs">{unit}</span>}
            </p>
          </div>
          {target && status && (
            <span className={`font-mono text-h3 font-bold text-${status.color}`}>
              {percentage.toFixed(0)}%
            </span>
          )}
        </div>
        
        {target && status && (
          <div className="relative w-full h-2 bg-mist rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(percentage, 100)}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className={`absolute top-0 left-0 h-full ${status.bg} rounded-full`}
            />
          </div>
        )}
      </div>

      {/* Status Badge and Trend */}
      <div className="flex items-center justify-between">
        {target && status ? (
          <span className={`px-md py-xs rounded-md text-micro font-medium ${status.light} text-${status.color}`}>
            {status.text}
          </span>
        ) : <div />}
        
        {trend && (
          <div className="flex items-center gap-xs">
            {trend > 0 ? (
              <>
                <TrendingUp size={14} className="text-success" />
                <span className="text-micro font-mono text-success">+{trend}%</span>
              </>
            ) : (
              <>
                <AlertCircle size={14} className="text-kle-crimson" />
                <span className="text-micro font-mono text-kle-crimson">{trend}%</span>
              </>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
