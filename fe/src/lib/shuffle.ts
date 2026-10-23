// Unbiased Fisher-Yates shuffle. The codebase used `[...items].sort(() => Math.random() - 0.5)`
// in many places (notes.md 3.C.16) — that's biased (the comparator isn't a consistent
// ordering, so some permutations are far more likely than others) and can even throw in
// some engines. This returns a new array; it never mutates the input.
export function shuffleArray<T>(items: T[]): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
