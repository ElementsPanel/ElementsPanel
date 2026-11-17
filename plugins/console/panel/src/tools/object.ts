/* eslint-disable no-unused-vars */

export function deepTraverseObject<T = any>(
  obj: any,
  filter: (key: string, value: T) => boolean,
  visited = new WeakSet(),
  deep = 0
) {
  if (deep > 5) {
    return obj;
  }
  // Track visited objects to prevent cycles during traversal.
  if (obj && typeof obj === "object") {
    if (visited.has(obj)) {
      return obj;
    }
    visited.add(obj);
  }

  for (const key in obj) {
    if (!filter(key, obj[key])) {
      obj[key] = undefined;
      delete obj[key];
      continue;
    }
    if (obj[key] && typeof obj[key] === "object") {
      deepTraverseObject(obj[key], filter, visited, deep + 1);
    }
  }
  return obj;
}

export function filterEmptyFields<T = any>(obj: T) {
  return deepTraverseObject(obj, (_, value) => {
    if (value === null || value === undefined || value === "") {
      return false;
    }
    return true;
  });
}
