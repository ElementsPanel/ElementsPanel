import { getPanelAuthProvider, type AuthUserStore } from "./auth_provider";

/**
 * The user store lives in the "user" panel plugin. Core code that only needs to
 * read or tidy up user records goes through here and degrades to a no-op when
 * the plugin is absent, because an unauthenticated panel has no user records.
 */
export default function userStore(): AuthUserStore | undefined {
  return getPanelAuthProvider()?.users;
}
