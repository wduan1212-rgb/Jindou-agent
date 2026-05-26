import { Clock3, Download, MessageSquareText, Moon, Pencil, Plus, Search, Settings2, Sparkles, Sun, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Project } from "../types/project";

interface SidebarProps {
  projects: Project[];
  activeProjectId: string;
  onNewProject: () => void;
  onSelectProject: (projectId: string) => void;
  onRenameProject: (projectId: string, title: string) => void;
  onDeleteProject: (projectId: string) => void;
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
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}

export function Sidebar({
  projects,
  activeProjectId,
  onNewProject,
  onSelectProject,
  onRenameProject,
  onDeleteProject,
  onOpenSettings,
  onOpenMemory,
  onCheckUpdates,
  isCheckingUpdate
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("jindou.theme", theme); } catch {}
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  }

  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((project) => project.title.toLowerCase().includes(query));
  }, [projects, searchQuery]);

  function rename(project: Project) {
    const nextTitle = window.prompt("编辑会话名称", project.title)?.trim();
    if (nextTitle) onRenameProject(project.id, nextTitle);
  }

  function remove(project: Project) {
    if (!window.confirm(`删除会话"${project.title}"？`)) return;
    onDeleteProject(project.id);
  }

  return (
    <aside className="sidebar">
      <div className="brand-row">
        <img src="/assets/agent-avatar.png" alt="" className="brand-avatar" />
        <div className="brand-name">Jindou Agent</div>
        <button className="icon-button" type="button" onClick={onOpenSettings} aria-label="API 设置">
          <Settings2 size={18} />
        </button>
      </div>

      <button className="new-chat-button" type="button" onClick={onNewProject}>
        <Plus size={18} />
        新建创作
      </button>

      <label className="search-box">
        <Search size={16} />
        <input
          placeholder="搜索项目"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      </label>

      <div className="sidebar-section-title">
        <Clock3 size={16} />
        最近对话
      </div>

      <div className="project-list">
        {filteredProjects.map((project) => (
          <div
            key={project.id}
            className={`project-item ${project.id === activeProjectId ? "active" : ""}`}
          >
            <button type="button" className="project-main" onClick={() => onSelectProject(project.id)}>
              <MessageSquareText size={18} />
              <span>
                <strong>{project.title}</strong>
                <small>{project.tag}</small>
              </span>
            </button>
            <span className="project-actions">
              <button type="button" onClick={() => rename(project)} aria-label="编辑会话名称">
                <Pencil size={14} />
              </button>
              <button type="button" onClick={() => remove(project)} aria-label="删除会话">
                <Trash2 size={14} />
              </button>
            </span>
          </div>
        ))}
        {filteredProjects.length === 0 && searchQuery.trim() && (
          <div className="empty-search">没有找到匹配的项目</div>
        )}
      </div>

      <div className="sidebar-bottom">
        <button className="theme-toggle" type="button" onClick={toggleTheme}>
          {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
          {theme === "light" ? "暗色模式" : "亮色模式"}
        </button>
        <button className="memory-entry" type="button" onClick={onCheckUpdates} disabled={isCheckingUpdate}>
          <Download size={17} />
          {isCheckingUpdate ? "检查中..." : "检查更新"}
        </button>
        <button className="memory-entry" type="button" onClick={onOpenMemory}>
          <Sparkles size={17} />
          项目记忆
        </button>
        <div className="user-card">
          <img src="/assets/user-avatar.png" alt="" />
          <span>
            <strong>金豆小子</strong>
            <small>本地创作者</small>
          </span>
        </div>
      </div>
    </aside>
  );
}
