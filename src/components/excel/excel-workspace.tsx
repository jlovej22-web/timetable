import { useState } from 'react';
import { ExcelImportWorkspace } from './excel-import-workspace';
import { ExcelExportWorkspace } from './excel-export-workspace';
import { cn } from '@/lib/utils';

export function ExcelWorkspace({ projectId }: { projectId: string }) {
  const [mode, setMode] = useState<'import' | 'export'>('export');

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6 flex space-x-1 rounded-lg bg-muted/50 p-1 w-fit">
        <button
          onClick={() => setMode('export')}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-md transition-colors",
            mode === 'export' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-background/50"
          )}
        >
          내보내기 (Export)
        </button>
        <button
          onClick={() => setMode('import')}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-md transition-colors",
            mode === 'import' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-background/50"
          )}
        >
          가져오기 (Import)
        </button>
      </div>
      
      <div className="flex-1 overflow-hidden">
        {mode === 'export' ? (
          <ExcelExportWorkspace projectId={projectId} />
        ) : (
          <ExcelImportWorkspace projectId={projectId} />
        )}
      </div>
    </div>
  );
}
