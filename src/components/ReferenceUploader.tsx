import { FileImage, Paperclip, X } from "lucide-react";
import { createId } from "../services/storage";
import type { ReferenceAsset, ReferenceKind } from "../types/chat";

interface ReferenceUploaderProps {
  references: ReferenceAsset[];
  onChange: (references: ReferenceAsset[]) => void;
}

const kindLabels: Array<{ value: ReferenceKind; label: string }> = [
  { value: "mixed", label: "综合" },
  { value: "role", label: "角色" },
  { value: "product", label: "产品" },
  { value: "scene", label: "场景" },
  { value: "style", label: "风格" }
];

export function ReferenceUploader({ references, onChange }: ReferenceUploaderProps) {
  function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const next = Array.from(files).map((file) => ({
      id: createId("ref"),
      name: file.name,
      type: file.type || "reference",
      url: URL.createObjectURL(file),
      kind: "mixed" as ReferenceKind
    }));
    onChange([...references, ...next]);
  }

  function updateKind(referenceId: string, kind: ReferenceKind) {
    onChange(
      references.map((reference) => (reference.id === referenceId ? { ...reference, kind } : reference))
    );
  }

  function removeReference(referenceId: string) {
    onChange(references.filter((reference) => reference.id !== referenceId));
  }

  return (
    <div className="reference-uploader">
      <label className="soft-button">
        <Paperclip size={17} />
        上传文件
        <input
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={(event) => handleFiles(event.target.files)}
        />
      </label>

      {references.length > 0 && (
        <div className="reference-list">
          {references.map((reference) => (
            <div className="reference-chip" key={reference.id}>
              <FileImage size={15} />
              <span title={reference.name}>{reference.name}</span>
              <select
                value={reference.kind}
                onChange={(event) => updateKind(reference.id, event.target.value as ReferenceKind)}
                aria-label="参考类型"
              >
                {kindLabels.map((kind) => (
                  <option key={kind.value} value={kind.value}>
                    {kind.label}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => removeReference(reference.id)} aria-label="移除参考素材">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
