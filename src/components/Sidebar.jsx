import { NavLink, useLocation } from 'react-router-dom';
import kleLogo from '../assets/logo.png';
import { 
  LayoutDashboard, 
  Users, 
  Building2, 
  GraduationCap, 
  Globe,
  BookOpen,
  TrendingUp,
  FileText,
  Settings,
  LogOut,
  Target,
  Award,
  ClipboardList,
  ChevronRight,
} from 'lucide-react';
import { useAuth, ROLE_LABELS } from '../auth/AuthContext';

const allNavItems = [
  { path: '/staff', label: 'Staff Dashboard', icon: LayoutDashboard, description: 'Individual Faculty', role: 'staff' },
  { path: '/department', label: 'Department', icon: Users, description: 'HoD View', role: 'hod' },
  { path: '/faculty-dean', label: 'Faculty Dean', icon: Building2, description: 'Multi-Department', role: 'faculty-dean' },
  { path: '/executive-dean', label: 'Executive Dean', icon: GraduationCap, description: 'Campus Level', role: 'executive-dean' },
  { path: '/university', label: 'University', icon: Globe, description: 'University-Wide', role: 'university-dean' },
];

// Sub-navigation for HoD Department dashboard
const deptSubNav = [
  { path: '/department', label: 'Overview', icon: LayoutDashboard, end: true },
  { path: '/department/research', label: 'Research Outcomes', icon: Target },
  { path: '/department/faculty', label: 'Faculty Data', icon: Users },
  { path: '/department/scores', label: 'Scores & Bands', icon: Award },
  { path: '/department/faculty-list', label: 'Faculty List', icon: ClipboardList },
];

const secondaryNav = [
  { path: '/publications', label: 'Publications', icon: BookOpen },
  { path: '/analytics', label: 'Analytics', icon: TrendingUp },
  { path: '/reports', label: 'Reports', icon: FileText },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const location = useLocation();
  const { user, logout } = useAuth();

  // Only show the nav item for the logged-in user's role
  const navItems = allNavItems.filter((item) => item.role === user?.role);

  return (
    <aside className="sidebar-nav flex flex-col">
      {/* KLE Logo Section */}
      <div className="p-lg border-b border-graphite">
        <img src={kleLogo} alt="KLE Tech" className="w-full h-auto object-contain" />
        <p className="mt-sm text-micro text-smoke text-center uppercase tracking-wider">R&D Dashboard</p>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 py-lg overflow-y-auto">
        <p className="px-lg py-sm text-micro text-smoke uppercase tracking-wider">Dashboards</p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
          const isHod = item.role === 'hod';
          
          return (
            <div key={item.path}>
              <NavLink
                to={item.path}
                end={isHod}
                className={`nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon size={18} className={isActive ? 'text-kle-crimson' : 'text-smoke'} />
                <div className="flex-1">
                  <span className="block text-sm">{item.label}</span>
                  <span className="text-xs text-smoke">{item.description}</span>
                </div>
                {isHod && (
                  <ChevronRight
                    size={14}
                    className={`text-smoke transition-transform ${isActive ? 'rotate-90' : ''}`}
                  />
                )}
              </NavLink>

              {/* HoD sub-navigation */}
              {isHod && isActive && (
                <div className="ml-[18px] pl-md border-l border-graphite/30 my-xs space-y-px">
                  {deptSubNav.map((sub) => {
                    const SubIcon = sub.icon;
                    const subActive = sub.end
                      ? location.pathname === sub.path
                      : location.pathname.startsWith(sub.path) && sub.path !== '/department';
                    
                    return (
                      <NavLink
                        key={sub.path}
                        to={sub.path}
                        end={sub.end}
                        className={`flex items-center gap-sm px-md py-xs rounded-md text-xs transition-colors ${
                          subActive
                            ? 'text-kle-crimson bg-kle-crimson/10 font-medium'
                            : 'text-smoke hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <SubIcon size={13} />
                        <span>{sub.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div className="my-lg mx-lg border-t border-graphite" />

        <p className="px-lg py-sm text-micro text-smoke uppercase tracking-wider">Tools</p>
        {secondaryNav.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={18} className="text-smoke" />
              <span className="text-sm">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* User Info & Logout */}
      <div className="p-lg border-t border-graphite">
        {user && (
          <div className="mb-md">
            <p className="text-sm text-white font-medium truncate">{user.name}</p>
            <p className="text-xs text-smoke truncate">{ROLE_LABELS[user.role]}</p>
            <p className="text-xs text-smoke truncate">{user.department}</p>
          </div>
        )}
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-sm py-sm px-md rounded-md text-sm text-smoke hover:text-white hover:bg-kle-crimson/20 transition-colors"
        >
          <LogOut size={16} />
          <span>Sign Out</span>
        </button>
        <p className="text-xs text-smoke text-center mt-md">
          v1.0 · Dean R&D Office
        </p>
      </div>
    </aside>
  );
}
