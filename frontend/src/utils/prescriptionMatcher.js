import { VITAMINS } from '../constants/vitamins';

// Keywords mapped to vitamin IDs for fuzzy matching.
// Each vitamin can have multiple keywords/aliases a doctor might write.
const KEYWORD_MAP = {
  ferrous_sulfate: ['ferrous', 'feso4', 'iron', 'ferrous sulfate', 'ferrous sulphate'],
  folic_acid: ['folic', 'folate', 'folvite', 'folic acid'],
  calcium_carbonate: ['calcium', 'caltrate', 'calcium carbonate', 'ca carbonate'],
  vitamin_c: ['vitamin c', 'ascorbic', 'ascorbic acid', 'vit c'],
  vitamin_d: ['vitamin d', 'cholecalciferol', 'vit d', 'vitamin d3'],
  zinc: ['zinc', 'zinc sulfate', 'zinc sulphate', 'zn'],
  iodine: ['iodine', 'potassium iodide', 'ki', 'iodide'],
  multivitamin_prenatal: ['prenatal', 'multivitamin', 'prenatal multivitamin', 'maternal', 'prenate'],
  vitamin_b_complex: ['b complex', 'b-complex', 'vitamin b', 'b-complex', 'bcomplex', 'neurobion'],
  vitamin_a: ['vitamin a', 'retinol', 'vit a']
};

/**
 * Parse a prescription string and match each line against the vitamins catalog.
 * Returns an array of matched vitamins with id, label, and price.
 *
 * @param {string} prescriptionText - The doctor's prescription (multi-line)
 * @returns {Array<{id: string, label: string, price: number, custom: boolean}>}
 */
export function matchPrescriptionToVitamins(prescriptionText) {
  if (!prescriptionText || typeof prescriptionText !== 'string') return [];

  const lines = prescriptionText.split('\n').map((l) => l.trim()).filter(Boolean);
  const matched = [];
  const matchedIds = new Set();

  for (const line of lines) {
    // Remove leading numbering like "1. " or "1) " or "Rx:"
    const cleaned = line.replace(/^(\d+[.)]\s*|rx[:\s]*|[-•*]\s*)/i, '').trim().toLowerCase();

    for (const [vitaminId, keywords] of Object.entries(KEYWORD_MAP)) {
      if (matchedIds.has(vitaminId)) continue; // avoid duplicates
      const found = keywords.some((kw) => cleaned.includes(kw));
      if (found) {
        const vitamin = VITAMINS.find((v) => v.id === vitaminId);
        if (vitamin) {
          matched.push({ id: vitamin.id, label: vitamin.label, price: vitamin.price, custom: false });
          matchedIds.add(vitaminId);
        }
        break; // move to next line once matched
      }
    }
  }

  return matched;
}

/**
 * Calculate the total price of matched vitamins.
 * @param {Array<{price: number}>} vitamins
 * @returns {number}
 */
export function calculateVitaminsTotal(vitamins) {
  return vitamins.reduce((sum, v) => sum + Number(v.price || 0), 0);
}
