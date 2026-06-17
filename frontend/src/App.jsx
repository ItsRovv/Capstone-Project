import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute, PublicOnly } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { Patients } from './pages/Patients';
import { PatientDetail } from './pages/PatientDetail';
import { Consultations } from './pages/Consultations';
import { Appointments } from './pages/Appointments';
import { Reports } from './pages/Reports';
import { ManageUsers } from './pages/ManageUsers';
import { NotFound } from './pages/NotFound';

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <Login />
          </PublicOnly>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnly>
            <Register />
          </PublicOnly>
        }
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="patients" element={<Patients />} />
        <Route path="patients/:id" element={<PatientDetail />} />
        <Route path="consultations" element={<Consultations />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="reports" element={<Reports />} />
        <Route
          path="admin/users"
          element={
            <ProtectedRoute roles={['admin']}>
              <ManageUsers />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="/404" element={<NotFound />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
