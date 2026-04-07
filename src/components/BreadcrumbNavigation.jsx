import { ChevronRight, Home } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

/**
 * BreadcrumbNavigation - Shows hierarchical navigation path
 * University ▸ Campus ▸ Department ▸ Faculty
 */
export default function BreadcrumbNavigation({ path = [] }) {
  // Default breadcrumb if none provided
  const defaultPath = [
    { label: 'Dashboard', href: '/', icon: Home },
  ];

  const displayPath = path.length > 0 ? path : defaultPath;

  return (
    <motion.nav
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-center gap-xs py-md px-lg bg-fog/30 rounded-lg mb-lg overflow-x-auto"
      aria-label="Breadcrumb"
    >
      <ol className="flex items-center gap-xs flex-nowrap">
        {displayPath.map((item, index) => {
          const isLast = index === displayPath.length - 1;
          const Icon = item.icon;

          return (
            <li key={index} className="flex items-center gap-xs flex-shrink-0">
              {index > 0 && (
                <ChevronRight size={14} className="text-smoke flex-shrink-0" />
              )}
              
              {isLast ? (
                <span className="flex items-center gap-xs text-body font-medium text-kle-dark">
                  {Icon && <Icon size={14} />}
                  <span>{item.label}</span>
                </span>
              ) : (
                <Link
                  to={item.href}
                  className="flex items-center gap-xs text-body text-graphite hover:text-kle-crimson transition-colors hover:underline"
                >
                  {Icon && <Icon size={14} />}
                  <span>{item.label}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </motion.nav>
  );
}
