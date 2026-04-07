import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

/**
 * NestedDonutChart – Avg h-Index (Scopus) by category
 * Shows a nested donut with category breakdowns like in the PPT.
 */

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div className="bg-white border border-mist rounded-md p-md shadow-card">
        <p className="font-heading font-medium text-kle-dark">{d.name}</p>
        <p className="font-mono text-sm text-graphite">{d.value}</p>
      </div>
    );
  }
  return null;
};

export default function NestedDonutChart({ data, title, size = 200 }) {
  return (
    <div className="panel h-full">
      {title && (
        <h3 className="font-heading font-medium text-h2 text-kle-dark mb-md">{title}</h3>
      )}
      <div style={{ height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={size * 0.2}
              outerRadius={size * 0.38}
              paddingAngle={2}
              dataKey="value"
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} stroke="white" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-md mt-sm">
        {data.map((item) => (
          <div key={item.name} className="flex items-center gap-xs">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
            <span className="text-label text-graphite">{item.name}</span>
            <span className="text-label font-mono text-kle-dark">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
