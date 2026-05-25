/**
 * 参考图规则构建器。当前尚未接入主流程的参考图链路 —— conversationOrchestrator
 * 在 system prompt 中以文字方式描述参考素材，未通过此模块生成结构化参考规则。
 * 后续接入参考图功能时需要从此文件恢复逻辑。勿删。
 */
import type { ReferenceAsset } from "../types/chat";

export function buildReferenceRule(references: ReferenceAsset[], referenceMode: string): string {
  if (references.length === 0 && referenceMode !== "with-reference") {
    return "没有参考图，直接文生视频；角色、场景、产品道具由画面描述生成，整段保持外观稳定。";
  }

  const kinds = new Set(references.map((reference) => reference.kind));
  const rules: string[] = [];

  if (kinds.has("role")) {
    rules.push("根据角色参考图生成，角色五官、发型、身形比例、服装状态保持稳定。");
  }
  if (kinds.has("product")) {
    rules.push("根据产品细节图生成，产品外观、颜色、材质、结构保持稳定。");
  }
  if (kinds.has("scene")) {
    rules.push("根据场景参考图生成，空间结构、主要陈设、光线方向保持稳定。");
  }
  if (kinds.has("style")) {
    rules.push("参考风格图的整体视觉风格、色调、光影和构图气质，不照搬风格图主体。");
  }
  if (kinds.has("mixed") || rules.length === 0) {
    rules.push("根据已上传参考素材生成，参考图中确定的主体、产品、空间结构和视觉风格保持稳定，不编造参考图外观。");
  }

  return rules.join("");
}
