import { motion } from 'framer-motion';
import { GraduationCap, User, AlertCircle, CheckCircle2, Clock, TrendingUp } from 'lucide-react';

/**
 * PhDTrackingPanel - Displays Ph programs, scholar status, and milestone tracking
 * Shows enrollment trends, completion rates, and individual scholar progress
 */
export default function PhDTrackingPanel({ scholars = [], stats, role = 'staff' }) {
  // Default scholars if none provided
  const defaultScholars = [
    {
      id: 1,
      name: 'Rahul Verma',
      supervisor: 'Dr. Anita Sharma',
      year: 3,
      enrollmentDate: '2021-08-01',
      expectedCompletion: '2025-08-01',
      status: 'on-track',
      milestones: {
        coursework: 'completed',
        comprehensive: 'completed',
        proposal: 'completed',
        publications: 'in-progress',
        thesis: 'pending',
      },
      publications: 4,
      progress: 60,
    },
    {
      id: 2,
      name: 'Sneha Patel',
      supervisor: 'Dr. Rajesh Kumar',
      year: 4,
      enrollmentDate: '2020-08-01',
      expectedCompletion: '2024-08-01',
      status: 'overdue',
      milestones: {
        coursework: 'completed',
        comprehensive: 'completed',
        proposal: 'completed',
        publications: 'completed',
        thesis: 'in-progress',
      },
      publications: 6,
      progress: 85,
      delayMonths: 8,
    },
    {
      id: 3,
      name: 'Amit Singh',
      supervisor: 'Dr. Priya Nair',
      year: 2,
      enrollmentDate: '2022-08-01',
      expectedCompletion: '2026-08-01',
      status: 'on-track',
      milestones: {
        coursework: 'completed',
        comprehensive: 'completed',
        proposal: 'in-progress',
        publications: 'in-progress',
        thesis: 'pending',
      },
      publications: 2,
      progress: 40,
    },
  ];

  const displayScholars = scholars.length > 0 ? scholars : defaultScholars;

  // Default stats if not provided
  const displayStats = stats || {
    totalScholars: displayScholars.length,
    onTrack: displayScholars.filter(s => s.status === 'on-track').length,
    overdue: displayScholars.filter(s => s.status === 'overdue').length,
    avgTimeToComplete: 4.2,
    completionRate: 78,
  };

  const getStatusStyle = (status) => {
    const styles = {
      'on-track': { bg: 'bg-success/10', text: 'text-success', icon: CheckCircle2, label: 'On Track' },
      'overdue': { bg: 'bg-kle-crimson/10', text: 'text-kle-crimson', icon: AlertCircle, label: 'Overdue' },
      'at-risk': { bg: 'bg-amber-500/10', text: 'text-amber-700', icon: AlertCircle, label: 'At Risk' },
    };
    return styles[status] || styles['on-track'];
  };

  const getMilestoneStyle = (status) => {
    const styles = {
      completed: { bg: 'bg-success', text: 'text-success', label: '✓' },
      'in-progress': { bg: 'bg-accent-indigo', text: 'text-accent-indigo', label: '◐' },
      pending: { bg: 'bg-mist', text: 'text-smoke', label: '○' },
    };
    return styles[status] || styles.pending;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="panel"
    >
      {/* Header with Stats */}
      <div className="mb-lg">
        <div className="flex items-center gap-sm mb-md">
          <GraduationCap size={20} className="text-accent-indigo" />
          <h3 className="font-heading font-medium text-h2 text-kle-dark">
            PhD Scholar Tracking
          </h3>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-md mb-lg">
          <div className="bg-fog/50 rounded-lg p-md">
            <p className="text-micro text-smoke uppercase tracking-wider mb-xs">Total Scholars</p>
            <p className="font-mono text-h1 font-bold text-kle-dark">{displayStats.totalScholars}</p>
          </div>
          <div className="bg-success/10 rounded-lg p-md">
            <p className="text-micro text-success uppercase tracking-wider mb-xs">On Track</p>
            <p className="font-mono text-h1 font-bold text-success">{displayStats.onTrack}</p>
          </div>
          <div className="bg-kle-crimson/10 rounded-lg p-md">
            <p className="text-micro text-kle-crimson uppercase tracking-wider mb-xs">Overdue</p>
            <p className="font-mono text-h1 font-bold text-kle-crimson">{displayStats.overdue}</p>
          </div>
          <div className="bg-fog/50 rounded-lg p-md">
            <p className="text-micro text-smoke uppercase tracking-wider mb-xs">Avg Years</p>
            <p className="font-mono text-h1 font-bold text-kle-dark">{displayStats.avgTimeToComplete}</p>
          </div>
          <div className="bg-accent-teal/10 rounded-lg p-md">
            <p className="text-micro text-accent-teal uppercase tracking-wider mb-xs">Completion %</p>
            <p className="font-mono text-h1 font-bold text-accent-teal">{displayStats.completionRate}%</p>
          </div>
        </div>
      </div>

      {/* Scholar Cards */}
      <div className="space-y-md">
        {displayScholars.map((scholar, idx) => {
          const statusStyle = getStatusStyle(scholar.status);
          const StatusIcon = statusStyle.icon;

          return (
            <motion.div
              key={scholar.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={`p-md rounded-lg border transition-all hover:shadow-md ${
                scholar.status === 'overdue'
                  ? 'border-kle-crimson bg-kle-crimson/5'
                  : 'border-mist bg-white hover:border-ash'
              }`}
            >
              {/* Scholar Header */}
              <div className="flex items-start justify-between mb-md">
                <div className="flex-1">
                  <div className="flex items-center gap-sm mb-xs">
                    <User size={16} className="text-graphite" />
                    <h4 className="font-heading font-semibold text-sm text-kle-dark">
                      {scholar.name}
                    </h4>
                  </div>
                  <p className="text-label text-graphite">
                    <span className="font-medium">Supervisor:</span> {scholar.supervisor}
                  </p>
                </div>
                <div className={`px-sm py-xs rounded-md text-micro font-medium flex items-center gap-xs ${statusStyle.bg} ${statusStyle.text}`}>
                  <StatusIcon size={12} />
                  {statusStyle.label}
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-4 gap-md mb-md">
                <div>
                  <p className="text-micro text-smoke uppercase tracking-wider mb-xs">Year</p>
                  <p className="text-body font-mono font-bold text-kle-dark">Y{scholar.year}</p>
                </div>
                <div>
                  <p className="text-micro text-smoke uppercase tracking-wider mb-xs">Publications</p>
                  <p className="text-body font-mono font-bold text-accent-indigo">{scholar.publications}</p>
                </div>
                <div>
                  <p className="text-micro text-smoke uppercase tracking-wider mb-xs">Progress</p>
                  <p className="text-body font-mono font-bold text-kle-dark">{scholar.progress}%</p>
                </div>
                <div>
                  <p className="text-micro text-smoke uppercase tracking-wider mb-xs">Expected</p>
                  <p className="text-body font-medium text-kle-dark">
                    {new Date(scholar.expectedCompletion).getFullYear()}
                  </p>
                </div>
              </div>

              {/* Milestones */}
              <div className="mb-md">
                <p className="text-micro text-smoke uppercase tracking-wider mb-sm">Milestones</p>
                <div className="flex items-center gap-md">
                  {Object.entries(scholar.milestones).map(([key, status]) => {
                    const style = getMilestoneStyle(status);
                    return (
                      <div key={key} className="flex flex-col items-center gap-xs">
                        <div className={`w-8 h-8 rounded-full ${style.bg} flex items-center justify-center text-white text-sm font-bold`}>
                          {style.label}
                        </div>
                        <span className="text-micro text-graphite capitalize">{key}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="relative w-full h-2 bg-mist rounded-full overflow-hidden">
                <div
                  className={`absolute top-0 left-0 h-full rounded-full ${
                    scholar.progress >= 80 ? 'bg-success' : scholar.progress >= 50 ? 'bg-accent-indigo' : 'bg-amber-500'
                  }`}
                  style={{ width: `${scholar.progress}%` }}
                />
              </div>

              {/* Overdue Alert */}
              {scholar.status === 'overdue' && scholar.delayMonths && (
                <div className="mt-md p-sm bg-kle-crimson/10 border border-kle-crimson rounded-md">
                  <p className="text-label text-kle-crimson flex items-center gap-xs">
                    <AlertCircle size={12} />
                    <span className="font-medium">Overdue by {scholar.delayMonths} months</span> - Intervention recommended
                  </p>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      <div className="mt-lg pt-md border-t border-mist text-center">
        <button className="text-label font-medium text-accent-indigo hover:underline">
          View All Scholars →
        </button>
      </div>
    </motion.div>
  );
}
