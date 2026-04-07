import { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Target,
  Users,
  Award,
  ClipboardList,
  Calendar,
  ChevronDown,
} from 'lucide-react';
import { AVAILABLE_YEARS, pageVariants } from './deptConstants';

const deptSubNav = [
  { path: '/department', label: 'Overview', icon: LayoutDashboard, end: true },
  { path: '/department/research', label: 'Research Outcomes', icon: Target },
  { path: '/department/faculty', label: 'Faculty Data', icon: Users },
  { path: '/department/scores', label: 'Scores & Bands', icon: Award },
  { path: '/department/faculty-list', label: 'Faculty List', icon: ClipboardList },
];

export default function DeptLayout() {
  const [selectedYear, setSelectedYear] = useState(2023);
  const [yearOpen, setYearOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="space-y-lg">
      {/* Page Header with Year Selector */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between flex-wrap gap-md"
      >
        <div>
          <h2 className="font-heading font-semibold text-h1 text-kle-dark">
            Department Dashboard: CSE
          </h2>
          <p className="text-label text-smoke">BVB Campus · Academic Year 2025-26</p>
        </div>

        {/* Year selector dropdown */}
        <div className="relative">
          <button
            onClick={() => setYearOpen(!yearOpen)}
            className="flex items-center gap-sm px-lg py-sm bg-white border border-mist rounded-lg shadow-sm hover:border-ash transition-all group"
          >
            <Calendar size={16} className="text-kle-crimson" />
            <span className="font-heading font-medium text-sm text-kle-dark">
              Year: {selectedYear}
            </span>
            <ChevronDown
              size={14}
              className={`text-smoke transition-transform ${yearOpen ? 'rotate-180' : ''}`}
            />
          </button>

          <AnimatePresence>
            {yearOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-xs bg-white border border-mist rounded-lg shadow-lg z-50 overflow-hidden min-w-[140px]"
              >
                {AVAILABLE_YEARS.map((yr) => (
                  <button
                    key={yr}
                    onClick={() => {
                      setSelectedYear(yr);
                      setYearOpen(false);
                    }}
                    className={`w-full px-lg py-sm text-left text-sm transition-colors ${
                      yr === selectedYear
                        ? 'bg-kle-crimson text-white font-semibold'
                        : 'text-kle-dark hover:bg-fog'
                    }`}
                  >
                    {yr}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Sub-page tab navigation */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="flex flex-wrap gap-xs bg-fog/50 p-xs rounded-xl border border-mist/50"
      >
        {deptSubNav.map((item) => {
          const Icon = item.icon;
          const isActive = item.end
            ? location.pathname === item.path
            : location.pathname.startsWith(item.path) && item.path !== '/department';

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive: navActive }) =>
                `flex items-center gap-sm px-md py-sm rounded-lg text-sm font-medium transition-all ${
                  navActive
                    ? 'bg-white text-kle-crimson shadow-sm border border-mist/60'
                    : 'text-graphite hover:text-kle-dark hover:bg-white/60'
                }`
              }
            >
              <Icon size={15} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </motion.div>

      {/* Sub-page content via Outlet — pass selectedYear as context */}
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname + selectedYear}
          variants={pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          <Outlet context={{ selectedYear, setSelectedYear }} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
