import { motion } from 'framer-motion';
import { DollarSign, Calendar, AlertCircle, CheckCircle2, Clock } from 'lucide-react';

/**
 * FundedProjectsPanel - Displays funded research projects with status tracking
 * Shows project timeline, funding, and status indicators
 */
export default function FundedProjectsPanel({ projects = [], role = 'staff' }) {
  // Default projects if none provided
  const defaultProjects = [
    {
      id: 1,
      title: 'AI-Driven Healthcare Diagnostics',
      pi: 'Dr. Anita Sharma',
      agency: 'DST-SERB',
      amount: 2500000,
      startDate: '2023-04-01',
      endDate: '2026-03-31',
      status: 'active',
      progress: 65,
      deliverables: { completed: 4, total: 6 },
      atRisk: false,
    },
    {
      id: 2,
      title: 'Quantum Computing Applications',
      pi: 'Dr. Rajesh Kumar',
      agency: 'AICTE',
      amount: 1800000,
      startDate: '2024-01-15',
      endDate: '2026-01-14',
      status: 'active',
      progress: 35,
      deliverables: { completed: 2, total: 5 },
      atRisk: false,
    },
    {
      id: 3,
      title: 'Sustainable Energy Systems',
      pi: 'Dr. Priya Nair',
      agency: 'MNRE',
      amount: 3200000,
      startDate: '2022-07-01',
      endDate: '2025-06-30',
      status: 'at-risk',
      progress: 72,
      deliverables: { completed: 5, total: 8 },
      atRisk: true,
      riskReason: 'Deliverable pending, 3 months to deadline',
    },
  ];

  const displayProjects = projects.length > 0 ? projects : defaultProjects;

  const getStatusStyle = (status) => {
    const styles = {
      active: { bg: 'bg-success/10', text: 'text-success', icon: CheckCircle2, label: 'Active' },
      'at-risk': { bg: 'bg-amber-500/10', text: 'text-amber-700', icon: AlertCircle, label: 'At Risk' },
      completed: { bg: 'bg-accent-teal/10', text: 'text-accent-teal', icon: CheckCircle2, label: 'Completed' },
      pending: { bg: 'bg-smoke/10', text: 'text-smoke', icon: Clock, label: 'Pending' },
    };
    return styles[status] || styles.active;
  };

  const calculateTimeRemaining = (endDate) => {
    const end = new Date(endDate);
    const now = new Date();
    const diffTime = end - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const diffMonths = Math.floor(diffDays / 30);
    
    if (diffMonths > 12) return `${Math.floor(diffMonths / 12)} years left`;
    if (diffMonths > 0) return `${diffMonths} months left`;
    return `${diffDays} days left`;
  };

  const getTotalFunding = () => {
    return displayProjects.reduce((sum, p) => sum + p.amount, 0);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="panel"
    >
      <div className="flex items-center justify-between mb-lg">
        <div>
          <h3 className="font-heading font-medium text-h2 text-kle-dark mb-xs">
            Funded Research Projects
          </h3>
          <p className="text-label text-smoke">
            Total Funding: ₹{(getTotalFunding() / 10000000).toFixed(2)} Cr
          </p>
        </div>
        <div className="flex items-center gap-md">
          <div className="text-right">
            <p className="text-micro text-smoke uppercase tracking-wider">Active Projects</p>
            <p className="font-mono text-h2 font-bold text-kle-dark">
              {displayProjects.filter(p => p.status === 'active' || p.status === 'at-risk').length}
            </p>
          </div>
          <div className="text-right">
            <p className="text-micro text-smoke uppercase tracking-wider">At Risk</p>
            <p className="font-mono text-h2 font-bold text-amber-700">
              {displayProjects.filter(p => p.atRisk).length}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-md">
        {displayProjects.map((project, idx) => {
          const statusStyle = getStatusStyle(project.status);
          const StatusIcon = statusStyle.icon;

          return (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={`p-md rounded-lg border transition-all hover:shadow-md ${
                project.atRisk 
                  ? 'border-amber-500 bg-amber-500/5' 
                  : 'border-mist bg-white hover:border-ash'
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-md">
                <div className="flex-1">
                  <div className="flex items-center gap-sm mb-xs">
                    <h4 className="font-heading font-semibold text-sm text-kle-dark">
                      {project.title}
                    </h4>
                    {project.atRisk && (
                      <AlertCircle size={14} className="text-amber-700" />
                    )}
                  </div>
                  <p className="text-label text-graphite">
                    <span className="font-medium">PI:</span> {project.pi}
                  </p>
                </div>
                <div className={`px-sm py-xs rounded-md text-micro font-medium flex items-center gap-xs ${statusStyle.bg} ${statusStyle.text}`}>
                  <StatusIcon size={12} />
                  {statusStyle.label}
                </div>
              </div>

              {/* Project Details Grid */}
              <div className="grid grid-cols-3 gap-md mb-md">
                <div>
                  <p className="text-micro text-smoke uppercase tracking-wider mb-xs">Agency</p>
                  <p className="text-body font-medium text-kle-dark">{project.agency}</p>
                </div>
                <div>
                  <p className="text-micro text-smoke uppercase tracking-wider mb-xs">Funding</p>
                  <p className="text-body font-mono font-bold text-kle-dark">
                    ₹{(project.amount / 100000).toFixed(2)}L
                  </p>
                </div>
                <div>
                  <p className="text-micro text-smoke uppercase tracking-wider mb-xs">Time Left</p>
                  <p className="text-body font-medium text-kle-dark">
                    {calculateTimeRemaining(project.endDate)}
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-md">
                <div className="flex items-center justify-between mb-xs">
                  <span className="text-micro text-smoke">Overall Progress</span>
                  <span className="text-micro font-mono font-medium text-kle-dark">
                    {project.progress}%
                  </span>
                </div>
                <div className="relative w-full h-2 bg-mist rounded-full overflow-hidden">
                  <div
                    className={`absolute top-0 left-0 h-full rounded-full ${
                      project.progress >= 80 ? 'bg-success' : project.progress >= 50 ? 'bg-accent-indigo' : 'bg-amber-500'
                    }`}
                    style={{ width: `${project.progress}%` }}
                  />
                </div>
              </div>

              {/* Deliverables & Timeline */}
              <div className="flex items-center justify-between text-label">
                <span className="text-graphite">
                  <span className="font-medium">Deliverables:</span> {project.deliverables.completed}/{project.deliverables.total} completed
                </span>
                <span className="text-smoke">
                  {new Date(project.startDate).toLocaleDateString()} - {new Date(project.endDate).toLocaleDateString()}
                </span>
              </div>

              {/* At Risk Alert */}
              {project.atRisk && project.riskReason && (
                <div className="mt-md p-sm bg-amber-500/10 border border-amber-500 rounded-md">
                  <p className="text-label text-amber-800 flex items-center gap-xs">
                    <AlertCircle size={12} />
                    <span className="font-medium">Action Required:</span> {project.riskReason}
                  </p>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      <div className="mt-lg pt-md border-t border-mist text-center">
        <button className="text-label font-medium text-accent-indigo hover:underline">
          View All Projects →
        </button>
      </div>
    </motion.div>
  );
}
