import { Navigate } from 'react-router-dom';
import { useAuth, ROLE_ROUTES } from '../auth/AuthContext';

/**
 * ProtectedRoute - wraps route content
 * If not logged in → redirect to /login
 * If logged in but wrong role for this route → redirect to their assigned dashboard
 */
export default function ProtectedRoute({ allowedRoles, children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="login-spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to their own dashboard
    const correctRoute = ROLE_ROUTES[user.role] || '/staff';
    return <Navigate to={correctRoute} replace />;
  }

  return children;
}
