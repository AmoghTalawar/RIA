import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList } from 'recharts';
import { motion } from 'framer-motion';
import { useState } from 'react';

/**
 * CategoryScoreBand – Faculty Category & Score section from PPT.
 * Shows a selector for category, a pie chart of band distribution,
 * and a bar chart of scores within that category.
 */

const BAND_COLORS = {
  R1: '#3B82F6',
  R2: '#3730A3',
  R3: '#D97706',
  R4: '#B91C1C',
};

const PIE_COLORS = ['#3B82F6', '#D97706', '#A8A29E', '#FBBF24'];

const CATEGORY_LABELS = {
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

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div className="bg-white border border-mist rounded-md p-md shadow-card">
        <p className="font-heading font-medium text-kle-dark">{d.band || d.name}</p>
        <p className="font-mono text-sm text-graphite">{d.count || d.value} faculty</p>
      </div>
    );
  }
  return null;
};

export default function CategoryScoreBand({ categories }) {
  const [selected, setSelected] = useState(0);
  const cat = categories[selected];
  const selectedCategoryLabel = CATEGORY_LABELS[cat.category] 
    ? `${CATEGORY_LABELS[cat.category]} (${cat.category})` 
    : cat.category;

  // Build pie data
  const pieData = cat.bands.map((b) => ({
    name: b.band,
    value: b.count,
  }));

  // Build bar data
  const barData = cat.bands.map((b) => ({
    band: b.band,
    count: b.count,
  }));

  const totalBands = cat.bands.reduce((s, b) => s + b.count, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="panel"
    >
      <h3 className="font-heading font-medium text-h2 text-kle-dark mb-xs">Faculty Category & Score</h3>
      <p className="text-label text-smoke mb-lg">Select a category to view score band breakdown</p>

      {/* Category selector pills */}
      <div className="flex flex-wrap gap-sm mb-xl">
        {categories.map((c, i) => {
          const categoryLabel = CATEGORY_LABELS[c.category] 
            ? `${CATEGORY_LABELS[c.category]} (${c.category})` 
            : c.category;
          return (
            <button
              key={c.category}
              onClick={() => setSelected(i)}
              className={`px-md py-xs rounded-md text-sm font-medium transition-all ${
                i === selected
                  ? 'bg-kle-crimson text-white'
                  : 'bg-fog border border-mist text-graphite hover:border-ash'
              }`}
            >
              {categoryLabel} ({c.count})
            </button>
          );
        })}
      </div>

      {/* Content row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-xl">
        {/* Pie chart */}
        <div>
          <p className="font-heading font-medium text-sm text-kle-dark mb-sm">
            {selectedCategoryLabel} – {cat.count} ({cat.percentage}%)
          </p>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={0}
                  outerRadius={80}
                  paddingAngle={1}
                  dataKey="value"
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="white" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Legend */}
          <div className="flex flex-wrap justify-center gap-lg mt-sm">
            {pieData.map((item, i) => (
              <div key={item.name} className="flex items-center gap-xs">
                <div className="w-2.5 h-2.5" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                <span className="text-label text-graphite">{item.name}</span>
                <span className="font-mono text-label text-kle-dark">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bar chart */}
        <div>
          <p className="font-heading font-medium text-sm text-kle-dark mb-sm">
            {selectedCategoryLabel} {totalBands}
          </p>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
                <XAxis dataKey="band" tick={{ fontSize: 12, fill: '#44403C' }} axisLine={{ stroke: '#D6D3D1' }} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#78716C' }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={50}>
                  <LabelList dataKey="count" position="top" fill="#1C1917" fontSize={13} fontWeight={700} />
                  {barData.map((entry) => (
                    <Cell key={entry.band} fill={BAND_COLORS[entry.band] || '#78716C'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-smoke mt-sm text-center">
            Similar can be viewed for each score band by selecting the respective boxes
          </p>
        </div>
      </div>

      {/* Note */}
      <div className="mt-lg p-md bg-fog rounded-md">
        <p className="text-xs text-graphite">
          <strong>Score Bands:</strong> R1 (81–100), R2 (61–80), R3 (41–60), R4 (&lt;40)
        </p>
        <p className="text-xs text-smoke mt-xs">
          Data can be viewed for each category by selecting the respective boxes. List of faculty with category is available on click.
        </p>
      </div>
    </motion.div>
  );
}
