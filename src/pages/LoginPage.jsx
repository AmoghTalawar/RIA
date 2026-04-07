import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, ROLE_ROUTES } from '../auth/AuthContext';
import { Eye, EyeOff, Lock, User, AlertCircle } from 'lucide-react';
import kleLogo from '../assets/logo.png';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password');
      return;
    }

    setIsLoading(true);

    // Simulate slight delay for UX
    await new Promise((r) => setTimeout(r, 400));

    const result = login(username.trim(), password);
    if (result.success) {
      // Navigate to role-specific dashboard
      const accounts = JSON.parse(localStorage.getItem('kle_rd_accounts') || '[]');
      const account = accounts.find((a) => a.username === username.trim());
      const route = ROLE_ROUTES[account?.role] || '/staff';
      navigate(route, { replace: true });
    } else {
      setError(result.message);
    }
    setIsLoading(false);
  };

  return (
    <div className="login-page">
      {/* Background Pattern */}
      <div className="login-bg-pattern" />

      <div className="login-container">
        {/* Left Panel - Branding */}
        <div className="login-branding">
          <div className="login-branding-content">
            <div className="login-logo">
              <img src={kleLogo} alt="KLE Tech" className="login-logo-icon" style={{ objectFit: 'contain', background: 'transparent' }} />
              <div>
                {/* <p className="login-brand-subtitle">Research & Development Dashboard</p> */}
              </div>
            </div>

            <div className="login-features">
              <div className="login-feature">
                <div className="login-feature-dot" />
                <p>Track publications, patents & funded projects</p>
              </div>
              <div className="login-feature">
                <div className="login-feature-dot" />
                <p>Role-based analytics from Staff to University level</p>
              </div>
              <div className="login-feature">
                <div className="login-feature-dot" />
                <p>Data-driven decisions for R&D excellence</p>
              </div>
            </div>

            <p className="login-branding-footer">
              Dean R&D Office · v1.0 · March 2026
            </p>
          </div>
        </div>

        {/* Right Panel - Login Form */}
        <div className="login-form-panel">
          <div className="login-form-wrapper">
            <div className="login-form-header">
              <h2>Sign In</h2>
              <p>Access your R&D dashboard</p>
            </div>

            <form onSubmit={handleSubmit} className="login-form">
              {error && (
                <div className="login-error">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <div className="login-field">
                <label htmlFor="username">Username</label>
                <div className="login-input-wrapper">
                  <User size={18} className="login-input-icon" />
                  <input
                    id="username"
                    type="text"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    autoFocus
                  />
                </div>
              </div>

              <div className="login-field">
                <label htmlFor="password">Password</label>
                <div className="login-input-wrapper">
                  <Lock size={18} className="login-input-icon" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="login-toggle-password"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="login-submit"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="login-spinner" />
                ) : (
                  'Sign In'
                )}
              </button>
            </form>

            {/* Demo Credentials */}
            <div className="login-demo">
              <p className="login-demo-title">Demo Accounts</p>
              <div className="login-demo-grid">
                {[
                  { user: 'staff', pass: 'staff123', label: 'Staff' },
                  { user: 'hod', pass: 'hod123', label: 'HoD' },
                  { user: 'facultydean', pass: 'fdean123', label: 'Faculty Dean' },
                  { user: 'executivedean', pass: 'edean123', label: 'Exec. Dean' },
                  { user: 'dean', pass: 'dean123', label: 'University' },
                ].map((cred) => (
                  <button
                    key={cred.user}
                    type="button"
                    className="login-demo-btn"
                    onClick={() => {
                      setUsername(cred.user);
                      setPassword(cred.pass);
                      setError('');
                    }}
                  >
                    <span className="login-demo-label">{cred.label}</span>
                    <span className="login-demo-user">{cred.user}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
