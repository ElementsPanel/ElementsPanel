import { core } from "../runtime";

/** Legacy facade used by migrated modules that still read daemon services. */
export const ctx = new Proxy({} as any, {
  get(_target, property) {
    // Dynamic service lookups are intentionally late-bound. Using `get()` here
    // avoids Cordis treating optional or plugin-provided services as undeclared
    // property access while preserving the same context-backed value.
    return core().get(String(property));
  }
});
