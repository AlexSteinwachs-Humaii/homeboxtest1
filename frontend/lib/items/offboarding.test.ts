import { describe, expect, it, vi } from "vitest";
import type { EntityOut, TypesDisposal } from "../api/types/data-contracts";
import type { ItemsApi } from "../api/classes/items";
import { useOffboarding } from "./offboarding";

function fixture() {
  let item = {
    id: "asset",
    disposed: false,
    disposalHistory: [],
    attachments: [],
  } as unknown as EntityOut;
  const offboard = vi.fn();
  const add = vi.fn();
  const api = { offboard, attachments: { add } } as unknown as Pick<ItemsApi, "offboard" | "attachments">;
  const updated = vi.fn((value: EntityOut) => {
    item = value;
  });
  const workflow = useOffboarding(api, () => item, updated);
  workflow.open.value = true;
  return { workflow, offboard, add, updated, getItem: () => item };
}

describe("asset disposal workflow", () => {
  it("cancels without submitting or changing lifecycle", () => {
    const f = fixture();
    f.workflow.cancel();
    expect(f.workflow.open.value).toBe(false);
    expect(f.getItem().disposed).toBe(false);
    expect(f.offboard).not.toHaveBeenCalled();
    expect(f.updated).not.toHaveBeenCalled();
  });

  it.each(["sale", "donation", "recycling", "destruction"] as const)("retains the accepted %s record", async route => {
    const f = fixture();
    const record = {
      route,
      submittedBy: "server-user",
      submittedAt: "2026-10-03T12:00:00Z",
    } as TypesDisposal;
    f.offboard.mockResolvedValue({ data: record });
    await f.workflow.submit({ route });
    expect(f.offboard).toHaveBeenCalledWith("asset", { route });
    expect(f.getItem().disposed).toBe(true);
    expect(f.getItem().disposalHistory).toEqual([record]);
    expect(f.workflow.open.value).toBe(false);
  });

  it.each(["validation", "network", "empty"])("keeps asset active on %s failure", async kind => {
    const f = fixture();
    if (kind === "network") f.offboard.mockRejectedValue(new Error("offline"));
    else f.offboard.mockResolvedValue(kind === "validation" ? { error: { status: 400 } } : {});
    await f.workflow.submit({ route: "destruction" });
    expect(f.workflow.error.value).toBe("asset_offboarding.submission_error");
    expect(f.workflow.open.value).toBe(true);
    expect(f.workflow.pending.value).toBe(false);
    expect(f.getItem().disposed).toBe(false);
    expect(f.updated).not.toHaveBeenCalled();
  });

  it("prevents cancellation and duplicate submission while pending", async () => {
    const f = fixture();
    let finish!: (value: unknown) => void;
    f.offboard.mockReturnValue(
      new Promise(resolve => {
        finish = resolve;
      })
    );
    const request = f.workflow.submit({ route: "sale" });
    f.workflow.cancel();
    await f.workflow.submit({ route: "donation" });
    expect(f.workflow.open.value).toBe(true);
    expect(f.offboard).toHaveBeenCalledTimes(1);
    finish({ error: {} });
    await request;
  });

  it("uploads through existing attachments API without disposing", async () => {
    const f = fixture();
    const file = { name: "certificate.pdf" } as File;
    const refreshed = { ...f.getItem(), attachments: [{ id: "evidence" }] };
    f.add.mockResolvedValue({ data: refreshed });
    await f.workflow.upload(file, "certificate");
    expect(f.add).toHaveBeenCalledWith("asset", file, "certificate.pdf", "attachment");
    expect(f.getItem()).toEqual(refreshed);
    f.workflow.cancel();
    expect(f.getItem().disposed).toBe(false);
    expect(f.offboard).not.toHaveBeenCalled();
  });

  it.each(["server", "network"])("shows %s upload errors without success", async kind => {
    const f = fixture();
    if (kind === "network") f.add.mockRejectedValue(new Error("offline"));
    else f.add.mockResolvedValue({ error: {} });
    await f.workflow.upload({ name: "photo.png" } as File, "photo");
    expect(f.workflow.error.value).toBe("asset_offboarding.upload_error");
    expect(f.getItem().disposed).toBe(false);
    expect(f.updated).not.toHaveBeenCalled();
    expect(f.offboard).not.toHaveBeenCalled();
  });
});
