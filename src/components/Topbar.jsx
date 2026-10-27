import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Search, ChevronDown, Download, Printer, User, LogOut } from 'lucide-react';
import { useAuth, ROLE_LABELS } from '../auth/AuthContext';
import AlertNotificationCenter from './AlertNotificationCenter';

const pageTitles = {
  '/staff': 'Staff Dashboard',
  '/department': 'Department Dashboard',
  '/faculty-dean': 'Faculty Dean Dashboard',
  '/executive-dean': 'Executive Dean Dashboard',
  '/university': 'University Dashboard',
};

const pageSubtitles = {
  '/staff': 'Individual Faculty Research Analytics',
  '/department': 'Departmental Performance Overview',
  '/faculty-dean': 'Multi-Department Comparison',
  '/executive-dean': 'Campus-Level Strategic View',
  '/university': 'University-Wide Research Intelligence',
};

export default function Topbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const title = pageTitles[location.pathname] || 'Dashboard';
  const subtitle = pageSubtitles[location.pathname] || '';

  return (
    <header className="bg-white border-b border-mist px-xl py-lg">
      <div className="flex items-center justify-between">
        {/* Left: Title */}
        <div>
          <h1 className="font-heading font-semibold text-h1 text-kle-dark">{title}</h1>
          <p className="text-label text-smoke">{subtitle}</p>
        </div>

        {/* Center: Search */}
        <div className="hidden md:flex items-center flex-1 max-w-md mx-xl">
          <div className="relative w-full">
            <Search size={16} className="absolute left-md top-1/2 -translate-y-1/2 text-smoke" />
            <input
              type="text"
              placeholder="Search publications, faculty, journals..."
              className="w-full pl-10 pr-lg py-sm bg-fog border border-mist rounded-md text-body text-kle-dark placeholder:text-smoke focus:outline-none focus:border-kle-crimson"
            />
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-lg">
          {/* Year Selector */}
          <div className="hidden sm:flex items-center gap-xs bg-fog border border-mist rounded-md px-md py-sm cursor-pointer hover:border-ash">
            <span className="text-body text-graphite">2025</span>
            <ChevronDown size={14} className="text-smoke" />
          </div>

          {/* Export */}
          <button className="hidden sm:flex items-center gap-xs text-body text-graphite hover:text-kle-crimson transition-colors">
            <Download size={16} />
            <span>Export</span>
          </button>

          {/* Print */}
          <button className="hidden sm:flex items-center gap-xs text-body text-graphite hover:text-kle-crimson transition-colors">
            <Printer size={16} />
          </button>

          {/* Notifications */}
          <AlertNotificationCenter role={user?.role} />

          {/* Logout */}
          <button
            onClick={() => { logout(); navigate('/login', { replace: true }); }}
            className="flex items-center gap-xs text-body text-graphite hover:text-kle-crimson transition-colors"
            title="Sign Out"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Sign Out</span>
          </button>

          {/* User Avatar */}
          <div className="flex items-center gap-sm cursor-pointer">
            <div className="w-8 h-8 bg-kle-crimson rounded-md flex items-center justify-center">
              <User size={16} className="text-white" />
            </div>
            <div className="hidden lg:block">
              <p className="text-body font-medium text-kle-dark">{user?.name || 'User'}</p>
              <p className="text-label text-smoke">{user?.department || ''}</p>
            </div>
            <ChevronDown size={14} className="text-smoke hidden lg:block" />
          </div>
        </div>
      </div>
    </header>
  );
}
