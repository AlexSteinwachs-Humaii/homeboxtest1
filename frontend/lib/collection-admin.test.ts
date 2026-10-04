import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  COLLECTION_ADMIN_ONE_COLUMN_MAX,
  COLLECTION_ADMIN_TWO_COLUMN_MAX,
  activeCollectionAdminTab,
  collectionAdminColumns,
  collectionAdminRows,
  collectionAdminTabs,
  collectionDestructiveAction,
} from "./collection-admin";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/collection/index.vue"), "utf8");
const en = readFileSync(resolve(here, "../locales/en.json"), "utf8");
const shell = readFileSync(resolve(here, "./shell-nav.ts"), "utf8");
const selector = readFileSync(resolve(here, "../components/Collection/Selector.vue"), "utf8");

describe("collection administration navigation", () => {
  it("wraps six labelled sections into two rows at 834px and fewer columns when narrow", () => {
    expect(collectionAdminTabs).toHaveLength(6);
    expect(collectionAdminColumns(834)).toBe(3);
    expect(collectionAdminRows(collectionAdminTabs.length, collectionAdminColumns(834))).toBe(2);
    expect(collectionAdminColumns(1112)).toBe(3);
    expect(collectionAdminColumns(521)).toBe(3);
    expect(collectionAdminColumns(COLLECTION_ADMIN_TWO_COLUMN_MAX)).toBe(2);
    expect(collectionAdminColumns(390)).toBe(2);
    expect(collectionAdminColumns(COLLECTION_ADMIN_ONE_COLUMN_MAX)).toBe(1);
    expect(collectionAdminColumns(Number.NaN)).toBe(3);
    expect(page).toContain(`max-width: ${COLLECTION_ADMIN_TWO_COLUMN_MAX}px`);
    expect(page).toContain(`max-width: ${COLLECTION_ADMIN_ONE_COLUMN_MAX}px`);
    expect(page).toContain("repeat(3, minmax(0, 1fr))");
    expect(page).toContain("minmax(0, 1fr)");
    expect(page).not.toContain("hidden sm:block");
    expect(page).toContain("aria-current");
    expect(page).toContain("min-height: var(--glass-touch)");
  });

  it("keeps every section on its existing collection route and opens Settings from the shell", () => {
    expect(collectionAdminTabs.map(tab => tab.to)).toEqual([
      "/collection/members",
      "/collection/invites",
      "/collection/notifiers",
      "/collection/settings",
      "/collection/entity-types",
      "/collection/tools",
    ]);
    expect(page).toContain(':to="tab.to"');
    expect(page).toContain("collectionAdminTabs");
    for (const tab of collectionAdminTabs) {
      expect(activeCollectionAdminTab(tab.to)).toBe(tab.id);
    }
    expect(activeCollectionAdminTab("/collection/settings?x=1")).toBe("settings");
    expect(activeCollectionAdminTab("/collection/tools/")).toBe("tools");
    expect(activeCollectionAdminTab("/collection")).toBeNull();
    expect(shell).toContain('to: "/collection/settings"');
    expect(selector).toContain('to="/collection/settings"');
    expect(page).toContain("<NuxtPage");
  });

  it("keeps leave and delete as separate labelled safeguards", () => {
    expect(collectionDestructiveAction({ hasCollection: true, membersLoading: true, isOnlyMember: true })).toBe(
      "pending"
    );
    expect(collectionDestructiveAction({ hasCollection: false, membersLoading: false, isOnlyMember: false })).toBe(
      "pending"
    );
    expect(collectionDestructiveAction({ hasCollection: true, membersLoading: false, isOnlyMember: false })).toBe(
      "leave"
    );
    expect(collectionDestructiveAction({ hasCollection: true, membersLoading: false, isOnlyMember: true })).toBe(
      "delete"
    );
    expect(page).toContain("handleLeaveCollection");
    expect(page).toContain("handleDeleteCollection");
    expect(page).toContain("collection.leave_confirm");
    expect(page).toContain("collection.delete_confirm");
    expect(page).toContain("reloadCollections()");
    expect(page).toContain("window.location.reload()");
    expect(page).toContain("collection.delete_collection");
    expect(page).toContain("collection.leave_collection");
    expect(page).toContain('id="collection-header-actions"');
    expect(page).toContain('data-testid="collection-danger-zone"');
    expect(en).toContain("Delete this collection");
    expect(en).toContain("Leave this collection");
    expect(en).not.toMatch(/"delete_heading": "Leave/);
  });
});
