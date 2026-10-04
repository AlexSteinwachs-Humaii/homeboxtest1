import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COLLECTION_ADMIN_TABS,
  collectionAdminColumns,
  collectionAdminRows,
  collectionDestructiveAction,
  isCollectionAdminTabActive,
  isCollectionSettingsPath,
  shouldRedirectCollectionRoot,
} from "./collection-admin";

const root = resolve(__dirname, "..");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("collection administration navigation", () => {
  it("keeps six labelled routes and wraps them into two rows at tablet width", () => {
    expect(COLLECTION_ADMIN_TABS.map(tab => tab.id)).toEqual([
      "members",
      "invites",
      "notifiers",
      "settings",
      "entity-types",
      "tools",
    ]);
    expect(COLLECTION_ADMIN_TABS.map(tab => tab.to)).toEqual([
      "/collection/members",
      "/collection/invites",
      "/collection/notifiers",
      "/collection/settings",
      "/collection/entity-types",
      "/collection/tools",
    ]);

    expect(collectionAdminColumns(834)).toBe(3);
    expect(collectionAdminRows(COLLECTION_ADMIN_TABS.length, collectionAdminColumns(834))).toBe(2);
    expect(collectionAdminColumns(1112)).toBe(3);
    expect(collectionAdminColumns(521)).toBe(3);
    expect(collectionAdminColumns(520)).toBe(2);
    expect(collectionAdminColumns(390)).toBe(2);
    expect(collectionAdminColumns(341)).toBe(2);
    expect(collectionAdminColumns(340)).toBe(1);
    expect(collectionAdminColumns(320)).toBe(1);
  });

  it("marks the matching section and treats the collection root as settings", () => {
    expect(isCollectionAdminTabActive("/collection/settings", "/collection/settings")).toBe(true);
    expect(isCollectionAdminTabActive("/collection/settings", "/collection/settings?x=1")).toBe(true);
    expect(isCollectionAdminTabActive("/collection/members", "/collection/settings")).toBe(false);
    expect(isCollectionAdminTabActive("/collection/entity-types", "/collection/entity-types")).toBe(true);
    expect(isCollectionSettingsPath("/collection/settings")).toBe(true);
    expect(isCollectionSettingsPath("/collection/members")).toBe(false);
    expect(shouldRedirectCollectionRoot("/collection")).toBe(true);
    expect(shouldRedirectCollectionRoot("/collection/")).toBe(true);
    expect(shouldRedirectCollectionRoot("/collection/settings")).toBe(false);
    expect(shouldRedirectCollectionRoot("/collection/tools")).toBe(false);
  });

  it("does not label an only-member deletion as leave", () => {
    expect(collectionDestructiveAction({ hasCollection: true, membershipKnown: false, isOnlyMember: true })).toBe(
      "checking"
    );
    expect(collectionDestructiveAction({ hasCollection: false, membershipKnown: true, isOnlyMember: false })).toBe(
      "checking"
    );
    expect(collectionDestructiveAction({ hasCollection: true, membershipKnown: true, isOnlyMember: true })).toBe(
      "delete"
    );
    expect(collectionDestructiveAction({ hasCollection: true, membershipKnown: true, isOnlyMember: false })).toBe(
      "leave"
    );
  });

  it("renders wrapped links, a settings-only danger zone, and the invites teleport target", () => {
    const page = read("pages/collection/index.vue");
    const css = read("assets/css/main.css");
    const messages = read("locales/en.json");

    expect(page).toContain('middleware: ["auth", "collection-root"]');
    expect(read("middleware/collection-root.ts")).toContain("shouldRedirectCollectionRoot");
    expect(page).toContain('from "~/lib/collection-admin"');
    expect(page).toContain("COLLECTION_ADMIN_TABS");
    expect(page).toContain('data-testid="collection-admin"');
    expect(page).toContain("aria-current");
    expect(page).toContain('id="collection-header-actions"');
    expect(page).toContain('data-testid="collection-danger-zone"');
    expect(page).toContain("handleLeaveCollection");
    expect(page).toContain("handleDeleteCollection");
    expect(page).toContain("handleCollectionPrimaryAction");
    expect(page).toContain("collection.leave_confirm");
    expect(page).toContain("collection.delete_confirm");
    expect(page).toContain("reloadCollections");
    expect(page).toContain("window.location.reload()");
    expect(page).not.toContain("hidden sm:block");
    expect(page).not.toContain('size="sm"');
    expect(page).not.toContain('size="icon"');

    expect(css).toContain(".collection-admin-nav");
    expect(css).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(css).toContain("max-width: 520px");
    expect(css).toContain("max-width: 340px");
    expect(css).toContain("min-height: 2.75rem");

    expect(messages).toContain('"checking_membership"');
    expect(messages).toContain('"danger_delete_hint"');
    expect(messages).toContain("only member");
  });
});
