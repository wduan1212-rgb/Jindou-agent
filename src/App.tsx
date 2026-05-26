import { useEffect, useMemo, useState } from "react";
import { runAgentTurn } from "./agent/conversationOrchestrator";
import { ApiSettingsModal } from "./components/ApiSettingsModal";
import { ChatView } from "./components/ChatView";
import { OptimizePromptModal } from "./components/OptimizePromptModal";
import { ProjectMemoryPanel } from "./components/ProjectMemoryPanel";
import { Sidebar } from "./components/Sidebar";
import { checkLatestVersion } from "./services/updateService";
import {
  createDefaultConversation,
  createDefaultFolder,
  createDefaultWorkspace,
  createId,
  createMessage,
  loadApiSettings,
  loadWorkspace,
  nowIso,
  saveWorkspace
} from "./services/storage";
import type { Conversation, ProjectFolder, WorkspaceData } from "./types/project";
import type { GlobalProjectMemory, ProjectMemory } from "./types/memory";
import type { MemoryCategory, PromptSegment } from "./types/chat";

export default function App() {
  const [workspace, setWorkspace] = useState<WorkspaceData>(() => loadWorkspace());
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [optimizingPrompt, setOptimizingPrompt] = useState<PromptSegment | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (workspace.activeFolderId) s.add(workspace.activeFolderId);
    return s;
  });

  const activeFolder = useMemo(
    () => workspace.folders.find((f) => f.id === workspace.activeFolderId) || workspace.folders[0],
    [workspace.activeFolderId, workspace.folders]
  );

  const activeConversation = useMemo(
    () => workspace.conversations.find((c) => c.id === workspace.activeConversationId) || workspace.conversations[0],
    [workspace.activeConversationId, workspace.conversations]
  );

  useEffect(() => { saveWorkspace(workspace); }, [workspace]);

  // ===== Folder ops =====
  function handleNewFolder() {
    const folder = createDefaultFolder(`项目 ${workspace.folders.length + 1}`);
    const convo = createDefaultConversation(folder.id);
    folder.conversationIds = [convo.id];
    setWorkspace((prev) => ({
      ...prev,
      folders: [folder, ...prev.folders],
      conversations: [convo, ...prev.conversations],
      activeFolderId: folder.id,
      activeConversationId: convo.id
    }));
    setExpandedFolders((prev) => new Set(prev).add(folder.id));
    setInput("");
  }

  function handleNewConversation(folderId: string) {
    const folder = workspace.folders.find((f) => f.id === folderId);
    if (!folder) return;
    const convo = createDefaultConversation(folderId);
    convo.title = `${folder.title} · 对话 ${folder.conversationIds.length + 1}`;
    setWorkspace((prev) => ({
      ...prev,
      conversations: [convo, ...prev.conversations],
      folders: prev.folders.map((f) =>
        f.id === folderId ? { ...f, conversationIds: [convo.id, ...f.conversationIds], updatedAt: nowIso() } : f
      ),
      activeConversationId: convo.id
    }));
    setInput("");
  }

  function handleRenameFolder(folderId: string, title: string) {
    setWorkspace((prev) => ({
      ...prev,
      folders: prev.folders.map((f) => (f.id === folderId ? { ...f, title, updatedAt: nowIso() } : f))
    }));
  }

  function handleRenameConversation(convoId: string, title: string) {
    setWorkspace((prev) => ({
      ...prev,
      conversations: prev.conversations.map((c) => (c.id === convoId ? { ...c, title, updatedAt: nowIso() } : c))
    }));
  }

  function handleDeleteFolder(folderId: string) {
    setWorkspace((prev) => {
      if (prev.folders.length <= 1) return prev;
      const nextFolders = prev.folders.filter((f) => f.id !== folderId);
      const removedConvoIds = prev.folders.find((f) => f.id === folderId)?.conversationIds || [];
      const nextConvos = prev.conversations.filter((c) => !removedConvoIds.includes(c.id));
      const nextActiveFolderId = prev.activeFolderId === folderId && nextFolders[0]
        ? nextFolders[0].id : prev.activeFolderId;
      const nextActiveConvoId = removedConvoIds.includes(prev.activeConversationId) && nextConvos[0]
        ? nextConvos[0].id : prev.activeConversationId;
      return {
        ...prev,
        folders: nextFolders,
        conversations: nextConvos,
        activeFolderId: nextActiveFolderId,
        activeConversationId: nextActiveConvoId
      };
    });
  }

  function handleDeleteConversation(convoId: string) {
    setWorkspace((prev) => {
      const convo = prev.conversations.find((c) => c.id === convoId);
      if (!convo) return prev;
      const folderConvos = prev.conversations.filter((c) => c.folderId === convo.folderId);
      if (folderConvos.length <= 1) {
        handleDeleteFolder(convo.folderId);
        return prev;
      }
      const nextConvos = prev.conversations.filter((c) => c.id !== convoId);
      const nextActiveConvoId = prev.activeConversationId === convoId && nextConvos[0]
        ? nextConvos[0].id : prev.activeConversationId;
      return {
        ...prev,
        conversations: nextConvos,
        folders: prev.folders.map((f) =>
          f.id === convo.folderId
            ? { ...f, conversationIds: f.conversationIds.filter((id) => id !== convoId), updatedAt: nowIso() }
            : f
        ),
        activeConversationId: nextActiveConvoId
      };
    });
  }

  function handleSelectConversation(convoId: string) {
    const convo = workspace.conversations.find((c) => c.id === convoId);
    setWorkspace((prev) => ({
      ...prev,
      activeConversationId: convoId,
      activeFolderId: convo?.folderId || prev.activeFolderId
    }));
    if (convo?.folderId) setExpandedFolders((prev) => new Set(prev).add(convo.folderId));
  }

  function handleToggleFolder(folderId: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  // ===== Folder memory ops =====
  function handleUpdateFolderMemory(folderId: string, updater: (m: ProjectMemory) => ProjectMemory) {
    setWorkspace((prev) => ({
      ...prev,
      folders: prev.folders.map((f) => (f.id === folderId ? { ...f, memory: updater(f.memory), updatedAt: nowIso() } : f))
    }));
  }

  function handleUpdateGlobalMemory(updater: (m: GlobalProjectMemory) => GlobalProjectMemory) {
    setWorkspace((prev) => ({
      ...prev,
      globalMemory: updater(prev.globalMemory)
    }));
  }

  // ===== Send =====
  async function handleSend(value: string) {
    const text = value.trim();
    if (!text || !activeConversation || isThinking) return;

    const convoSnapshot = activeConversation;
    const userMessage = createMessage({ role: "user", kind: "text", content: text });
    const optimisticTitle = convoSnapshot.messages.length === 0 ? buildConversationTitle(text) : convoSnapshot.title;

    setInput("");
    setWorkspace((prev) => ({
      ...prev,
      conversations: prev.conversations.map((c) =>
        c.id === convoSnapshot.id
          ? { ...c, title: optimisticTitle, tag: "刚刚", updatedAt: nowIso(), messages: [...c.messages, userMessage] }
          : c
      )
    }));

    setIsThinking(true);
    try {
      const result = await runAgentTurn({
        input: text,
        messages: convoSnapshot.messages,
        references: convoSnapshot.references,
        memory: activeFolder?.memory || convoSnapshot.references as any
      });

      setWorkspace((prev) => ({
        ...prev,
        conversations: prev.conversations.map((c) =>
          c.id === convoSnapshot.id
            ? { ...c, updatedAt: nowIso(), messages: [...c.messages, ...result.messages] }
            : c
        ),
        folders: prev.folders.map((f) =>
          f.id === activeFolder?.id ? { ...f, memory: result.memory } : f
        )
      }));
    } catch (error) {
      const errorNotice = createMessage({
        role: "assistant", kind: "notice",
        content: `请求失败：${error instanceof Error ? error.message : "未知错误"}。请检查 API 设置后重试。`
      });
      setWorkspace((prev) => ({
        ...prev,
        conversations: prev.conversations.map((c) =>
          c.id === convoSnapshot.id
            ? { ...c, updatedAt: nowIso(), messages: [...c.messages, errorNotice] }
            : c
        )
      }));
    } finally {
      setIsThinking(false);
    }
  }

  // ===== Prompt ops =====
  function handleOptimizePrompt(prompt: PromptSegment) { setOptimizingPrompt(prompt); }

  function submitOptimizePrompt(direction: string) {
    if (!optimizingPrompt) return;
    handleSend([
      "请基于下面这条视频提示词继续优化。",
      `优化方向：${direction}`,
      "你可以直接优化，也可以先反问一个关键问题。请保持导演视角和视频生成可执行性。",
      "<PROMPT_CARD>", optimizingPrompt.prompt, "</PROMPT_CARD>"
    ].join("\n"));
    setOptimizingPrompt(null);
  }

  function handleSavePromptMemory(prompt: PromptSegment) {
    if (!activeFolder) return;
    const note = `偏好：${prompt.videoType}，${prompt.shotMode === "multi" ? "多镜头剪辑" : "单镜头一镜到底"}，${prompt.model}`;
    const notice = createMessage({ role: "assistant", kind: "notice", content: `已保存到项目记忆：${note}` });
    setWorkspace((prev) => ({
      ...prev,
      folders: prev.folders.map((f) =>
        f.id === activeFolder.id
          ? { ...f, memory: { ...f.memory, notes: Array.from(new Set([note, ...f.memory.notes])).slice(0, 16) }, updatedAt: nowIso() }
          : f
      ),
      conversations: prev.conversations.map((c) =>
        c.id === activeConversation?.id ? { ...c, messages: [...c.messages, notice], updatedAt: nowIso() } : c
      )
    }));
  }

  function handleGenerateVideo() {
    if (!activeConversation) return;
    const notice = createMessage({
      role: "assistant", kind: "notice",
      content: "视频生成功能即将支持，敬请期待。当前可复制提示词到视频模型中使用。"
    });
    setWorkspace((prev) => ({
      ...prev,
      conversations: prev.conversations.map((c) =>
        c.id === activeConversation.id ? { ...c, messages: [...c.messages, notice], updatedAt: nowIso() } : c
      )
    }));
  }

  // ===== Memory panel =====
  function handleAddMemoryNote(note: string, scope: "folder" | "global") {
    if (scope === "folder" && activeFolder) {
      handleUpdateFolderMemory(activeFolder.id, (m) => ({
        ...m, notes: Array.from(new Set([note, ...m.notes])).slice(0, 16)
      }));
    } else {
      handleUpdateGlobalMemory((m) => ({
        ...m, notes: Array.from(new Set([note, ...m.notes])).slice(0, 16)
      }));
    }
  }

  function handleEditMemoryItem(category: MemoryCategory, index: number, value: string, scope: "folder" | "global") {
    if (scope === "folder" && activeFolder) {
      handleUpdateFolderMemory(activeFolder.id, (m) => {
        const items = [...m[category]];
        items[index] = value;
        return { ...m, [category]: items };
      });
    } else {
      handleUpdateGlobalMemory((m) => {
        const items = [...(m as unknown as Record<string, string[]>)[category]];
        items[index] = value;
        return { ...m, [category]: items } as GlobalProjectMemory;
      });
    }
  }

  function handleDeleteMemoryItem(category: MemoryCategory, index: number, scope: "folder" | "global") {
    if (scope === "folder" && activeFolder) {
      handleUpdateFolderMemory(activeFolder.id, (m) => ({
        ...m, [category]: m[category].filter((_, i) => i !== index)
      }));
    } else {
      handleUpdateGlobalMemory((m) => ({
        ...m, [category]: (m as unknown as Record<string, string[]>)[category].filter((_item: string, i: number) => i !== index)
      }));
    }
  }

  // ===== Updates =====
  async function handleCheckUpdates() {
    if (isCheckingUpdate) return;
    setIsCheckingUpdate(true);
    try {
      const result = await checkLatestVersion(__APP_VERSION__);
      if (result.hasUpdate) {
        if (window.confirm(`发现新版本 v${result.latestVersion}。\n当前版本 v${result.currentVersion}。\n要打开下载页面吗？`))
          window.open(result.releaseUrl, "_blank", "noopener,noreferrer");
      } else {
        window.alert(`当前已经是最新版本：v${result.currentVersion}`);
      }
    } catch (error) {
      if (window.confirm(`${error instanceof Error ? error.message : "检查更新失败。"}\n要直接打开下载页面吗？`))
        window.open("https://github.com/wduan1212-rgb/Jindou-agent/releases/latest", "_blank", "noopener,noreferrer");
    } finally { setIsCheckingUpdate(false); }
  }

  if (!activeConversation) return null;

  return (
    <div className="app-shell">
      <Sidebar
        workspace={workspace}
        activeConversationId={activeConversation.id}
        expandedFolders={expandedFolders}
        onNewFolder={handleNewFolder}
        onNewConversation={handleNewConversation}
        onSelectConversation={handleSelectConversation}
        onToggleFolder={handleToggleFolder}
        onRenameFolder={handleRenameFolder}
        onRenameConversation={handleRenameConversation}
        onDeleteFolder={handleDeleteFolder}
        onDeleteConversation={handleDeleteConversation}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenMemory={() => setMemoryOpen(true)}
        onCheckUpdates={handleCheckUpdates}
        isCheckingUpdate={isCheckingUpdate}
      />

      <ChatView
        conversation={activeConversation}
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
      {memoryOpen && activeFolder && (
        <ProjectMemoryPanel
          folderMemory={activeFolder.memory}
          globalMemory={workspace.globalMemory}
          onAddNote={handleAddMemoryNote}
          onEditItem={handleEditMemoryItem}
          onDeleteItem={handleDeleteMemoryItem}
          onClose={() => setMemoryOpen(false)}
        />
      )}
    </div>
  );
}

function buildConversationTitle(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= 24) return compact || "新的创作";
  return `${compact.slice(0, 24)}...`;
}
