import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, AlertTriangle, Info, CheckCircle2, X, ChevronDown } from 'lucide-react';

/**
 * AlertNotificationCenter - Displays alerts and notifications based on role
 * Supports HIGH, MEDIUM, INFO priority levels
 */
export default function AlertNotificationCenter({ alerts = [], role = 'staff' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('all'); // all, high, medium, info

  // Default alerts if none provided
  const defaultAlerts = [
    {
      id: 1,
      type: 'warning',
      priority: 'HIGH',
      title: 'Project Deadline Approaching',
      message: 'Research project "AI in Healthcare" deadline in 2 months',
      timestamp: '2 hours ago',
      actionable: true,
    },
    {
      id: 2,
      type: 'info',
      priority: 'INFO',
      title: 'Department Achievement',
      message: 'Congratulations! Your department published 5 Q1 papers this quarter',
      timestamp: '1 day ago',
      actionable: false,
    },
  ];

  const displayAlerts = alerts.length > 0 ? alerts : defaultAlerts;
  const unreadCount = displayAlerts.filter(a => !a.read).length;

  const getAlertStyle = (type, priority) => {
    if (priority === 'HIGH') {
      return {
        bg: 'bg-kle-crimson/10',
        border: 'border-kle-crimson',
        text: 'text-kle-crimson',
        icon: AlertTriangle,
      };
    }
    if (type === 'success') {
      return {
        bg: 'bg-success/10',
        border: 'border-success',
        text: 'text-success',
        icon: CheckCircle2,
      };
    }
    return {
      bg: 'bg-accent-indigo/10',
      border: 'border-accent-indigo',
      text: 'text-accent-indigo',
      icon: Info,
    };
  };

  const filteredAlerts = filter === 'all' 
    ? displayAlerts 
    : displayAlerts.filter(a => a.priority.toLowerCase() === filter);

  return (
    <div className="relative">
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-sm rounded-lg hover:bg-fog transition-colors"
      >
        <Bell size={20} className="text-graphite" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-kle-crimson text-white text-micro font-bold rounded-full flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="absolute right-0 mt-sm w-96 max-h-[600px] bg-white rounded-xl shadow-xl border border-mist z-50 overflow-hidden"
            >
              {/* Header */}
              <div className="sticky top-0 bg-white border-b border-mist px-lg py-md">
                <div className="flex items-center justify-between mb-md">
                  <h3 className="font-heading font-semibold text-h3 text-kle-dark">
                    Notifications
                  </h3>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-xs hover:bg-fog rounded-md transition-colors"
                  >
                    <X size={16} className="text-smoke" />
                  </button>
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-xs">
                  {['all', 'high', 'medium', 'info'].map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`px-md py-xs rounded-md text-micro font-medium transition-all ${
                        filter === f
                          ? 'bg-kle-crimson text-white'
                          : 'bg-fog text-graphite hover:bg-mist'
                      }`}
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Alerts List */}
              <div className="overflow-y-auto max-h-[480px]">
                {filteredAlerts.length === 0 ? (
                  <div className="p-xl text-center">
                    <Bell size={48} className="text-mist mx-auto mb-md" />
                    <p className="text-body text-smoke">No notifications</p>
                  </div>
                ) : (
                  <div className="divide-y divide-mist">
                    {filteredAlerts.map((alert, idx) => {
                      const style = getAlertStyle(alert.type, alert.priority);
                      const Icon = style.icon;

                      return (
                        <motion.div
                          key={alert.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className={`p-md hover:bg-fog/50 transition-colors ${
                            !alert.read ? 'bg-accent-teal/5' : ''
                          }`}
                        >
                          <div className="flex items-start gap-md">
                            <div className={`p-sm rounded-lg ${style.bg}`}>
                              <Icon size={16} className={style.text} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-xs mb-xs">
                                <h4 className="font-heading font-semibold text-sm text-kle-dark">
                                  {alert.title}
                                </h4>
                                {alert.priority === 'HIGH' && (
                                  <span className="px-xs py-px bg-kle-crimson text-white text-micro rounded font-bold">
                                    HIGH
                                  </span>
                                )}
                              </div>
                              <p className="text-body text-graphite mb-xs leading-relaxed">
                                {alert.message}
                              </p>
                              <span className="text-micro text-smoke">
                                {alert.timestamp}
                              </span>
                              {alert.actionable && (
                                <button className="mt-sm text-label font-medium text-accent-indigo hover:underline">
                                  View Details →
                                </button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="sticky bottom-0 bg-white border-t border-mist px-lg py-md text-center">
                <button className="text-label font-medium text-accent-indigo hover:underline">
                  View All Notifications
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
