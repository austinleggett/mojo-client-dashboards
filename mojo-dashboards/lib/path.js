// Tiny dot-path helpers for reading/writing nested state, e.g.
// "stores.items.2.name". Works for both plain objects and arrays,
// since JS lets you index an array with a numeric string key.

export function getPath(obj, path) {
  return path
    .split(".")
    .reduce((o, k) => (o == null ? o : o[k]), obj);
}

// Immutable set: returns a new top-level object/array with the value
// at `path` replaced. Clones only the objects/arrays along the path.
export function setPath(obj, path, value) {
  const keys = path.split(".");
  return setAt(obj, keys, value);
}

function setAt(obj, keys, value) {
  const [key, ...rest] = keys;
  const isArr = Array.isArray(obj);
  const clone = isArr ? obj.slice() : { ...obj };
  if (rest.length === 0) {
    clone[key] = value;
  } else {
    clone[key] = setAt(obj[key], rest, value);
  }
  return clone;
}

// Push a new item onto the array at `path`, returning a new top-level state.
export function pushAt(obj, path, item) {
  const arr = getPath(obj, path) || [];
  return setPath(obj, path, [...arr, item]);
}

// Remove the item at index `idx` from the array at `path`.
export function removeAt(obj, path, idx) {
  const arr = getPath(obj, path) || [];
  return setPath(obj, path, arr.filter((_, i) => i !== idx));
}
