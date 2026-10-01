/** Short unique id: millisecond timestamp plus a random suffix. */
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
