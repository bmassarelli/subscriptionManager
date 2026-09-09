import { describe, expect, it } from 'vitest';
import { scoreByKeywordOverlap, tokenize } from '../../src/tools/similarity.js';

describe('tokenize', () => {
  it('lowercases and splits on non-alphanumeric characters', () => {
    expect(tokenize('Alta de Servicio-Internet')).toEqual(['alta', 'servicio', 'internet']);
  });

  it('removes Spanish and English stopwords', () => {
    expect(tokenize('la alta de un servicio para el cliente')).toEqual(['alta', 'servicio', 'cliente']);
  });

  it('returns an empty array for a string with only stopwords', () => {
    expect(tokenize('de la el')).toEqual([]);
  });

  it('preserves accented Spanish characters as part of a token', () => {
    expect(tokenize('configuración de red')).toEqual(['configuración', 'red']);
  });

  it('preserves ü as part of a token instead of splitting on it', () => {
    expect(tokenize('bilingüe accion')).toEqual(['bilingüe', 'accion']);
  });

  it('deduplicates repeated tokens so a word does not inflate its own weight', () => {
    expect(tokenize('alta alta de servicio')).toEqual(['alta', 'servicio']);
  });

  it('drops single-character tokens (stray digits/letters) as noise', () => {
    expect(tokenize('flujo 3 x de internet')).toEqual(['flujo', 'internet']);
  });
});

describe('scoreByKeywordOverlap', () => {
  const items = [
    { label: 'Alta de servicio de Internet' },
    { label: 'Alta de servicio POTS' },
    { label: 'Reporte mensual de ventas' },
  ];

  it('scores each item by how many keywords appear in its text, case-insensitively', () => {
    const result = scoreByKeywordOverlap(['alta', 'servicio', 'internet'], items, (i) => i.label);
    expect(result).toEqual([
      { item: items[0], score: 3 },
      { item: items[1], score: 2 },
      { item: items[2], score: 0 },
    ]);
  });

  it('returns score 0 for every item when there are no keywords', () => {
    const result = scoreByKeywordOverlap([], items, (i) => i.label);
    expect(result.every((r) => r.score === 0)).toBe(true);
  });

  it('preserves input order and returns one entry per item, including zero scores', () => {
    const result = scoreByKeywordOverlap(['ventas'], items, (i) => i.label);
    expect(result.map((r) => r.item)).toEqual(items);
    expect(result.map((r) => r.score)).toEqual([0, 0, 1]);
  });
});
