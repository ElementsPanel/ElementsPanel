import { core } from "../runtime";

/** Legacy facade used by migrated modules that still read daemon services. */
export const ctx = new Proxy({} as any, {
  get(_target, property) {
    return (core() as any)[property];
  }
});
