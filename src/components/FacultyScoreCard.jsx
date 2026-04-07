import { motion } from 'framer-motion';
import { Award, Target, Users, TrendingUp, ArrowUp, ArrowDown, Minus } from 'lucide-react';

/**
 * FacultyScoreCard
 * Header card showing the faculty's research category, max score,
 * obtained score, university & department averages, and position in category.
 * Animated with framer-motion for smooth entrance and interaction.
 */
export default function FacultyScoreCard({ profile }) {
  const {
    name,
    school,
    department,
    category,
    maxResearchScore,
    scoreOfFaculty,
    avgScoreUniversity,
    avgScoreDept,
    positionInCategory,
  } = profile;

  const scorePct = maxResearchScore > 0 ? (scoreOfFaculty / maxResearchScore) * 100 : 0;
  const vsDept = scoreOfFaculty - avgScoreDept;
  const vsUniv = scoreOfFaculty - avgScoreUniversity;

  // Category color map
  const catColors = {
    SRG: { bg: 'bg-accent-teal/10', text: 'text-accent-teal', border: 'border-accent-teal' },
    ERG: { bg: 'bg-accent-indigo/10', text: 'text-accent-indigo', border: 'border-accent-indigo' },
    ERGWS: { bg: 'bg-accent-gold/10', text: 'text-accent-gold', border: 'border-accent-gold' },
    ERS: { bg: 'bg-kle-crimson/10', text: 'text-kle-crimson', border: 'border-kle-crimson' },
    'ERS-prep': { bg: 'bg-kle-crimson/10', text: 'text-kle-crimson', border: 'border-kle-crimson' },
    IREF: { bg: 'bg-accent-teal/10', text: 'text-accent-teal', border: 'border-accent-teal' },
    'pre-IREF': { bg: 'bg-smoke/10', text: 'text-smoke', border: 'border-smoke' },
    'Pre IREF': { bg: 'bg-smoke/10', text: 'text-smoke', border: 'border-smoke' },
    'Pre-IREF': { bg: 'bg-smoke/10', text: 'text-smoke', border: 'border-smoke' },
    NA: { bg: 'bg-fog', text: 'text-smoke', border: 'border-fog' },
  };

  const catLabels = {
    SRG: 'Senior Research Guide',
    ERG: 'Emerging Research Guide',
    ERGWS: 'Emerging Research Guide Without Student',
    ERS: 'Evolving Research Scholar',
    'ERS-prep': 'Evolving Research Scholar (Prep)',
    IREF: 'Immersive Research Experience',
    'pre-IREF': 'Pre - Immersive Research Experience',
    'Pre IREF': 'Pre - Immersive Research Experience',
    'Pre-IREF': 'Pre - Immersive Research Experience',
    NA: 'Not Applicable',
  };

  const catStyle = catColors[category] || catColors.ERG;
  const categoryLabel = catLabels[category] ? `${catLabels[category]} (${category})` : category;

  const DeltaIcon = ({ val }) => {
    if (val > 0) return <ArrowUp size={12} className="text-success" />;
    if (val < 0) return <ArrowDown size={12} className="text-kle-crimson" />;
    return <Minus size={12} className="text-smoke" />;
  };

  const statCards = [
    {
      label: 'Position', value: positionInCategory, sub: `in ${categoryLabel}`,
      icon: Target, iconBg: 'bg-kle-crimson/10', iconColor: 'text-kle-crimson',
    },
    {
      label: 'Max Score', value: maxResearchScore, sub: `for ${categoryLabel}`,
      icon: Award, iconBg: 'bg-accent-indigo/10', iconColor: 'text-accent-indigo',
    },
    {
      label: 'Dept Avg', value: avgScoreDept, delta: vsDept,
      icon: Users, iconBg: 'bg-accent-teal/10', iconColor: 'text-accent-teal',
    },
    {
      label: 'Univ Avg', value: avgScoreUniversity, delta: vsUniv,
      icon: TrendingUp, iconBg: 'bg-accent-gold/10', iconColor: 'text-accent-gold',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={`panel border-l-4 ${catStyle.border}`}
    >
      {/* Top row: Name + Category badge */}
      <div className="flex items-start justify-between mb-lg flex-wrap gap-md">
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
        >
          <h2 className="font-display text-3xl font-semibold text-kle-dark tracking-tight">{name}</h2>
          <p className="text-label text-smoke mt-xs font-body">{school} · {department}</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.35 }}
          whileHover={{ scale: 1.04 }}
          className={`flex items-center gap-sm px-lg py-sm rounded-lg ${catStyle.bg} cursor-default`}
        >
          <Award size={16} className={catStyle.text} />
          <span className={`font-heading font-semibold text-body ${catStyle.text}`}>
            Faculty Category: {categoryLabel}
          </span>
        </motion.div>
      </div>

      {/* Score bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25, duration: 0.4 }}
        className="mb-xl"
      >
        <div className="flex items-end justify-between mb-sm">
          <div>
            <p className="text-label text-smoke font-body">Research Module Score</p>
            <p className="font-mono text-display text-kle-dark">
              {scoreOfFaculty}
              <span className="text-h2 text-smoke"> / {maxResearchScore}</span>
            </p>
          </div>
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
            className={`font-mono text-h1 font-bold ${scorePct >= 70 ? 'text-success' : scorePct >= 50 ? 'text-accent-gold' : 'text-kle-crimson'}`}
          >
            {scorePct.toFixed(0)}%
          </motion.span>
        </div>
        <div className="w-full bg-mist rounded-full h-3.5 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${scorePct}%` }}
            transition={{ duration: 1, delay: 0.35, ease: 'easeOut' }}
            className="h-3.5 rounded-full"
            style={{
              backgroundColor:
                scorePct >= 70 ? '#16a34a' : scorePct >= 50 ? '#B45309' : '#B91C1C',
            }}
          />
        </div>
      </motion.div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-lg">
        {statCards.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 + i * 0.08, duration: 0.4 }}
              whileHover={{ y: -2, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
              className="flex items-center gap-md p-md bg-fog rounded-lg transition-all cursor-default"
            >
              <div className={`w-10 h-10 rounded-lg ${stat.iconBg} flex items-center justify-center`}>
                <Icon size={18} className={stat.iconColor} />
              </div>
              <div>
                <p className="text-micro text-smoke uppercase tracking-wider font-medium">{stat.label}</p>
                <p className="font-mono font-bold text-kle-dark text-h2">{stat.value}</p>
                {stat.sub && <p className="text-micro text-smoke">{stat.sub}</p>}
                {stat.delta !== undefined && (
                  <div className="flex items-center gap-xs mt-xs">
                    <DeltaIcon val={stat.delta} />
                    <span className={`text-micro font-mono ${stat.delta >= 0 ? 'text-success' : 'text-kle-crimson'}`}>
                      {stat.delta >= 0 ? '+' : ''}{stat.delta} pts
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
