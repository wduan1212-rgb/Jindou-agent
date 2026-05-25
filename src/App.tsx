import { useEffect, useMemo, useState } from "react";
import { runAgentTurn } from "./agent/conversationOrchestrator";
import { ApiSettingsModal } from "./components/ApiSettingsModal";
import { ChatView } from "./components/ChatView";
import { OptimizePromptModal } from "./components/OptimizePromptModal";
import { ProjectMemoryPanel } from "./components/ProjectMemoryPanel";
import { Sidebar } from "./components/Sidebar";
import { checkLatestVersion } from "./services/updateService";
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
import type { MemoryCategory, PromptSegment } from "./types/chat";
import type { Project } from "./types/project";

export default function App() {
  const [projects, setProjects] = useState<Project[]>(() => loadProjects());
  const [activeProjectId, setActiveProjectId] = useState<string>(() => loadActiveProjectId() || "");
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [optimizingPrompt, setOptimizingPrompt] = useState<PromptSegment | null>(null);

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
    try {
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
    } catch (error) {
      const errorNotice = createMessage({
        role: "assistant",
        kind: "notice",
        content: `请求失败：${error instanceof Error ? error.message : "未知错误"}。请检查 API 设置后重试。`
      });
      updateProject(projectSnapshot.id, (project) => ({
        ...project,
        updatedAt: nowIso(),
        messages: [...project.messages, errorNotice]
      }));
    } finally {
      setIsThinking(false);
    }
  }

  function handleOptimizePrompt(prompt: PromptSegment) {
    setOptimizingPrompt(prompt);
  }

  function submitOptimizePrompt(direction: string) {
    if (!optimizingPrompt) return;
    handleSend(
      [
        "请基于下面这条视频提示词继续优化。",
        `优化方向：${direction}`,
        "你可以直接优化，也可以先反问一个关键问题。请保持导演视角和视频生成可执行性。",
        "<PROMPT_CARD>",
        optimizingPrompt.prompt,
        "</PROMPT_CARD>"
      ].join("\n")
    );
    setOptimizingPrompt(null);
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
    const notice = createMessage({
      role: "assistant",
      kind: "notice",
      content: "视频生成功能即将支持，敬请期待。当前可复制提示词到视频模型中使用。"
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

  async function handleCheckUpdates() {
    if (isCheckingUpdate) return;
    setIsCheckingUpdate(true);

    try {
      const result = await checkLatestVersion(__APP_VERSION__);
      if (result.hasUpdate) {
        const openRelease = window.confirm(
          `发现新版本 v${result.latestVersion}。\n当前版本 v${result.currentVersion}。\n要打开下载页面吗？`
        );
        if (openRelease) window.open(result.releaseUrl, "_blank", "noopener,noreferrer");
      } else {
        window.alert(`当前已经是最新版本：v${result.currentVersion}`);
      }
    } catch (error) {
      const openRelease = window.confirm(
        `${error instanceof Error ? error.message : "检查更新失败。"}\n要直接打开下载页面吗？`
      );
      if (openRelease) window.open("https://github.com/wduan1212-rgb/Jindou-agent/releases/latest", "_blank", "noopener,noreferrer");
    } finally {
      setIsCheckingUpdate(false);
    }
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
        onCheckUpdates={handleCheckUpdates}
        isCheckingUpdate={isCheckingUpdate}
      />

      <ChatView
        project={activeProject}
        input={input}
        disabled={isThinking}
        onInputChange={setInput}
        onSend={handleSend}
        onOptimizePrompt={handleOptimizePrompt}
        onSavePromptMemory={handleSavePromptMemory}
        onGenerateVideo={handleGenerateVideo}
        onQuestionSubmit={handleSend}
      />

      {settingsOpen && <ApiSettingsModal onClose={() => setSettingsOpen(false)} />}
      {optimizingPrompt && (
        <OptimizePromptModal
          prompt={optimizingPrompt}
          onClose={() => setOptimizingPrompt(null)}
          onSubmit={submitOptimizePrompt}
        />
      )}
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
