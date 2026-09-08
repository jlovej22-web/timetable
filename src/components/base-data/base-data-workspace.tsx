import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SettingsTab } from './settings-tab';
import { TeachersTab } from './teachers-tab';
import { ClassesTab } from './classes-tab';
import { SubjectsTab } from './subjects-tab';
import { RoomsTab } from './rooms-tab';

export function BaseDataWorkspace({ projectId }: { projectId: string }) {
  return (
    <div className="h-full flex flex-col bg-background rounded-xl border shadow-sm overflow-hidden">
      <Tabs defaultValue="settings" className="flex-1 flex flex-col h-full">
        <div className="px-6 pt-4 border-b bg-card shrink-0">
          <TabsList className="bg-transparent space-x-2 h-auto p-0">
            <TabsTrigger value="settings" className="data-[state=active]:bg-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-4 pb-3 pt-3 text-sm">학교 기본설정</TabsTrigger>
            <TabsTrigger value="teachers" className="data-[state=active]:bg-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-4 pb-3 pt-3 text-sm">교사</TabsTrigger>
            <TabsTrigger value="classes" className="data-[state=active]:bg-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-4 pb-3 pt-3 text-sm">학급</TabsTrigger>
            <TabsTrigger value="subjects" className="data-[state=active]:bg-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-4 pb-3 pt-3 text-sm">과목</TabsTrigger>
            <TabsTrigger value="rooms" className="data-[state=active]:bg-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-4 pb-3 pt-3 text-sm">특별실</TabsTrigger>
          </TabsList>
        </div>
        <div className="flex-1 min-h-0 bg-muted/20">
          <TabsContent value="settings" className="h-full m-0 p-6 overflow-y-auto outline-none"><SettingsTab projectId={projectId} /></TabsContent>
          <TabsContent value="teachers" className="h-full m-0 p-6 overflow-hidden outline-none flex flex-col"><TeachersTab projectId={projectId} /></TabsContent>
          <TabsContent value="classes" className="h-full m-0 p-6 overflow-hidden outline-none flex flex-col"><ClassesTab projectId={projectId} /></TabsContent>
          <TabsContent value="subjects" className="h-full m-0 p-6 overflow-hidden outline-none flex flex-col"><SubjectsTab projectId={projectId} /></TabsContent>
          <TabsContent value="rooms" className="h-full m-0 p-6 overflow-hidden outline-none flex flex-col"><RoomsTab projectId={projectId} /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}