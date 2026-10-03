import type { DestructionInput, ItemAttachment } from "../api/types/data-contracts";

export const destructionDeclaration =
  "I declare that this asset was destroyed on the stated date using the stated method, and that the attached evidence supports my declaration.";

// Match the server's upload-only evidence policy. Generic PDF/image uploads
// selected here are offered specifically as destruction certificates.
export function destructionEvidenceKind(attachment: ItemAttachment | undefined): "photo" | "certificate" | null {
  if (!attachment?.path || !attachment.mimeType) return null;
  const image = attachment.mimeType.startsWith("image/");
  if (attachment.type === "photo" && image) return "photo";
  if (attachment.type === "attachment" && (image || attachment.mimeType === "application/pdf")) return "certificate";
  return null;
}

// Returns translation keys for inline form validation feedback.
export function validateDestruction(input: DestructionInput, attachments: ItemAttachment[]): string[] {
  const errors: string[] = [];
  if (!input.declared) errors.push("asset_offboarding.consent_required");
  const date = typeof input.date === "string" ? input.date : "";
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    errors.push("asset_offboarding.date_required");
  }
  if (!input.method.trim()) errors.push("asset_offboarding.method_required");
  const seen = new Set<string>();
  if (
    input.evidence.length === 0 ||
    input.evidence.some(ref => {
      const attachment = attachments.find(attachment => attachment.id === ref.attachmentId);
      const invalid = !attachment || destructionEvidenceKind(attachment) !== ref.kind || seen.has(ref.attachmentId);
      seen.add(ref.attachmentId);
      return invalid;
    })
  ) {
    errors.push("asset_offboarding.evidence_required");
  }
  return errors;
}
