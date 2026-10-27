import {
  Radar,
  RadarChart as RechartsRadar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip
} from 'recharts';

const DEPT_COLORS = [
  '#B91C1C', // crimson
  '#0F766E', // teal
  '#B45309', // gold
  '#3730A3', // indigo
  '#44403C', // charcoal
  '#78716C', // smoke
];

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-mist rounded-md p-md shadow-card">
        <p className="font-heading font-medium text-kle-dark mb-sm">{payload[0].payload.axis}</p>
        {payload.map((item, idx) => (
          <div key={idx} className="flex items-center justify-between gap-lg text-label">
            <div className="flex items-center gap-xs">
              <div 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: item.color }}
              />
              <span className="text-graphite">{item.name}</span>
            </div>
            <span className="font-mono text-kle-dark">{item.value?.toFixed(1)}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function RadarChartComponent({
  data,
  departments,
  title,
  axes = ['Publications', 'Impact Factor', 'Citations', 'H-Index', 'Q1+Q2 %'],
  height = 400,
  onPolygonClick
}) {
  // Transform data for Recharts radar format
  const transformedData = axes.map(axis => ({
    axis,
    ...Object.fromEntries(
      departments.map(dept => [
        dept.name,
        data[dept.name]?.[axis] || 0
      ])
    )
  }));

  return (
    <div className="panel h-full">
      {title && (
        <h3 className="font-heading font-medium text-h2 text-kle-dark mb-lg">{title}</h3>
      )}
      
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsRadar 
            data={transformedData}
            onClick={onPolygonClick}
          >
            <PolarGrid 
              stroke="#D6D3D1"
              strokeDasharray="3 3"
            />
            <PolarAngleAxis 
              dataKey="axis"
              tick={{ 
                fontSize: 11, 
                fill: '#44403C',
                fontFamily: 'Inter, system-ui, sans-serif'
              }}
            />
            <PolarRadiusAxis 
              angle={90}
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: '#78716C' }}
              tickCount={5}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              wrapperStyle={{ paddingTop: 16 }}
              iconSize={8}
              iconType="circle"
              formatter={(value) => (
                <span className="text-label text-graphite">{value}</span>
              )}
            />
            
            {departments.map((dept, idx) => (
              <Radar
                key={dept.name}
                name={dept.name}
                dataKey={dept.name}
                stroke={DEPT_COLORS[idx % DEPT_COLORS.length]}
                fill={DEPT_COLORS[idx % DEPT_COLORS.length]}
                fillOpacity={0.15}
                strokeWidth={2}
                dot={{ r: 3, fill: DEPT_COLORS[idx % DEPT_COLORS.length] }}
                activeDot={{ r: 5, stroke: 'white', strokeWidth: 2 }}
              />
            ))}
          </RechartsRadar>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
