import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';

const COLORS = {
  Q1: '#0F766E',
  Q2: '#3730A3',
  Q3: '#B45309',
  Q4: '#B91C1C',
  Journal: '#B91C1C',
  Conference: '#0F766E',
  Book: '#B45309',
  Other: '#78716C',
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const total = payload.reduce((sum, item) => sum + (item.value || 0), 0);
    return (
      <div className="bg-white border border-mist rounded-md p-md shadow-card">
        <p className="font-heading font-medium text-kle-dark mb-sm">{label}</p>
        {payload.map((item, idx) => (
          <div key={idx} className="flex items-center justify-between gap-lg text-label">
            <div className="flex items-center gap-xs">
              <div 
                className="w-2 h-2" 
                style={{ backgroundColor: item.fill }}
              />
              <span className="text-graphite">{item.name}</span>
            </div>
            <span className="font-mono text-kle-dark">{item.value}</span>
          </div>
        ))}
        <div className="border-t border-mist mt-sm pt-sm flex justify-between">
          <span className="text-label text-graphite">Total</span>
          <span className="font-mono font-medium text-kle-dark">{total}</span>
        </div>
      </div>
    );
  }
  return null;
};

export default function StackedBarChart({
  data,
  title,
  xKey = 'year',
  stackKeys = ['Q1', 'Q2', 'Q3', 'Q4'],
  colors = COLORS,
  targetLine,
  height = 300,
  onBarClick
}) {
  return (
    <div className="panel h-full">
      {title && (
        <h3 className="font-heading font-medium text-h2 text-kle-dark mb-lg">{title}</h3>
      )}
      
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            onClick={onBarClick}
          >
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="#D6D3D1" 
              vertical={false}
            />
            <XAxis 
              dataKey={xKey}
              axisLine={{ stroke: '#D6D3D1' }}
              tickLine={false}
              tick={{ fontSize: 12, fill: '#44403C' }}
              dy={8}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: '#44403C' }}
              dx={-8}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              wrapperStyle={{ paddingTop: 16 }}
              iconSize={8}
              iconType="square"
              formatter={(value) => (
                <span className="text-label text-graphite">{value}</span>
              )}
            />
            
            {stackKeys.map((key) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="stack"
                fill={colors[key] || '#78716C'}
                radius={[0, 0, 0, 0]}
                cursor={onBarClick ? 'pointer' : 'default'}
              />
            ))}

            {targetLine && (
              <ReferenceLine
                y={targetLine}
                stroke="#1C1917"
                strokeDasharray="5 5"
                strokeWidth={2}
                label={{
                  value: `Target: ${targetLine}`,
                  position: 'right',
                  fill: '#44403C',
                  fontSize: 11,
                }}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
