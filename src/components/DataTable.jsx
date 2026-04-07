import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, Download, ExternalLink, Table } from 'lucide-react';

export default function DataTable({
  data,
  columns,
  title,
  sortable = true,
  filterable = true,
  exportable = true,
  pageSize = 10,
  onRowClick
}) {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('table');

  // Filter data
  const filteredData = useMemo(() => {
    if (!searchTerm) return data;
    return data.filter(row => 
      columns.some(col => {
        const value = row[col.key];
        return value?.toString().toLowerCase().includes(searchTerm.toLowerCase());
      })
    );
  }, [data, columns, searchTerm]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return filteredData;
    
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      
      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      
      const comparison = aVal < bVal ? -1 : 1;
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [filteredData, sortConfig]);

  // Paginate
  const totalPages = Math.ceil(sortedData.length / pageSize);
  const paginatedData = sortedData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleSort = (key) => {
    if (!sortable) return;
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleExport = () => {
    const headers = columns.map(col => col.label).join(',');
    const rows = sortedData.map(row => 
      columns.map(col => {
        const val = row[col.key];
        return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
      }).join(',')
    );
    
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'data'}_export.csv`;
    a.click();
  };

  const renderCell = (row, col) => {
    const value = row[col.key];
    
    // Q-Rank chip
    if (col.type === 'qrank' && value) {
      return <span className={`chip chip-${value.toLowerCase()}`}>{value}</span>;
    }
    
    // Number formatting
    if (col.type === 'number' && typeof value === 'number') {
      return <span className="font-mono">{value.toLocaleString('en-IN')}</span>;
    }
    
    // DOI link
    if (col.type === 'doi' && value) {
      return (
        <a 
          href={`https://doi.org/${value}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-kle-crimson hover:underline inline-flex items-center gap-xs"
          onClick={(e) => e.stopPropagation()}
        >
          {value.substring(0, 20)}...
          <ExternalLink size={12} />
        </a>
      );
    }
    
    // Truncate long text
    if (typeof value === 'string' && value.length > 50) {
      return <span title={value}>{value.substring(0, 50)}...</span>;
    }
    
    return value || '—';
  };

  return (
    <div className="panel">
      {/* Header */}
      <div className="flex items-center justify-between mb-lg">
        <div>
          {title && <h3 className="font-heading font-medium text-h2 text-kle-dark">{title}</h3>}
          <p className="text-label text-smoke">
            {sortedData.length} records
            {searchTerm && ` (filtered from ${data.length})`}
          </p>
        </div>
        
        <div className="flex items-center gap-md">
          {/* Search */}
          {filterable && (
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="px-md py-sm bg-fog border border-mist rounded-md text-body text-kle-dark placeholder:text-smoke focus:outline-none focus:border-kle-crimson w-48"
            />
          )}
          
          {/* View Mode Toggle */}
          <button
            onClick={() => setViewMode(v => v === 'table' ? 'compact' : 'table')}
            className="p-sm hover:bg-fog rounded-md transition-colors"
            title="Toggle view"
          >
            <Table size={16} className="text-graphite" />
          </button>
          
          {/* Export */}
          {exportable && (
            <button
              onClick={handleExport}
              className="flex items-center gap-xs px-md py-sm bg-fog border border-mist rounded-md text-body text-graphite hover:border-ash transition-colors"
            >
              <Download size={14} />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th 
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={sortable ? 'cursor-pointer hover:bg-mist select-none' : ''}
                  style={{ width: col.width }}
                >
                  <div className="flex items-center gap-xs">
                    {col.label}
                    {sortable && sortConfig.key === col.key && (
                      sortConfig.direction === 'asc' 
                        ? <ChevronUp size={12} /> 
                        : <ChevronDown size={12} />
                    )}
                    {sortable && sortConfig.key !== col.key && (
                      <span className="text-ash">↕</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((row, idx) => (
              <tr 
                key={row.id || idx}
                onClick={() => onRowClick?.(row)}
                className={onRowClick ? 'cursor-pointer' : ''}
              >
                {columns.map((col) => (
                  <td key={col.key}>
                    {renderCell(row, col)}
                  </td>
                ))}
              </tr>
            ))}
            
            {paginatedData.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="text-center py-xl text-smoke">
                  No data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-lg pt-lg border-t border-mist">
          <p className="text-label text-smoke">
            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, sortedData.length)} of {sortedData.length}
          </p>
          
          <div className="flex items-center gap-xs">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-md py-xs border border-mist rounded-md text-label disabled:opacity-50 disabled:cursor-not-allowed hover:bg-fog"
            >
              Previous
            </button>
            
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-md py-xs border rounded-md text-label ${
                    currentPage === pageNum 
                      ? 'bg-kle-crimson text-white border-kle-crimson' 
                      : 'border-mist hover:bg-fog'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-md py-xs border border-mist rounded-md text-label disabled:opacity-50 disabled:cursor-not-allowed hover:bg-fog"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
