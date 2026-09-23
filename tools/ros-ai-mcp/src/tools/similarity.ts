const STOPWORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'para', 'con', 'en', 'un', 'una', 'y', 'o', 'del', 'al', 'que', 'se',
  'the', 'a', 'an', 'of', 'for', 'to', 'and', 'or', 'in', 'on', 'is', 'are', 'be',
]);

export function tokenize(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9áéíóúñü]+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
  return [...new Set(tokens)];
}

export interface ScoredItem<T> {
  item: T;
  score: number;
}

export function scoreByKeywordOverlap<T>(
  keywords: string[],
  items: T[],
  getText: (item: T) => string
): ScoredItem<T>[] {
  return items.map((item) => {
    const haystack = getText(item).toLowerCase();
    const score = keywords.reduce((count, keyword) => (haystack.includes(keyword) ? count + 1 : count), 0);
    return { item, score };
  });
}
