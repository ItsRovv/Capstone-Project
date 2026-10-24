import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { roleHome } from '../lib/roles';
import { PageLoader } from './UI/Spinner';

export function ProtectedRoute({ children, roles, redirectUnauth = '/login' }) {
  const { isAuthenticated, user, initializing } = useAuth();
  const location = useLocation();

  // Wait for the session check on refresh / direct links instead of bouncing to /login.
  if (initializing) return <PageLoader />;
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
  const { isAuthenticated, user, initializing } = useAuth();
  if (initializing) return <PageLoader />;
  if (isAuthenticated) return <Navigate to={roleHome(user?.role)} replace />;
  return children;
}
