import { useState, useMemo } from 'react';
import { Search, Plus, ArrowUpDown, Edit2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Column<T> {
  key: keyof T | string;
  label: string;
  sortable?: boolean;
  render?: (item: T) => React.ReactNode;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  onEdit: (item: T) => void;
  onDelete: (item: T) => void;
  onAdd: () => void;
  searchFields: (keyof T)[];
  title: string;
  addLabel: string;
}

export function DataTable<T extends { id: string }>(props: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string, asc: boolean } | null>(null);

  const filtered = useMemo(() => {
    return props.data.filter(item => 
      props.searchFields.some(field => 
        String((item as any)[field] || '').toLowerCase().includes(query.toLowerCase())
      )
    );
  }, [props.data, query, props.searchFields]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    return [...filtered].sort((a, b) => {
      const valA = (a as any)[sort.key];
      const valB = (b as any)[sort.key];
      if (valA < valB) return sort.asc ? -1 : 1;
      if (valA > valB) return sort.asc ? 1 : -1;
      return 0;
    });
  }, [filtered, sort]);

  return (
    <div className="flex flex-col h-full bg-card rounded-lg border shadow-sm">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold">{props.title}</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input 
              placeholder="검색..." 
              value={query} 
              onChange={e => setQuery(e.target.value)}
              className="pl-8 h-9 w-64"
            />
          </div>
          <Button onClick={props.onAdd} size="sm" className="h-9 gap-1">
            <Plus className="w-4 h-4" />
            {props.addLabel}
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/50 text-muted-foreground sticky top-0 z-10 shadow-[0_1px_0_0_hsl(var(--border))]">
            <tr>
              {props.columns.map(col => (
                <th 
                  key={col.key as string} 
                  className={`p-3 font-medium ${col.sortable ? 'cursor-pointer hover:bg-muted' : ''}`}
                  onClick={() => {
                    if (!col.sortable) return;
                    setSort(s => s?.key === col.key ? { key: col.key as string, asc: !s.asc } : { key: col.key as string, asc: true });
                  }}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && <ArrowUpDown className="w-3 h-3 opacity-50" />}
                  </div>
                </th>
              ))}
              <th className="p-3 w-24 text-right">관리</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={props.columns.length + 1} className="p-8 text-center text-muted-foreground">
                  데이터가 없습니다.
                </td>
              </tr>
            ) : sorted.map(item => (
              <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                {props.columns.map(col => (
                  <td key={col.key as string} className="p-3">
                    {col.render ? col.render(item) : String((item as any)[col.key] || '')}
                  </td>
                ))}
                <td className="p-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => props.onEdit(item)} className="h-8 w-8 text-muted-foreground hover:text-foreground">
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => props.onDelete(item)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}