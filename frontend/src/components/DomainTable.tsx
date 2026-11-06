import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { DataGrid } from '@mui/x-data-grid';
import type { GridColDef, GridValidRowModel } from '@mui/x-data-grid';
import { frFR } from '@mui/x-data-grid/locales';

export interface DomainColumn<Row> {
  id: string;
  label: string;
  value: (row: Row) => string | number;
  render?: (row: Row, tabIndex: number) => ReactNode;
  searchValue?: (row: Row) => string;
}

function normalize(value: string | number) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr');
}

const automaticRowHeight = () => 'auto' as const;

export function DomainTable<Row extends GridValidRowModel>({
  label,
  columns,
  rows,
  rowId,
  rowClassName,
  initialSort,
  loading = false,
  error,
  className,
}: {
  label: string;
  columns: DomainColumn<Row>[];
  rows: Row[];
  rowId: (row: Row) => string;
  rowClassName?: (row: Row) => string;
  initialSort?: { id: string; direction: 'asc' | 'desc' };
  loading?: boolean;
  error?: string;
  className?: string;
}) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [pagination, setPagination] = useState({ page: 0, pageSize: 5 });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(query);
      setPagination((current) => ({ ...current, page: 0 }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const filtered = useMemo(() => {
    const text = (column: DomainColumn<Row>, row: Row) =>
      normalize(column.searchValue?.(row) ?? column.value(row));
    return rows.filter(
      (row) =>
        columns.every((column) =>
          text(column, row).includes(normalize(filters[column.id] ?? '')),
        ) && columns.some((column) => text(column, row).includes(normalize(search.trim()))),
    );
  }, [rows, columns, filters, search]);
  const gridColumns = useMemo<GridColDef<Row>[]>(
    () =>
      columns.map((column, index) => ({
        field: column.id,
        headerName: column.label,
        minWidth: index === 0 ? 240 : 110,
        flex: index === 0 ? 2 : 1,
        valueGetter: (_, row) => column.value(row),
        sortComparator: (first: string | number, second: string | number) =>
          typeof first === 'number' && typeof second === 'number'
            ? first - second
            : String(first).localeCompare(String(second), 'fr', {
                numeric: true,
                sensitivity: 'base',
              }),
        renderCell: (params) =>
          column.render?.(params.row, params.tabIndex) ?? column.value(params.row),
      })),
    [columns],
  );
  const currentPage = Math.min(
    pagination.page,
    Math.max(0, Math.ceil(filtered.length / pagination.pageSize) - 1),
  );
  const emptyLabel = error
    ? 'Données indisponibles.'
    : rows.length
      ? 'Aucun résultat pour ces filtres.'
      : 'Aucune donnée disponible.';

  return (
    <div className="domain-table" aria-busy={loading}>
      <div className="domain-table-toolbar">
        <TextField
          label={`Rechercher dans ${label}`}
          value={query}
          type="search"
          onChange={(event) => setQuery(event.target.value)}
          slotProps={{ htmlInput: { maxLength: 200 } }}
        />
        <Button
          disabled={!query && !Object.values(filters).some(Boolean)}
          onClick={() => {
            setQuery('');
            setSearch('');
            setFilters({});
            setPagination((current) => ({ ...current, page: 0 }));
          }}
        >
          Effacer les filtres
        </Button>
      </div>
      <div className="domain-table-filters" role="group" aria-label={`Filtres de ${label}`}>
        {columns.map((column) => (
          <TextField
            key={column.id}
            label={`Filtrer ${column.label}`}
            value={filters[column.id] ?? ''}
            onChange={(event) => {
              setFilters((current) => ({ ...current, [column.id]: event.target.value }));
              setPagination((current) => ({ ...current, page: 0 }));
            }}
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
        ))}
      </div>
      {loading && <p role="status">Actualisation des données…</p>}
      {error && <Alert severity="error">{error}</Alert>}
      <div className="domain-data-grid">
        <DataGrid
          className={className}
          label={label}
          rows={filtered}
          columns={gridColumns}
          getRowId={rowId}
          getRowClassName={(params) => rowClassName?.(params.row) ?? ''}
          getRowHeight={automaticRowHeight}
          disableVirtualization
          disableRowSelectionOnClick
          disableColumnFilter
          disableColumnSelector
          loading={loading}
          sortingOrder={['asc', 'desc']}
          initialState={{
            sorting: {
              sortModel: [
                {
                  field: initialSort?.id ?? columns[0].id,
                  sort: initialSort?.direction ?? 'asc',
                },
              ],
            },
          }}
          onSortModelChange={() => setPagination((current) => ({ ...current, page: 0 }))}
          paginationModel={{ ...pagination, page: currentPage }}
          onPaginationModelChange={setPagination}
          pageSizeOptions={[5, 10, 25]}
          localeText={{
            ...frFR.components.MuiDataGrid.defaultProps.localeText,
            noRowsLabel: emptyLabel,
            noResultsOverlayLabel: emptyLabel,
            paginationRowsPerPage: 'Lignes par page',
            paginationItemAriaLabel: (type) =>
              type === 'next' ? 'Page suivante' : type === 'previous' ? 'Page précédente' : type,
          }}
        />
      </div>
    </div>
  );
}
