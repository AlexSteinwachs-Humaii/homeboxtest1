import { shouldRedirectCollectionRoot } from "~/lib/collection-admin";

/** `/collection` has no section of its own. Administration opens on Settings. */
export default defineNuxtRouteMiddleware(to => {
  if (shouldRedirectCollectionRoot(to.path)) {
    return navigateTo("/collection/settings", { replace: true });
  }
});
