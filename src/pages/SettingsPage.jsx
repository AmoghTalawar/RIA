import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Mail, Building2, GraduationCap, Link2, ExternalLink, ArrowRight, ChevronRight,
  Lock, Eye, EyeOff, Check, Circle, AlertCircle, CheckCircle2, LogOut, Monitor, Clock,
} from 'lucide-react';
import { useAuth, ROLE_LABELS, ROLE_ROUTES } from '../auth/AuthContext';
import { supabase } from '../supabaseClient';

const MIN_PASSWORD = 8;

/** "Windows • Chrome" from the browser's user agent. */
function describeDevice() {
  const ua = navigator.userAgent || '';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS'
    : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${os} • ${browser}`;
}

const formatWhen = (iso) => (iso
  ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—');

function IconTile({ icon: Icon, size = 'md' }) {
  return (
    <span className={`flex-shrink-0 rounded-lg bg-kle-crimson/10 text-kle-crimson flex items-center justify-center ${size === 'lg' ? 'w-12 h-12' : 'w-10 h-10'}`}>
      <Icon size={size === 'lg' ? 22 : 18} />
    </span>
  );
}

function InfoRow({ icon, label, children }) {
  return (
    <div className="flex items-center gap-md">
      <IconTile icon={icon} />
      <div className="min-w-0">
        <p className="text-label text-smoke">{label}</p>
        <div className="text-body font-medium text-kle-dark break-words">{children}</div>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, subtitle }) {
  return (
    <div className="flex items-center gap-md mb-lg">
      <IconTile icon={icon} size="lg" />
      <div>
        <h2 className="font-heading font-semibold text-h2 text-kle-dark leading-tight">{title}</h2>
        <p className="text-label text-smoke">{subtitle}</p>
      </div>
    </div>
  );
}

function PasswordField({ id, label, placeholder, value, onChange, show, onToggle }) {
  return (
    <label htmlFor={id} className="block text-label font-medium text-kle-dark">
      {label} <span className="text-kle-crimson">*</span>
      <div className="relative mt-xs">
        <input
          id={id} type={show ? 'text' : 'password'} autoComplete="new-password" placeholder={placeholder} value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full pl-md pr-10 py-sm bg-white border border-mist rounded-md text-body font-normal text-kle-dark placeholder:text-ash focus:outline-none focus:border-kle-crimson focus:ring-2 focus:ring-kle-crimson/15"
        />
        <button
          type="button" onClick={onToggle} tabIndex={-1}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 px-sm text-graphite hover:text-kle-dark"
        >
          {show ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    </label>
  );
}

function Requirement({ ok, children }) {
  return (
    <li className={`flex items-center gap-xs text-label ${ok ? 'text-success' : 'text-smoke'}`}>
      {ok ? <Check size={14} /> : <Circle size={10} className="mx-0.5" />} {children}
    </li>
  );
}

export default function SettingsPage() {
  const { user, logout } = useAuth();

  // ── Password ────────────────────────────────────────────
  const [pw, setPw] = useState({ next: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [pwState, setPwState] = useState({ busy: false, error: null, done: false });
  const longEnough = pw.next.length >= MIN_PASSWORD;
  const matches = pw.next !== '' && pw.next === pw.confirm;

  const changePassword = async (e) => {
    e.preventDefault();
    if (!longEnough) return setPwState({ busy: false, error: `Use at least ${MIN_PASSWORD} characters.`, done: false });
    if (!matches) return setPwState({ busy: false, error: 'The two passwords do not match.', done: false });
    setPwState({ busy: true, error: null, done: false });
    const { error } = await supabase.auth.updateUser({ password: pw.next });
    if (error) return setPwState({ busy: false, error: error.message, done: false });
    setPw({ next: '', confirm: '' });
    setPwState({ busy: false, error: null, done: true });
  };

  // ── Session ─────────────────────────────────────────────
  const [lastLogin, setLastLogin] = useState(null);
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setLastLogin(data?.session?.user?.last_sign_in_at || null);
    });
    return () => { cancelled = true; };
  }, []);

  if (!user) return null;
  const linked = Boolean(user.riaUserId);
  const showRole = user.role !== 'university-dean';
  const homeRoute = ROLE_ROUTES[user.role] || '/';
  const initial = (user.name || '?').replace(/^(Dr|Prof)\.?\s+/i, '').trim().charAt(0).toUpperCase();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-lg">
      <nav aria-label="Breadcrumb" className="flex items-center gap-xs text-label text-smoke">
        <Link to={homeRoute} className="hover:text-kle-crimson">Home</Link>
        <ChevronRight size={14} />
        <span className="text-kle-dark">Settings</span>
      </nav>

      {/* Profile */}
      <section className="panel !p-0 overflow-hidden grid grid-cols-1 md:grid-cols-[42%_1fr]">
        <div
          className="relative flex flex-col items-center justify-center text-center text-white px-lg py-xl md:rounded-r-[48%_100%]"
          style={{ background: 'radial-gradient(circle at 25% 20%, #DC2626 0%, #B91C1C 45%, #7F1D1D 100%)' }}
        >
          <div className="absolute inset-0 opacity-15 md:rounded-r-[48%_100%]"
            style={{ backgroundImage: 'repeating-linear-gradient(135deg, #fff 0, #fff 1px, transparent 1px, transparent 14px)' }} />
          <div className="relative w-28 h-28 rounded-full border-4 border-white bg-kle-crimson flex items-center justify-center font-heading font-semibold text-5xl shadow-lg">
            {initial}
          </div>
          <h2 className="relative mt-md font-heading font-semibold text-h2 text-white">{user.name}</h2>
          {showRole && <p className="relative text-body text-white/85">{ROLE_LABELS[user.role]}</p>}
        </div>

        <div className="p-lg md:p-xl flex flex-col justify-between gap-lg">
          <div className="space-y-md">
            <InfoRow icon={Mail} label="Email">{user.email}</InfoRow>
            <InfoRow icon={Building2} label="Department">{user.department || '—'}</InfoRow>
            <InfoRow icon={GraduationCap} label="School">{user.institute || '—'}</InfoRow>
            <InfoRow icon={Link2} label="Research profile">
              {linked ? (
                <span className="inline-flex items-center gap-xs px-sm py-0.5 rounded-md bg-green-50 text-success text-label font-medium">
                  <CheckCircle2 size={14} /> Linked
                </span>
              ) : (
                <span className="inline-flex items-start gap-xs text-label font-normal text-kle-crimson">
                  <AlertCircle size={14} className="mt-0.5" /> Not linked. "My papers" questions can only be answered for your scope.
                </span>
              )}
            </InfoRow>
          </div>

          <div className="flex items-center justify-between gap-md rounded-lg bg-kle-crimson/5 px-md py-sm">
            <span className="flex items-center gap-sm text-label text-smoke">
              <ExternalLink size={15} /> Managed by the R&amp;D office
            </span>
            {linked && user.role !== 'staff' && (
              <Link to="/profile" className="inline-flex items-center gap-xs text-label font-semibold text-kle-crimson hover:underline whitespace-nowrap">
                View my profile <ArrowRight size={14} />
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Password */}
      <form onSubmit={changePassword} className="panel">
        <SectionHeader icon={Lock} title="Change Password" subtitle="Choose a new password to keep your account secure." />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
          <PasswordField id="pw-new" label="New password" placeholder="Enter new password" value={pw.next} show={show}
            onChange={(v) => setPw({ ...pw, next: v })} onToggle={() => setShow(!show)} />
          <PasswordField id="pw-confirm" label="Confirm new password" placeholder="Re-enter new password" value={pw.confirm} show={show}
            onChange={(v) => setPw({ ...pw, confirm: v })} onToggle={() => setShow(!show)} />
        </div>
        <div className="mt-md flex flex-wrap items-center justify-between gap-md">
          <div className="space-y-xs">
            <ul className="flex flex-wrap gap-x-lg gap-y-xs">
              <Requirement ok={longEnough}>At least {MIN_PASSWORD} characters</Requirement>
              <Requirement ok={matches}>Both entries match</Requirement>
            </ul>
            {pwState.error && <p role="alert" className="text-label text-kle-crimson flex items-center gap-xs"><AlertCircle size={14} />{pwState.error}</p>}
            {pwState.done && <p role="status" className="text-label text-success flex items-center gap-xs"><CheckCircle2 size={14} />Password updated.</p>}
          </div>
          <button type="submit" disabled={pwState.busy || !pw.next || !pw.confirm}
            className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
            {pwState.busy ? 'Updating...' : 'Update password'}
          </button>
        </div>
      </form>

      {/* Session */}
      <section className="panel">
        <SectionHeader icon={LogOut} title="Session Management" subtitle="Manage your active session on this device." />
        <div className="grid grid-cols-1 md:grid-cols-3 rounded-lg border border-mist bg-fog divide-y md:divide-y-0 md:divide-x divide-mist">
          <div className="flex items-center gap-md p-md">
            <span className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <span className="w-3 h-3 rounded-full bg-success" />
            </span>
            <div>
              <p className="text-label text-smoke">Current session</p>
              <span className="inline-block px-sm py-0.5 rounded bg-green-100 text-success text-label font-medium">Active</span>
            </div>
          </div>
          <div className="flex items-center gap-md p-md">
            <Monitor size={22} className="text-graphite" />
            <div>
              <p className="text-label text-smoke">Device</p>
              <p className="text-body font-medium text-kle-dark">{describeDevice()}</p>
            </div>
          </div>
          <div className="flex items-center gap-md p-md">
            <Clock size={22} className="text-graphite" />
            <div>
              <p className="text-label text-smoke">Last login</p>
              <p className="text-body font-medium text-kle-dark">{formatWhen(lastLogin)}</p>
            </div>
          </div>
        </div>
        <div className="mt-md flex flex-wrap items-center gap-md">
          <button type="button" onClick={logout}
            className="inline-flex items-center gap-xs px-lg py-sm rounded-md border border-kle-crimson text-kle-crimson text-body font-medium hover:bg-kle-crimson hover:text-white transition-colors">
            <LogOut size={16} /> Sign out
          </button>
          <span className="text-label text-smoke">This will end your session on this device.</span>
        </div>
      </section>
    </div>
  );
}
