import { Check, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { MemoryCategory } from "../types/chat";
import type { ProjectMemory } from "../types/memory";

interface ProjectMemoryPanelProps {
  memory: ProjectMemory;
  onAddNote: (note: string) => void;
  onEditItem: (category: MemoryCategory, index: number, value: string) => void;
  onDeleteItem: (category: MemoryCategory, index: number) => void;
  onClose: () => void;
}

export function ProjectMemoryPanel({
  memory,
  onAddNote,
  onEditItem,
  onDeleteItem,
  onClose
}: ProjectMemoryPanelProps) {
  const [note, setNote] = useState("");

  function submit() {
    if (!note.trim()) return;
    onAddNote(note.trim());
    setNote("");
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-panel memory-modal">
        <header className="modal-header">
          <div>
            <span className="eyebrow">
              <Sparkles size={15} />
              Memory
            </span>
            <h2>项目记忆</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>

        <div className="memory-grid">
          <MemoryBlock title="默认模型" items={[memory.defaultModel]} readonly />
          <MemoryBlock title="默认结构" items={[memory.defaultShotMode === "multi" ? "多镜头剪辑" : "单镜头一镜到底"]} />
          <MemoryBlock
            title="风格偏好"
            category="stylePreferences"
            items={memory.stylePreferences}
            onEditItem={onEditItem}
            onDeleteItem={onDeleteItem}
          />
          <MemoryBlock
            title="口播偏好"
            category="voicePreferences"
            items={memory.voicePreferences}
            onEditItem={onEditItem}
            onDeleteItem={onDeleteItem}
          />
          <MemoryBlock
            title="负面约束"
            category="negativeRules"
            items={memory.negativeRules}
            onEditItem={onEditItem}
            onDeleteItem={onDeleteItem}
          />
          <MemoryBlock
            title="备注"
            category="notes"
            items={memory.notes.length ? memory.notes : ["暂无额外备注"]}
            readonly={memory.notes.length === 0}
            onEditItem={onEditItem}
            onDeleteItem={onDeleteItem}
          />
        </div>

        <div className="memory-input">
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="新增一条项目偏好" />
          <button className="primary-inline-button" type="button" onClick={submit}>
            <Plus size={17} />
            添加
          </button>
        </div>
      </div>
    </div>
  );
}

function MemoryBlock({
  title,
  category,
  items,
  readonly,
  onEditItem,
  onDeleteItem
}: {
  title: string;
  category?: MemoryCategory;
  items: string[];
  readonly?: boolean;
  onEditItem?: (category: MemoryCategory, index: number, value: string) => void;
  onDeleteItem?: (category: MemoryCategory, index: number) => void;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");

  function startEdit(index: number, item: string) {
    setEditingIndex(index);
    setEditingValue(item);
  }

  function saveEdit(index: number) {
    if (!category || !editingValue.trim()) return;
    onEditItem?.(category, index, editingValue.trim());
    setEditingIndex(null);
    setEditingValue("");
  }

  return (
    <section className="memory-block">
      <h3>{title}</h3>
      <div className="memory-tags">
        {items.map((item, index) => (
          <span className="memory-tag" key={`${title}-${item}-${index}`}>
            {editingIndex === index ? (
              <>
                <input
                  value={editingValue}
                  onChange={(event) => setEditingValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") saveEdit(index);
                    if (event.key === "Escape") setEditingIndex(null);
                  }}
                />
                <button type="button" onClick={() => saveEdit(index)} aria-label="保存记忆">
                  <Check size={13} />
                </button>
              </>
            ) : (
              <>
                <span className="memory-tag-text">{item}</span>
                {!readonly && category && (
                  <>
                    <button type="button" onClick={() => startEdit(index, item)} aria-label="编辑记忆">
                      <Pencil size={13} />
                    </button>
                    <button type="button" onClick={() => onDeleteItem?.(category, index)} aria-label="删除记忆">
                      <Trash2 size={13} />
                    </button>
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
