import Plot from 'react-plotly.js';

export default function HorizontalBarChart({
  data,
  title,
  subtitle,
  valueKey = 'value',
  labelKey = 'name',
  colorKey,
  height = 400,
  showBadge = false,
  badgeKey = 'hIndex',
  onBarClick,
  maxItems = 10
}) {
  const displayData = data.slice(0, maxItems).reverse(); // reverse for plotly top-down display

  const getBarColor = (item) => {
    if (colorKey && item[colorKey]) {
      const colorMap = {
        Q1: '#0F766E',
        Q2: '#3730A3',
        Q3: '#B45309',
        Q4: '#B91C1C',
        SRG: '#0F766E',
        ERG: '#3730A3',
        ERGWS: '#B45309',
        ERS: '#B91C1C',
      };
      return colorMap[item[colorKey]] || '#B91C1C';
    }
    return '#B91C1C';
  };

  const yLabels = displayData.map(d => {
    let raw = d[labelKey] || '';
    if (raw.length > 32) raw = raw.substring(0, 32) + '...';
    return raw;
  });

  const maxLabelLength = yLabels.reduce((max, label) => Math.max(max, label.length), 0);
  const leftMargin = Math.min(320, Math.max(180, maxLabelLength * 7));
  const chartHeight = Math.max(height, displayData.length * 44);
  
  const xValues = displayData.map(d => d[valueKey]);
  const colors = displayData.map(d => getBarColor(d));
  
  const hoverTexts = displayData.map(d => {
    let ht = `<b>${d.name}</b><br>Citations: ${d.value?.toLocaleString()}`;
    if (d.hIndex) ht += `<br>H-Index: ${d.hIndex}`;
    if (d.qRank) ht += `<br>Rank: ${d.qRank}`;
    return ht;
  });

  return (
    <div className="panel h-full flex flex-col">
      {title && (
        <div className="mb-lg">
          <h3 className="font-heading font-medium text-h2 text-kle-dark">{title}</h3>
          {subtitle && <p className="text-label text-smoke mt-xs">{subtitle}</p>}
        </div>
      )}
      
      <div className="flex-1" style={{ minHeight: chartHeight }}>
        <Plot
          data={[
            {
              type: 'bar',
              x: xValues,
              y: yLabels,
              orientation: 'h',
              marker: {
                color: colors,
                line: { width: 0 }
              },
              hoverinfo: 'text',
              hovertext: hoverTexts,
            }
          ]}
          layout={{
            autosize: true,
            margin: { t: 0, b: 30, l: leftMargin, r: 10 },
            xaxis: {
              tickfont: { size: 12, color: '#44403C' },
              gridcolor: '#D6D3D1',
              gridwidth: 1,
              zeroline: false,
              gridshape: 'linear'
            },
            yaxis: {
              tickfont: { size: 12, color: '#44403C' },
              tickangle: 0,
              automargin: true
            },
            annotations: showBadge ? displayData.map((d, i) => ({
              x: d[valueKey],
              y: i,
              text: `H: ${d[badgeKey] || 0}`,
              xanchor: 'left',
              yanchor: 'middle',
              showarrow: false,
              font: { family: 'monospace', size: 11, color: '#44403C' },
              xshift: 5
            })) : []
          }}
          useResizeHandler={true}
          style={{ width: '100%', height: '100%' }}
          onClick={(e) => {
            if (onBarClick && e.points && e.points.length > 0) {
              const pt = e.points[0];
              const clickedItem = displayData[pt.pointIndex];
              if (clickedItem) onBarClick(clickedItem);
            }
          }}
          config={{ displayModeBar: false, responsive: true }}
        />
      </div>

      {data.length > maxItems && (
        <div className="mt-lg pt-lg border-t border-mist">
          <button className="text-label text-kle-crimson hover:underline">
            View all {data.length} items →
          </button>
        </div>
      )}
    </div>
  );
}
