import { useEffect, useMemo, useState } from "react";
import { runAgentTurn } from "./agent/conversationOrchestrator";
import { ApiSettingsModal } from "./components/ApiSettingsModal";
import { ChatView } from "./components/ChatView";
import { ProjectMemoryPanel } from "./components/ProjectMemoryPanel";
import { Sidebar } from "./components/Sidebar";
import {
  createInitialProject,
  createMessage,
  loadActiveProjectId,
  loadApiSettings,
  loadProjects,
  nowIso,
  saveActiveProjectId,
  saveProjects
} from "./services/storage";
import type { MemoryCategory, PromptSegment, ReferenceAsset } from "./types/chat";
import type { Project } from "./types/project";

export default function App() {
  const [projects, setProjects] = useState<Project[]>(() => loadProjects());
  const [activeProjectId, setActiveProjectId] = useState<string>(() => loadActiveProjectId() || "");
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);

  const activeProject = useMemo(() => {
    return projects.find((project) => project.id === activeProjectId) || projects[0];
  }, [activeProjectId, projects]);

  useEffect(() => {
    if (projects[0] && !projects.some((project) => project.id === activeProjectId)) {
      setActiveProjectId(projects[0].id);
    }
  }, [activeProjectId, projects]);

  useEffect(() => {
    saveProjects(projects);
  }, [projects]);

  useEffect(() => {
    if (activeProjectId) saveActiveProjectId(activeProjectId);
  }, [activeProjectId]);

  function updateProject(projectId: string, updater: (project: Project) => Project) {
    setProjects((current) => current.map((project) => (project.id === projectId ? updater(project) : project)));
  }

  function handleNewProject() {
    const project = createInitialProject();
    setProjects((current) => [project, ...current]);
    setActiveProjectId(project.id);
    setInput("");
  }

  function handleRenameProject(projectId: string, title: string) {
    updateProject(projectId, (project) => ({
      ...project,
      title,
      updatedAt: nowIso()
    }));
  }

  function handleDeleteProject(projectId: string) {
    setProjects((current) => {
      if (current.length <= 1) return current;
      const next = current.filter((project) => project.id !== projectId);
      if (activeProjectId === projectId && next[0]) {
        setActiveProjectId(next[0].id);
      }
      return next;
    });
  }

  async function handleSend(value: string) {
    const text = value.trim();
    if (!text || !activeProject || isThinking) return;

    const projectSnapshot = activeProject;
    const userMessage = createMessage({
      role: "user",
      kind: "text",
      content: text
    });
    const optimisticTitle =
      projectSnapshot.messages.length === 0 ? buildProjectTitle(text) : projectSnapshot.title;

    setInput("");
    updateProject(projectSnapshot.id, (project) => ({
      ...project,
      title: optimisticTitle,
      tag: "刚刚",
      updatedAt: nowIso(),
      messages: [...project.messages, userMessage]
    }));

    setIsThinking(true);
    const result = await runAgentTurn({
      input: text,
      messages: projectSnapshot.messages,
      references: projectSnapshot.references,
      memory: projectSnapshot.memory
    });

    updateProject(projectSnapshot.id, (project) => ({
      ...project,
      memory: result.memory,
      updatedAt: nowIso(),
      messages: [...project.messages, ...result.messages]
    }));
    setIsThinking(false);
  }

  function handleReferencesChange(references: ReferenceAsset[]) {
    if (!activeProject) return;
    updateProject(activeProject.id, (project) => ({
      ...project,
      references,
      updatedAt: nowIso()
    }));
  }

  function handleOptimizePrompt(prompt: PromptSegment) {
    handleSend(`请继续优化这条提示词，让镜头动作更具体，画面更稳定：\n${prompt.prompt}`);
  }

  function handleSavePromptMemory(prompt: PromptSegment) {
    if (!activeProject) return;
    const note = `偏好：${prompt.videoType}，${prompt.shotMode === "multi" ? "多镜头剪辑" : "单镜头一镜到底"}，${prompt.model}`;
    const notice = createMessage({
      role: "assistant",
      kind: "notice",
      content: `已保存到项目记忆：${note}`
    });
    updateProject(activeProject.id, (project) => ({
      ...project,
      memory: {
        ...project.memory,
        notes: Array.from(new Set([note, ...project.memory.notes])).slice(0, 16)
      },
      messages: [...project.messages, notice],
      updatedAt: nowIso()
    }));
  }

  function handleGenerateVideo() {
    if (!activeProject) return;
    const settings = loadApiSettings();
    const content = settings.videoApiKey
      ? "视频模型设置已保存。第一版暂未启用真实视频生成接口，当前先复制提示词到视频模型中使用。"
      : "当前未配置视频模型 API。你可以先复制提示词到视频模型中使用，或在设置中接入视频模型 API。";
    const notice = createMessage({
      role: "assistant",
      kind: "notice",
      content
    });
    updateProject(activeProject.id, (project) => ({
      ...project,
      messages: [...project.messages, notice],
      updatedAt: nowIso()
    }));
  }

  function handleAddMemoryNote(note: string) {
    if (!activeProject) return;
    updateProject(activeProject.id, (project) => ({
      ...project,
      memory: {
        ...project.memory,
        notes: Array.from(new Set([note, ...project.memory.notes])).slice(0, 16)
      },
      updatedAt: nowIso()
    }));
  }

  function handleEditMemoryItem(category: MemoryCategory, index: number, value: string) {
    if (!activeProject) return;
    updateProject(activeProject.id, (project) => {
      const items = [...project.memory[category]];
      items[index] = value;
      return {
        ...project,
        memory: {
          ...project.memory,
          [category]: items
        },
        updatedAt: nowIso()
      };
    });
  }

  function handleDeleteMemoryItem(category: MemoryCategory, index: number) {
    if (!activeProject) return;
    updateProject(activeProject.id, (project) => ({
      ...project,
      memory: {
        ...project.memory,
        [category]: project.memory[category].filter((_, itemIndex) => itemIndex !== index)
      },
      updatedAt: nowIso()
    }));
  }

  if (!activeProject) return null;

  return (
    <div className="app-shell">
      <Sidebar
        projects={projects}
        activeProjectId={activeProject.id}
        onNewProject={handleNewProject}
        onSelectProject={setActiveProjectId}
        onRenameProject={handleRenameProject}
        onDeleteProject={handleDeleteProject}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenMemory={() => setMemoryOpen(true)}
      />

      <ChatView
        project={activeProject}
        input={input}
        disabled={isThinking}
        onInputChange={setInput}
        onReferencesChange={handleReferencesChange}
        onSend={handleSend}
        onOpenSettings={() => setSettingsOpen(true)}
        onQuestionSubmit={handleSend}
        onOptimizePrompt={handleOptimizePrompt}
        onSavePromptMemory={handleSavePromptMemory}
        onGenerateVideo={handleGenerateVideo}
      />

      {settingsOpen && <ApiSettingsModal onClose={() => setSettingsOpen(false)} />}
      {memoryOpen && (
        <ProjectMemoryPanel
          memory={activeProject.memory}
          onAddNote={handleAddMemoryNote}
          onEditItem={handleEditMemoryItem}
          onDeleteItem={handleDeleteMemoryItem}
          onClose={() => setMemoryOpen(false)}
        />
      )}
    </div>
  );
}

function buildProjectTitle(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= 18) return compact || "新的创作";
  return `${compact.slice(0, 18)}...`;
}
