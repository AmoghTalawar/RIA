import { motion } from 'framer-motion';
import { Sparkles, TrendingUp, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

/**
 * AIInsightsPanel - Displays AI-generated insights and recommendations
 * Role-aware component that shows contextual insights based on user level
 */
export default function AIInsightsPanel({ insights = [], loading = false, role = 'staff' }) {
  const getRoleTitle = () => {
    const titles = {
      staff: 'Personal Insights & Recommendations',
      hod: 'Department Intelligence Briefing',
      'faculty-dean': 'Faculty-Level Strategic Insights',
      'executive-dean': 'Campus Intelligence Summary',
      'university-dean': 'Institutional Strategic Intelligence',
    };
    return titles[role] || 'AI-Generated Insights';
  };

  const getInsightIcon = (type) => {
    const icons = {
      success: CheckCircle2,
      warning: AlertTriangle,
      trend: TrendingUp,
      info: Info,
    };
    return icons[type] || Info;
  };

  const getInsightStyle = (type) => {
    const styles = {
      success: 'bg-success/10 border-success text-success',
      warning: 'bg-amber-500/10 border-amber-500 text-amber-700',
      trend: 'bg-accent-indigo/10 border-accent-indigo text-accent-indigo',
      info: 'bg-accent-teal/10 border-accent-teal text-accent-teal',
    };
    return styles[type] || styles.info;
  };

  // Default insights if none provided
  const defaultInsights = [
    {
      type: 'trend',
      title: 'Citation Growth Trend',
      message: 'Your citations increased by 23% this quarter, outpacing department average of 15%.',
      priority: 'medium',
    },
    {
      type: 'info',
      title: 'Target Progress',
      message: 'On track to meet annual publication target with current pace of 2.3 papers per quarter.',
      priority: 'low',
    },
  ];

  const displayInsights = insights.length > 0 ? insights : defaultInsights;

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="panel"
      >
        <div className="flex items-center gap-sm mb-lg">
          <Sparkles size={18} className="text-accent-indigo animate-pulse" />
          <h3 className="font-heading font-medium text-h2 text-kle-dark">
            Generating Insights...
          </h3>
        </div>
        <div className="space-y-sm">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-fog rounded-lg animate-pulse" />
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="panel"
    >
      <div className="flex items-center justify-between mb-md">
        <div className="flex items-center gap-sm">
          <Sparkles size={16} className="text-accent-indigo" />
          <h3 className="font-heading font-medium text-body text-kle-dark">
            {getRoleTitle()}
          </h3>
        </div>
        <span className="text-micro text-smoke bg-accent-indigo/10 px-sm py-xs rounded-md font-medium">
          AI-Powered
        </span>
      </div>

      <div className="space-y-sm">
        {displayInsights.map((insight, idx) => {
          const Icon = getInsightIcon(insight.type);
          const styleClass = getInsightStyle(insight.type);

          return (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={`p-sm rounded-lg border ${styleClass} transition-all hover:shadow-sm cursor-default`}
            >
              <div className="flex items-start gap-sm">
                <Icon size={15} className="flex-shrink-0 mt-xs" />
                <div className="flex-1 min-w-0">
                  <h4 className="font-heading font-semibold text-sm text-kle-dark">
                    {insight.title}
                  </h4>
                  <p className="text-label text-graphite leading-snug">
                    {insight.message}
                  </p>
                  {insight.action && (
                    <button className="mt-sm text-label font-medium hover:underline">
                      {insight.action}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-md pt-sm border-t border-mist flex items-center justify-between">
        <p className="text-micro text-smoke">
          <span className="font-medium">Updated:</span> March 7, 2026
        </p>
        <button className="text-label text-accent-indigo font-medium hover:underline">
          Full Briefing →
        </button>
      </div>
    </motion.div>
  );
}
