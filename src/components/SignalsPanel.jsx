import { AlertTriangle, TrendingDown, Users, Target, Activity } from 'lucide-react';
import AskAIChip from './AskAIChip';

const ICONS = {
  trend_decline: TrendingDown,
  zero_output: Users,
  target_gap: Target,
  outlier: Activity,
};

const SEVERITY_DOT = { 3: 'bg-kle-crimson', 2: 'bg-accent-gold', 1: 'bg-smoke' };

/** "Needs attention" list: each detected signal opens the chatbot with context pre-filled. */
export default function SignalsPanel({ signals, onAsk, max = 5 }) {
  if (!signals?.length) return null;
  return (
    <div className="panel">
      <div className="flex items-center gap-sm mb-md">
        <AlertTriangle size={16} className="text-kle-crimson" />
        <h3 className="font-heading font-medium text-h2 text-kle-dark">Needs Your Attention</h3>
      </div>
      <ul className="divide-y divide-mist">
        {signals.slice(0, max).map((s) => {
          const Icon = ICONS[s.kind] || Activity;
          return (
            <li key={s.id} className="flex items-center justify-between gap-md py-sm">
              <div className="flex items-center gap-sm min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${SEVERITY_DOT[s.severity] || SEVERITY_DOT[1]}`} />
                <Icon size={16} className="text-smoke shrink-0" />
                <span className="text-body text-kle-dark truncate">{s.title}</span>
              </div>
              <AskAIChip onAsk={() => onAsk(s)} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
