import Plot from 'react-plotly.js';

const DEFAULT_COLORS = {
  Scopus: '#B91C1C',
  WoS: '#3730A3',
  'Google Scholar': '#0F766E',
  BVB: '#B91C1C',
  Belagavi: '#3730A3',
  Bengaluru: '#0F766E',
};

export default function MultiLineChart({
  data,
  title,
  xKey = 'year',
  series = [{ key: 'value', name: 'Value' }],
  colors = DEFAULT_COLORS,
  targetLines = [],
  showCAGR = false,
  height = 300,
  onPointClick
}) {
  const calculateCAGR = (seriesKey) => {
    if (data.length < 2) return null;
    const startValue = data[0][seriesKey];
    const endValue = data[data.length - 1][seriesKey];
    const years = data.length - 1;
    if (startValue <= 0 || endValue <= 0) return null;
    const cagr = (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
    return cagr.toFixed(1);
  };

  const plotData = series.map(s => {
    const color = colors[s.name] || colors[s.key] || '#B91C1C';
    return {
      type: 'scatter',
      mode: 'lines+markers',
      name: s.name || s.key,
      x: data.map(d => d[xKey]),
      y: data.map(d => d[s.key]),
      line: { color, width: 2.5 },
      marker: { color, size: 8 },
      hoverinfo: 'name+y'
    };
  });
  
  const shapes = targetLines.map(t => ({
    type: 'line',
    xref: 'paper',
    x0: 0,
    x1: 1,
    yref: 'y',
    y0: t.value,
    y1: t.value,
    line: {
      color: t.color || '#78716C',
      width: 1.5,
      dash: 'dashdot'
    }
  }));
  
  const annotations = targetLines.map(t => ({
    x: 1,
    xref: 'paper',
    y: t.value,
    yref: 'y',
    text: t.label || `Target: ${t.value}`,
    showarrow: false,
    xanchor: 'right',
    yanchor: 'bottom',
    font: { size: 11, color: '#44403C' }
  }));

  return (
    <div className="panel h-full">
      {title && (
        <div className="flex items-center justify-between mb-lg">
          <h3 className="font-heading font-medium text-h2 text-kle-dark">{title}</h3>
          
          {showCAGR && (
            <div className="flex items-center gap-md">
              {series.map((s) => {
                const cagr = calculateCAGR(s.key);
                if (cagr === null) return null;
                const isPositive = parseFloat(cagr) >= 0;
                return (
                  <div 
                    key={s.key}
                    className={`px-sm py-xs rounded-sm border text-micro font-mono ${
                      isPositive 
                        ? 'bg-accent-teal-light border-accent-teal text-accent-teal' 
                        : 'bg-red-50 border-kle-crimson text-kle-crimson'
                    }`}
                  >
                    {isPositive ? '+' : ''}{cagr}% CAGR
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      
      <div style={{ height }}>
        <Plot
          data={plotData}
          layout={{
            autosize: true,
            margin: { t: 10, b: 30, l: 40, r: 10 },
            xaxis: {
              tickfont: { size: 12, color: '#44403C' },
              gridcolor: 'transparent',
              zeroline: false
            },
            yaxis: {
              tickfont: { size: 12, color: '#44403C' },
              gridcolor: '#D6D3D1',
              gridwidth: 1,
              zeroline: false
            },
            showlegend: true,
            legend: {
              orientation: 'h',
              y: -0.2,
              x: 0.5,
              xanchor: 'center'
            },
            shapes: shapes,
            annotations: annotations,
            hovermode: 'x unified'
          }}
          useResizeHandler={true}
          style={{ width: '100%', height: '100%' }}
          onClick={(e) => {
            if (onPointClick && e.points) onPointClick(e.points[0]);
          }}
          config={{ displayModeBar: false, responsive: true }}
        />
      </div>
    </div>
  );
}
