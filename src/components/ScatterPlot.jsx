import {
  ScatterChart as RechartsScatter,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
  Legend
} from 'recharts';

const QRANK_COLORS = {
  Q1: '#0F766E',
  Q2: '#3730A3',
  Q3: '#B45309',
  Q4: '#B91C1C',
  Unranked: '#78716C',
};

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white border border-mist rounded-md p-md shadow-card max-w-xs">
        <p className="font-heading font-medium text-kle-dark mb-sm line-clamp-2">
          {data.title || data.name}
        </p>
        {data.journal && (
          <p className="text-label text-smoke mb-sm">{data.journal}</p>
        )}
        <div className="grid grid-cols-2 gap-sm text-label">
          <div>
            <span className="text-smoke">Impact Factor: </span>
            <span className="font-mono text-kle-dark">{data.x?.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-smoke">Citations: </span>
            <span className="font-mono text-kle-dark">{data.y?.toLocaleString('en-IN')}</span>
          </div>
        </div>
        {data.qRank && (
          <div className="mt-sm">
            <span className={`chip chip-${data.qRank.toLowerCase()}`}>{data.qRank}</span>
          </div>
        )}
      </div>
    );
  }
  return null;
};

export default function ScatterPlot({
  data,
  title,
  xLabel = 'Impact Factor',
  yLabel = 'Citations',
  colorKey = 'qRank',
  sizeKey,
  height = 350,
  onPointClick
}) {
  // Group data by color key for multi-series scatter
  const groupedData = {};
  data.forEach(item => {
    const group = item[colorKey] || 'Other';
    if (!groupedData[group]) {
      groupedData[group] = [];
    }
    groupedData[group].push({
      ...item,
      x: item.impactFactor || item.x,
      y: item.citations || item.y,
      z: sizeKey ? item[sizeKey] : 100,
    });
  });

  return (
    <div className="panel h-full">
      {title && (
        <h3 className="font-heading font-medium text-h2 text-kle-dark mb-lg">{title}</h3>
      )}
      
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsScatter
            margin={{ top: 10, right: 20, left: 0, bottom: 20 }}
            onClick={onPointClick}
          >
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="#D6D3D1"
            />
            <XAxis 
              type="number"
              dataKey="x"
              name={xLabel}
              axisLine={{ stroke: '#D6D3D1' }}
              tickLine={false}
              tick={{ fontSize: 12, fill: '#44403C' }}
              label={{ 
                value: xLabel, 
                position: 'bottom', 
                offset: 0,
                style: { fontSize: 12, fill: '#44403C' }
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={yLabel}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: '#44403C' }}
              tickFormatter={(value) => value.toLocaleString('en-IN')}
              label={{ 
                value: yLabel, 
                angle: -90, 
                position: 'insideLeft',
                style: { fontSize: 12, fill: '#44403C' }
              }}
            />
            <ZAxis 
              type="number" 
              dataKey="z" 
              range={[40, 200]} 
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              wrapperStyle={{ paddingTop: 8 }}
              iconSize={8}
              iconType="circle"
              formatter={(value) => (
                <span className="text-label text-graphite">{value}</span>
              )}
            />
            
            {Object.entries(groupedData).map(([group, items]) => (
              <Scatter
                key={group}
                name={group}
                data={items}
                fill={QRANK_COLORS[group] || '#78716C'}
                cursor={onPointClick ? 'pointer' : 'default'}
                shape="circle"
              />
            ))}
          </RechartsScatter>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
