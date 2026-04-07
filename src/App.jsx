import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth, ROLE_ROUTES } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import StaffDashboard from './pages/StaffDashboard';
import FacultyDeanDashboard from './pages/FacultyDeanDashboard';
import ExecutiveDeanDashboard from './pages/ExecutiveDeanDashboard';
import UniversityDeanDashboard from './pages/UniversityDeanDashboard';
import PublicationExplorer from './pages/PublicationExplorer';

// Department sub-pages
import DeptLayout from './pages/department/DeptLayout';
import DeptOverview from './pages/department/DeptOverview';
import DeptResearchOutcomes from './pages/department/DeptResearchOutcomes';
import DeptFacultyData from './pages/department/DeptFacultyData';
import DeptScores from './pages/department/DeptScores';
import DeptFacultyList from './pages/department/DeptFacultyList';

import './App.css';

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  const route = ROLE_ROUTES[user.role] || '/staff';
  return <Navigate to={route} replace />;
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected - Layout wrapper */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<RootRedirect />} />
            <Route
              path="staff"
              element={
                <ProtectedRoute allowedRoles={['staff']}>
                  <StaffDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="department"
              element={
                <ProtectedRoute allowedRoles={['hod']}>
                  <DeptLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DeptOverview />} />
              <Route path="research" element={<DeptResearchOutcomes />} />
              <Route path="faculty" element={<DeptFacultyData />} />
              <Route path="scores" element={<DeptScores />} />
              <Route path="faculty-list" element={<DeptFacultyList />} />
            </Route>
            <Route
              path="faculty-dean"
              element={
                <ProtectedRoute allowedRoles={['faculty-dean']}>
                  <FacultyDeanDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="executive-dean"
              element={
                <ProtectedRoute allowedRoles={['executive-dean']}>
                  <ExecutiveDeanDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="university"
              element={
                <ProtectedRoute allowedRoles={['university-dean']}>
                  <UniversityDeanDashboard />
                </ProtectedRoute>
              }
            />
            {/* Publication Explorer — accessible to all authenticated roles */}
            <Route path="publications" element={<PublicationExplorer />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
