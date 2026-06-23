import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { roleHome } from '../lib/roles';

export function ProtectedRoute({ children, roles, redirectUnauth = '/login' }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to={redirectUnauth} state={{ from: location }} replace />;
  }
  // Authenticated but wrong role — send them to their own home instead of looping.
  if (roles && !roles.includes(user?.role)) {
    return <Navigate to={roleHome(user?.role)} replace />;
  }
  return children;
}

export function PublicOnly({ children }) {
  const { isAuthenticated, user } = useAuth();
  if (isAuthenticated) return <Navigate to={roleHome(user?.role)} replace />;
  return children;
}
