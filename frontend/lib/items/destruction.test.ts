import { describe, expect, it } from "vitest";
import type { DestructionInput, ItemAttachment } from "../api/types/data-contracts";
import { destructionEvidenceKind, validateDestruction } from "./destruction";

const photo: ItemAttachment = {
  id: "photo-id",
  type: "photo",
  path: "uploads/photo",
  title: "Destroyed asset",
  mimeType: "image/jpeg",
  primary: false,
  createdAt: "",
  updatedAt: "",
  thumbnail: null as unknown as ItemAttachment["thumbnail"],
};
const valid = (): DestructionInput => ({
  declared: true,
  date: "2026-10-01",
  method: "Shredded",
  evidence: [{ attachmentId: photo.id, kind: "photo" }],
});

describe("destruction validation", () => {
  it("accepts uploaded photo and certificate evidence", () => {
    expect(validateDestruction(valid(), [photo])).toEqual([]);
    expect(destructionEvidenceKind({ ...photo, type: "attachment", mimeType: "application/pdf" })).toBe("certificate");
  });
  it.each([
    { declared: false },
    { date: "" },
    { date: "2026-02-30" },
    { date: "0001-01-01" },
    { method: " \n " },
    { evidence: [] },
    { evidence: [{ attachmentId: "missing", kind: "photo" }] },
    { evidence: [{ attachmentId: photo.id, kind: "certificate" }] },
  ])("rejects incomplete input %j", patch => {
    expect(validateDestruction({ ...valid(), ...patch }, [photo]).length).toBeGreaterThan(0);
  });
  it("accepts certificate-only evidence but revalidates when attachments change", () => {
    const certificate = { ...photo, type: "attachment", mimeType: "application/pdf" };
    const input = { ...valid(), evidence: [{ attachmentId: photo.id, kind: "certificate" }] };
    expect(validateDestruction(input, [certificate])).toEqual([]);
    expect(validateDestruction(input, [])).toContain("asset_offboarding.evidence_required");
    expect(validateDestruction(input, [{ ...certificate, mimeType: "link/url" }])).toContain(
      "asset_offboarding.evidence_required"
    );
  });
  it("rejects external links, thumbnails, missing paths and duplicate references", () => {
    for (const patch of [{ mimeType: "link/url" }, { type: "thumbnail" }, { path: "" }, { path: " \n\t " }]) {
      expect(validateDestruction(valid(), [{ ...photo, ...patch }]).length).toBeGreaterThan(0);
    }
    const input = valid();
    input.evidence.push({ attachmentId: photo.id, kind: "photo" });
    expect(validateDestruction(input, [photo]).length).toBeGreaterThan(0);
    expect(destructionEvidenceKind(undefined)).toBeNull();
  });
});
