import { Check, ChevronDown, ChevronRight, Download, FolderPlus, MessageSquarePlus, MessageSquareText, Moon, Pencil, Search, Settings2, Sparkles, Sun, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceData } from "../types/project";

interface SidebarProps {
  workspace: WorkspaceData;
  activeConversationId: string;
  expandedFolders: Set<string>;
  onNewFolder: () => void;
  onNewConversation: (folderId: string) => void;
  onSelectConversation: (id: string) => void;
  onToggleFolder: (id: string) => void;
  onRenameFolder: (id: string, title: string) => void;
  onRenameConversation: (id: string, title: string) => void;
  onDeleteFolder: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onOpenSettings: () => void;
  onOpenMemory: () => void;
  onCheckUpdates: () => void;
  isCheckingUpdate?: boolean;
}

function getInitialTheme(): "light" | "dark" {
  try {
    const stored = localStorage.getItem("jindou.theme");
    if (stored === "dark" || stored === "light") return stored;
  } catch {}
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function Sidebar({
  workspace,
  activeConversationId,
  expandedFolders,
  onNewFolder, onNewConversation, onSelectConversation,
  onToggleFolder, onRenameFolder, onRenameConversation,
  onDeleteFolder, onDeleteConversation,
  onOpenSettings, onOpenMemory, onCheckUpdates, isCheckingUpdate
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingConvoId, setEditingConvoId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("jindou.theme", theme); } catch {}
  }, [theme]);

  useEffect(() => {
    if (editingFolderId || editingConvoId) {
      editRef.current?.focus();
      editRef.current?.select();
    }
  }, [editingFolderId, editingConvoId]);

  function startEditFolder(id: string, title: string) {
    setEditingFolderId(id);
    setEditingConvoId(null);
    setEditValue(title);
  }

  function startEditConvo(id: string, title: string) {
    setEditingConvoId(id);
    setEditingFolderId(null);
    setEditValue(title);
  }

  function confirmEdit() {
    const v = editValue.trim();
    if (v && editingFolderId) {
      onRenameFolder(editingFolderId, v);
    } else if (v && editingConvoId) {
      onRenameConversation(editingConvoId, v);
    }
    setEditingFolderId(null);
    setEditingConvoId(null);
    setEditValue("");
  }

  function cancelEdit() {
    setEditingFolderId(null);
    setEditingConvoId(null);
    setEditValue("");
  }

  function handleEditKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); confirmEdit(); }
    if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
  }

  const filteredFolders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return workspace.folders;
    return workspace.folders.filter((f) => {
      if (f.title.toLowerCase().includes(q)) return true;
      return f.conversationIds.some((cid) => {
        const c = workspace.conversations.find((cc) => cc.id === cid);
        return c?.title.toLowerCase().includes(q);
      });
    });
  }, [workspace.folders, workspace.conversations, searchQuery]);

  return (
    <aside className="sidebar">
      <div className="brand-row">
        <img src="/assets/agent-avatar.png" alt="" className="brand-avatar" />
        <div className="brand-name">Jindou Agent</div>
        <button className="icon-button" type="button" onClick={onOpenSettings} aria-label="API 设置">
          <Settings2 size={18} />
        </button>
      </div>

      <button className="new-chat-button" type="button" onClick={onNewFolder}>
        <FolderPlus size={18} />
        新建项目
      </button>

      <label className="search-box">
        <Search size={16} />
        <input placeholder="搜索项目或对话" value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)} />
      </label>

      <div className="project-list">
        {filteredFolders.map((folder) => {
          const isExpanded = expandedFolders.has(folder.id);
          const folderConvos = workspace.conversations.filter((c) => c.folderId === folder.id);
          const isEditingFolder = editingFolderId === folder.id;

          return (
            <div key={folder.id} className="folder-group">
              <div className="folder-row">
                <button className="folder-toggle" onClick={() => onToggleFolder(folder.id)}>
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>

                {isEditingFolder ? (
                  <div className="folder-edit-row">
                    <input
                      ref={editRef}
                      className="inline-edit-input"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleEditKeyDown}
                      onBlur={confirmEdit}
                    />
                    <button className="edit-confirm" onMouseDown={(e) => { e.preventDefault(); confirmEdit(); }} aria-label="确认"><Check size={14} /></button>
                    <button className="edit-cancel" onMouseDown={(e) => { e.preventDefault(); cancelEdit(); }} aria-label="取消"><X size={14} /></button>
                  </div>
                ) : (
                  <button className="folder-main" onClick={() => onToggleFolder(folder.id)}>
                    <strong>{folder.title}</strong>
                    <small>{folderConvos.length} 个对话</small>
                  </button>
                )}

                <span className="folder-actions">
                  <button onClick={(e) => { e.stopPropagation(); onNewConversation(folder.id); }} aria-label="新建对话">
                    <MessageSquarePlus size={14} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); startEditFolder(folder.id, folder.title); }} aria-label="重命名">
                    <Pencil size={14} />
                  </button>
                  {workspace.folders.length > 1 && (
                    <button onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`删除项目"${folder.title}"及其所有对话？`)) onDeleteFolder(folder.id);
                    }} aria-label="删除"><Trash2 size={14} /></button>
                  )}
                </span>
              </div>

              {isExpanded && (
                <div className="convo-list">
                  {folderConvos.map((convo) => {
                    const isEditingConvo = editingConvoId === convo.id;
                    return (
                      <div key={convo.id} className={`project-item ${convo.id === activeConversationId ? "active" : ""}`}>
                        {isEditingConvo ? (
                          <div className="convo-edit-row">
                            <input
                              ref={editRef}
                              className="inline-edit-input"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleEditKeyDown}
                              onBlur={confirmEdit}
                            />
                            <button className="edit-confirm" onMouseDown={(e) => { e.preventDefault(); confirmEdit(); }} aria-label="确认"><Check size={14} /></button>
                            <button className="edit-cancel" onMouseDown={(e) => { e.preventDefault(); cancelEdit(); }} aria-label="取消"><X size={14} /></button>
                          </div>
                        ) : (
                          <button className="project-main" onClick={() => onSelectConversation(convo.id)}>
                            <MessageSquareText size={16} />
                            <span><strong>{convo.title}</strong><small>{convo.tag}</small></span>
                          </button>
                        )}
                        <span className="project-actions">
                          <button onClick={(e) => { e.stopPropagation(); startEditConvo(convo.id, convo.title); }} aria-label="重命名"><Pencil size={14} /></button>
                          <button onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`删除对话"${convo.title}"？`)) onDeleteConversation(convo.id);
                          }} aria-label="删除"><Trash2 size={14} /></button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {filteredFolders.length === 0 && searchQuery.trim() && (
          <div className="empty-search">没有找到匹配的项目</div>
        )}
      </div>

      <div className="sidebar-bottom">
        <button className="memory-entry" type="button" onClick={onCheckUpdates} disabled={isCheckingUpdate}>
          <Download size={17} />{isCheckingUpdate ? "检查中..." : "检查更新"}
        </button>
        <button className="memory-entry" type="button" onClick={onOpenMemory}>
          <Sparkles size={17} />项目记忆
        </button>
        <button className="theme-switch" type="button" onClick={() => setTheme((p) => (p === "light" ? "dark" : "light"))} role="switch" aria-checked={theme === "dark"} aria-label="切换亮色/暗色主题">
          <span className="theme-switch-track"><span className="theme-switch-thumb">{theme === "light" ? <Sun size={14} /> : <Moon size={14} />}</span></span>
          <span className="theme-switch-label">{theme === "light" ? "亮色" : "暗色"}</span>
        </button>
        <div className="user-card">
          <img src="/assets/user-avatar.png" alt="" />
          <span><strong>金豆小子</strong><small>本地创作者</small></span>
        </div>
      </div>
    </aside>
  );
}
