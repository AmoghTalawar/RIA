import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { motion } from 'framer-motion';

/**
 * SimpleBarChart – Used for "Publications in last quarters",
 * "Publications in last 3 years", and "R-Score Band Distribution" bar charts.
 */

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-mist rounded-md p-md shadow-card">
        <p className="font-heading font-medium text-kle-dark">{label}</p>
        <p className="font-mono text-sm text-graphite">{payload[0].value}</p>
      </div>
    );
  }
  return null;
};

export default function SimpleBarChart({
  data,
  xKey,
  yKey,
  title,
  subtitle,
  height = 220,
  barColor = '#3B82F6',
  colors, // array of colors per bar
  showLabels = true,
  layout = 'vertical', // vertical bars (default)
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="panel h-full"
    >
      {title && (
        <h3 className="font-heading font-medium text-h2 text-kle-dark mb-xs">{title}</h3>
      )}
      {subtitle && (
        <p className="text-label text-smoke mb-md">{subtitle}</p>
      )}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
            <XAxis
              dataKey={xKey}
              axisLine={{ stroke: '#D6D3D1' }}
              tickLine={false}
              tick={{ fontSize: 12, fill: '#44403C' }}
              dy={6}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: '#78716C' }}
              dx={-4}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey={yKey} radius={[4, 4, 0, 0]} maxBarSize={48}>
              {showLabels && (
                <LabelList dataKey={yKey} position="top" fill="#1C1917" fontSize={12} fontWeight={700} fontFamily="'JetBrains Mono', monospace" />
              )}
              {data.map((entry, i) => (
                <Cell key={i} fill={colors ? colors[i % colors.length] : entry.color || barColor} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
