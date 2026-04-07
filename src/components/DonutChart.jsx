import Plot from 'react-plotly.js';

const COLORS = {
  Q1: '#0F766E',    // teal
  Q2: '#3730A3',    // indigo
  Q3: '#B45309',    // gold
  Q4: '#B91C1C',    // crimson
  Unranked: '#78716C', // smoke
};

export default function DonutChart({ 
  data, 
  title,
  centerLabel,
  centerValue,
  size = 'md',
  showLegend = true,
  onSegmentClick
}) {
  const labels = data.map(d => d.name);
  const values = data.map(d => d.value);
  const colors = data.map(d => d.color || COLORS[d.name] || '#78716C');

  // Height based on size
  const heightMap = { sm: 150, md: 240, lg: 300 };
  const height = heightMap[size] || 240;

  return (
    <div className="panel h-full flex flex-col">
      {title && (
        <h3 className="font-heading font-medium text-h2 text-kle-dark mb-lg">{title}</h3>
      )}
      <div className="flex-1 relative" style={{ minHeight: height }}>
        <Plot
          data={[
            {
              type: 'pie',
              hole: 0.6,
              labels: labels,
              values: values,
              marker: {
                colors: colors,
                line: { color: 'white', width: 2 }
              },
              hoverinfo: 'label+value+percent',
              textinfo: 'none',
              showlegend: showLegend
            }
          ]}
          layout={{
            autosize: true,
            margin: { t: 0, b: 0, l: 0, r: 0 },
            showlegend: showLegend,
            legend: {
              orientation: 'h',
              y: -0.1
            },
            annotations: centerValue !== undefined ? [
              {
                text: `<span style="font-size:24px;font-weight:bold;color:#1E293B;font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace">${centerValue}</span><br><span style="font-size:12px;color:#78716C">${centerLabel || ''}</span>`,
                showarrow: false,
                x: 0.5,
                y: 0.5,
                xanchor: 'center',
                yanchor: 'middle'
              }
            ] : []
          }}
          useResizeHandler={true}
          style={{ width: '100%', height: '100%' }}
          onClick={(e) => {
            if (onSegmentClick && e.points && e.points.length > 0) {
              const pt = e.points[0];
              const clickedItem = data.find(d => d.name === pt.label);
              if (clickedItem) onSegmentClick(clickedItem);
            }
          }}
          config={{ displayModeBar: false, responsive: true }}
        />
      </div>
    </div>
  );
}
