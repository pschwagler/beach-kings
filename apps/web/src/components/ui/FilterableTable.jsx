import { useState, useRef, useEffect } from 'react';
import { Search, Filter, X, Loader2 } from 'lucide-react';

export default function FilterableTable({
  data,
  columns,
  searchPlaceholder = "Search...",
  filters = {},
  filterOptions = {},
  onFilterChange,
  loading,
  renderRow,
  emptyMessage = "No results found.",
  extraFiltersContent,
  // Optional server-side pagination props
  page,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState(filters);
  const filterPanelRef = useRef(null);

  // Update local filters when props change
  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  // Close filter panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterPanelRef.current && !filterPanelRef.current.contains(event.target)) {
        setIsFilterOpen(false);
      }
    };

    if (isFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isFilterOpen]);

  // Filter data by search term (client-side)
  const sourceData = Array.isArray(data) ? data : [];
  const filteredData = sourceData.filter(item => {
    if (!searchTerm.trim()) return true;
    const searchLower = searchTerm.toLowerCase();
    // Search in all string fields
    return Object.values(item).some(value =>
      value && String(value).toLowerCase().includes(searchLower)
    );
  });

  const handleFilterChange = (filterKey, value) => {
    const newFilters = { ...localFilters };
    if (value === '' || value === null || value === undefined) {
      delete newFilters[filterKey];
    } else {
      newFilters[filterKey] = value;
    }
    setLocalFilters(newFilters);
    if (onFilterChange) {
      onFilterChange(newFilters);
    }
  };

  const removeFilter = (filterKey) => {
    handleFilterChange(filterKey, null);
  };

  const clearAllFilters = () => {
    const newFilters = {};
    setLocalFilters(newFilters);
    if (onFilterChange) {
      onFilterChange(newFilters);
    }
  };

  const activeFilters = Object.keys(localFilters).filter(key => localFilters[key] != null && localFilters[key] !== '');

  const getFilterLabel = (filterKey, value) => {
    const option = filterOptions[filterKey];
    if (option && option.options) {
      const optionItem = option.options.find(opt => opt.value === value);
      return optionItem ? optionItem.label : value;
    }
    return value;
  };

  return (
    <div className="filterable-table-wrapper">
      {/* Search and Filter Bar */}
      <div className="filterable-table-header">
        <div className="filterable-filter-button-wrapper" ref={filterPanelRef}>
          <button
            className={`filterable-filter-button ${isFilterOpen ? 'active' : ''}`}
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            aria-label="Filter"
          >
            <Filter size={16} />
            {activeFilters.length > 0 && (
              <span className="filterable-filter-badge">{activeFilters.length}</span>
            )}
          </button>
          
          {isFilterOpen && (
            <div className="filterable-filter-panel">
              {extraFiltersContent && (
                <div className="filterable-filter-group">
                  {extraFiltersContent}
                </div>
              )}

              {Object.entries(filterOptions).map(([filterKey, filterConfig]) => (
                <div key={filterKey} className="filterable-filter-group">
                  <label className="filterable-filter-label">
                    {filterConfig.label}
                  </label>
                  <select
                    value={localFilters[filterKey] || ''}
                    onChange={(e) => handleFilterChange(filterKey, e.target.value)}
                    className="filterable-filter-select"
                  >
                    <option value="">All</option>
                    {filterConfig.options?.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="filterable-search-wrapper">
          {loading ? (
            <Loader2 size={16} className="filterable-search-spinner" />
          ) : (
            <Search size={16} className="filterable-search-icon" />
          )}
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="filterable-search-input"
            disabled={loading}
          />
        </div>
      </div>

      {/* Filter Pills */}
      {activeFilters.length > 0 && (
        <div className="filterable-filter-pills">
          <button
            className="filterable-filter-clear-all"
            onClick={clearAllFilters}
            aria-label="Clear all filters"
          >
            Clear All
          </button>
          {activeFilters.map(filterKey => (
            <span key={filterKey} className="filterable-filter-pill">
              <span className="filterable-filter-pill-label">
                {filterOptions[filterKey]?.label || filterKey}: {getFilterLabel(filterKey, localFilters[filterKey])}
              </span>
              <button
                className="filterable-filter-pill-remove"
                onClick={() => removeFilter(filterKey)}
                aria-label={`Remove ${filterKey} filter`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="filterable-table-content">
        {!loading && filteredData.length === 0 ? (
          <div className="empty-state">
            <p>{emptyMessage}</p>
          </div>
        ) : (
          <table className="filterable-table-table">
            <thead>
              <tr>
                {columns.map((column, idx) => (
                  <th key={idx} className={column.className || ''}>
                    <span className="th-content">
                      {column.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredData.map((item, idx) => renderRow(item, idx))}
            </tbody>
          </table>
        )}
      </div>

      {/* Optional pagination footer */}
      {typeof page === 'number' && typeof pageSize === 'number' && typeof totalCount === 'number' && onPageChange && (
        <div className="filterable-table-pagination">
          <div className="filterable-pagination-summary">
            {totalCount === 0
              ? 'No results'
              : `Showing ${Math.min((page - 1) * pageSize + 1, totalCount)}–${Math.min(page * pageSize, totalCount)} of ${totalCount}`}
          </div>
          <div className="filterable-pagination-controls">
            <button
              type="button"
              className="filterable-pagination-button"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1 || loading}
            >
              Previous
            </button>
            <span className="filterable-pagination-page">
              Page {page} of {Math.max(1, Math.ceil((totalCount || 0) / (pageSize || 1)))}
            </span>
            <button
              type="button"
              className="filterable-pagination-button"
              onClick={() => {
                const totalPages = Math.max(1, Math.ceil((totalCount || 0) / (pageSize || 1)));
                onPageChange(Math.min(totalPages, page + 1));
              }}
              disabled={page >= Math.max(1, Math.ceil((totalCount || 0) / (pageSize || 1))) || loading}
            >
              Next
            </button>
            {onPageSizeChange && (
              <div className="filterable-pagination-pagesize">
                <span>Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => onPageSizeChange(Number(e.target.value))}
                  disabled={loading}
                >
                  {[25, 50, 100].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


