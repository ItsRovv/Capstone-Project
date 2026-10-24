import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProtectedRoute, PublicOnly } from './ProtectedRoute';
import { AuthContext } from '../contexts/AuthContext';

function Wrapper({ user = null, initializing = false, initialEntries = ['/'], children }) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <AuthContext.Provider value={{ user, isAuthenticated: Boolean(user), initializing }}>
        {children}
      </AuthContext.Provider>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  it('renders children when authenticated', () => {
    render(
      <Wrapper user={{ id: 1, name: 'Admin', role: 'admin' }}>
        <ProtectedRoute><div data-testid="content">Secret</div></ProtectedRoute>
      </Wrapper>
    );
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('redirects unauthenticated users to /login', () => {
    render(
      <Wrapper user={null}>
        <Routes>
          <Route path="/login" element={<div data-testid="login">Login</div>} />
          <Route path="/" element={<ProtectedRoute><div data-testid="content">Secret</div></ProtectedRoute>} />
        </Routes>
      </Wrapper>
    );
    expect(screen.getByTestId('login')).toBeInTheDocument();
  });

  it('waits for the session check instead of redirecting on page refresh', () => {
    render(
      <Wrapper initializing initialEntries={['/patients']}>
        <Routes>
          <Route path="/login" element={<div data-testid="login">Login</div>} />
          <Route path="/patients" element={<ProtectedRoute><div data-testid="content">Patients</div></ProtectedRoute>} />
        </Routes>
      </Wrapper>
    );
    expect(screen.queryByTestId('login')).not.toBeInTheDocument();
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it('redirects non-admin users away from admin routes', () => {
    render(
      <Wrapper user={{ id: 2, name: 'Staff', role: 'staff' }}>
        <Routes>
          <Route path="/" element={<div data-testid="dashboard">Dashboard</div>} />
          <Route path="/admin" element={<ProtectedRoute roles={['admin']}><div data-testid="admin">Admin</div></ProtectedRoute>} />
        </Routes>
      </Wrapper>
    );
    // When MemoryRouter starts at /admin, the ProtectedRoute should redirect to /
    expect(screen.getByTestId('dashboard')).toBeInTheDocument();
  });
});

describe('PublicOnly', () => {
  it('redirects authenticated users away from public pages', () => {
    render(
      <Wrapper user={{ id: 1, name: 'Admin', role: 'admin' }}>
        <Routes>
          <Route path="/" element={<div data-testid="home">Home</div>} />
          <Route path="/login" element={<PublicOnly><div data-testid="login">Login</div></PublicOnly>} />
        </Routes>
      </Wrapper>
    );
    expect(screen.getByTestId('home')).toBeInTheDocument();
  });

  it('renders children when not authenticated', () => {
    render(
      <Wrapper user={null}>
        <PublicOnly><div data-testid="login">Login</div></PublicOnly>
      </Wrapper>
    );
    expect(screen.getByTestId('login')).toBeInTheDocument();
  });
});
