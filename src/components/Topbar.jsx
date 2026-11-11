import { useLocation, useNavigate } from 'react-router-dom';
import { User, LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import AlertNotificationCenter from './AlertNotificationCenter';

const pageTitles = {
  '/staff': 'Staff Dashboard',
  '/department': 'Department Dashboard',
  '/faculty-dean': 'Faculty Dean Dashboard',
  '/executive-dean': 'Executive Dean Dashboard',
  '/university': 'University Dashboard',
  '/profile': 'My Research Profile',
  '/settings': 'Settings',
};

const pageSubtitles = {
  '/staff': 'Individual Faculty Research Analytics',
  '/department': 'Departmental Performance Overview',
  '/faculty-dean': 'Multi-Department Comparison',
  '/executive-dean': 'Campus-Level Strategic View',
  '/university': 'University-Wide Research Intelligence',
  '/profile': 'Your own publications, citations and metrics',
  '/settings': 'Your account details and password',
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

        {/* Right: notifications and who is signed in */}
        <div className="flex items-center gap-lg">
          {/* Notifications */}
          <AlertNotificationCenter role={user?.role} />

          {/* Sign out */}
          <button
            onClick={async () => { await logout(); navigate('/login', { replace: true }); }}
            className="flex items-center gap-xs text-body text-graphite hover:text-kle-crimson transition-colors"
            title="Sign Out"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Sign Out</span>
          </button>

          {/* User Avatar */}
          <div className="flex items-center gap-sm">
            <div className="w-8 h-8 bg-kle-crimson rounded-md flex items-center justify-center">
              <User size={16} className="text-white" />
            </div>
            <div className="hidden lg:block">
              <p className="text-body font-medium text-kle-dark">{user?.name || 'User'}</p>
              <p className="text-label text-smoke">{user?.department || ''}</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
