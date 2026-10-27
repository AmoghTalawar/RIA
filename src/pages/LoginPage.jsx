import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, ROLE_ROUTES } from '../auth/AuthContext';
import { Eye, EyeOff, Lock, Mail, AlertCircle } from 'lucide-react';
import kleLogo from '../assets/logo.png';

// Demo accounts for quick-fill (matches Supabase auth users)
const DEMO_ACCOUNTS = [
  { email: 'uday.kulkarni@kletech.ac.in',   password: 'KLE@2026', label: 'Faculty',        name: 'Uday Kulkarni'   },
  { email: 'narayan.dg@kletech.ac.in',       password: 'KLE@2026', label: 'HoD',            name: 'Narayan D G'     },
  { email: 'vijayalaxmi.m@kletech.ac.in',    password: 'KLE@2026', label: 'Faculty Dean',   name: 'Vijayalaxmi M'   },
  { email: 'tewari.pg@kletech.ac.in',        password: 'KLE@2026', label: 'Exec. Dean',     name: 'Tewari P G'      },
  { email: 'uma.mudengudi@kletech.ac.in',    password: 'KLE@2026', label: 'Vice Chancellor',name: 'Uma Mudengudi'   },
];

export default function LoginPage() {
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]           = useState('');
  const [isLoading, setIsLoading]   = useState(false);
  const { login }  = useAuth();
  const navigate   = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password');
      return;
    }

    setIsLoading(true);

    const result = await login(email.trim(), password);
    if (result.success) {
      // Role is resolved inside AuthContext from ria.profiles
      // ROLE_ROUTES is keyed by the mapped frontend role string
      const route = ROLE_ROUTES[result.role] || '/staff';
      navigate(route, { replace: true });
    } else {
      setError(result.message || 'Invalid email or password');
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
                <label htmlFor="email">Email</label>
                <div className="login-input-wrapper">
                  <Mail size={18} className="login-input-icon" />
                  <input
                    id="email"
                    type="email"
                    placeholder="your.name@kletech.ac.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
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
              <p className="login-demo-title">Demo Accounts — password: KLE@2026</p>
              <div className="login-demo-grid">
                {DEMO_ACCOUNTS.map((cred) => (
                  <button
                    key={cred.email}
                    type="button"
                    className="login-demo-btn"
                    onClick={() => {
                      setEmail(cred.email);
                      setPassword(cred.password);
                      setError('');
                    }}
                  >
                    <span className="login-demo-label">{cred.label}</span>
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
