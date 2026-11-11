import { Sparkles } from 'lucide-react';

/** Small "Ask AI" button; stops propagation so it works inside clickable cards. */
export default function AskAIChip({ onAsk, label = 'Ask AI', className = '' }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onAsk(); }}
      className={`inline-flex items-center gap-xs px-sm py-xs rounded-full border border-kle-crimson text-kle-crimson text-micro font-semibold hover:bg-kle-crimson hover:text-white transition-colors ${className}`}
      title="Ask the AI about this"
    >
      <Sparkles size={12} />
      {label}
    </button>
  );
}
