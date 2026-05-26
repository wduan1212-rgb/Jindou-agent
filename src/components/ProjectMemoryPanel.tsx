import { Check, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { MemoryCategory } from "../types/chat";
import type { GlobalProjectMemory, ProjectMemory } from "../types/memory";

interface ProjectMemoryPanelProps {
  folderMemory: ProjectMemory;
  globalMemory: GlobalProjectMemory;
  onAddNote: (note: string, scope: "folder" | "global") => void;
  onEditItem: (category: MemoryCategory, index: number, value: string, scope: "folder" | "global") => void;
  onDeleteItem: (category: MemoryCategory, index: number, scope: "folder" | "global") => void;
  onClose: () => void;
}

type Scope = "folder" | "global";

export function ProjectMemoryPanel({
  folderMemory, globalMemory, onAddNote, onEditItem, onDeleteItem, onClose
}: ProjectMemoryPanelProps) {
  const [scope, setScope] = useState<Scope>("folder");
  const [note, setNote] = useState("");
  const memory = scope === "folder" ? folderMemory : globalMemory;

  function submit() {
    if (!note.trim()) return;
    onAddNote(note.trim(), scope);
    setNote("");
  }

  const isFolderMemory = scope === "folder";
  const catItems = (cat: MemoryCategory) => (memory as any)[cat] as string[];
  const defaultModel = isFolderMemory ? (memory as ProjectMemory).defaultModel : "Seedance";
  const defaultShotMode = isFolderMemory ? (memory as ProjectMemory).defaultShotMode : "multi";

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-panel memory-modal" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
        <header className="modal-header">
          <div>
            <span className="eyebrow"><Sparkles size={15} />Memory</span>
            <h2>项目记忆</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </header>

        <div className="memory-tabs">
          <button type="button" className={`memory-tab ${scope === "folder" ? "active" : ""}`} onClick={() => setScope("folder")}>当前项目</button>
          <button type="button" className={`memory-tab ${scope === "global" ? "active" : ""}`} onClick={() => setScope("global")}>全局偏好</button>
        </div>

        <div className="memory-grid">
          <MemoryBlock title="默认模型" items={[defaultModel]} readonly />
          <MemoryBlock title="默认结构" items={[defaultShotMode === "single" ? "单镜头一镜到底" : "多镜头剪辑"]} readonly />
          <MemoryBlock title="风格偏好" category="stylePreferences" items={catItems("stylePreferences")} scope={scope} onEditItem={onEditItem} onDeleteItem={onDeleteItem} />
          <MemoryBlock title="口播偏好" category="voicePreferences" items={catItems("voicePreferences")} scope={scope} onEditItem={onEditItem} onDeleteItem={onDeleteItem} />
          <MemoryBlock title="负面约束" category="negativeRules" items={catItems("negativeRules")} scope={scope} onEditItem={onEditItem} onDeleteItem={onDeleteItem} />
          {isFolderMemory && <MemoryBlock title="提示词模板" category="promptTemplates" items={catItems("promptTemplates")} scope={scope} onEditItem={onEditItem} onDeleteItem={onDeleteItem} />}
          <MemoryBlock title="备注" category="notes" items={catItems("notes").length ? catItems("notes") : ["暂无备注"]} readonly={catItems("notes").length === 0} />
        </div>

        <div className="memory-input">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={`新增${scope === "folder" ? "项目" : "全局"}偏好`} />
          <button className="primary-inline-button" type="button" onClick={submit} disabled={!note.trim()}><Plus size={17} />添加</button>
        </div>
      </div>
    </div>
  );
}

function MemoryBlock({
  title, category, items, readonly, scope, onEditItem, onDeleteItem
}: {
  title: string;
  category?: MemoryCategory;
  items: string[];
  readonly?: boolean;
  scope?: Scope;
  onEditItem?: (category: MemoryCategory, index: number, value: string, scope: Scope) => void;
  onDeleteItem?: (category: MemoryCategory, index: number, scope: Scope) => void;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");

  function startEdit(index: number, item: string) { setEditingIndex(index); setEditingValue(item); }
  function saveEdit(index: number) {
    if (!category || !editingValue.trim() || !scope) return;
    onEditItem?.(category, index, editingValue.trim(), scope);
    setEditingIndex(null); setEditingValue("");
  }

  return (
    <section className="memory-block">
      <h3>{title}</h3>
      <div className="memory-tags">
        {items.map((item, index) => (
          <span className="memory-tag" key={`${title}-${item}-${index}`}>
            {editingIndex === index ? (
              <>
                <input value={editingValue} onChange={(e) => setEditingValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(index); if (e.key === "Escape") setEditingIndex(null); }} />
                <button type="button" onClick={() => saveEdit(index)} aria-label="保存"><Check size={13} /></button>
              </>
            ) : (
              <>
                <span className="memory-tag-text">{item}</span>
                {!readonly && category && scope && (
                  <>
                    <button type="button" onClick={() => startEdit(index, item)} aria-label="编辑"><Pencil size={13} /></button>
                    <button type="button" onClick={() => onDeleteItem?.(category, index, scope)} aria-label="删除"><Trash2 size={13} /></button>
                  </>
                )}
              </>
            )}
          </span>
        ))}
      </div>
    </section>
  );
}
