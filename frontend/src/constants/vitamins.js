// Predefined prenatal vitamins and supplements with clinic prices.
// The doctor selects from this list during consultation; custom vitamins
// can also be added via the "Others" option in the transaction form.
export const VITAMINS = [
  { id: 'ferrous_sulfate', label: 'Ferrous Sulfate 325mg', price: 15 },
  { id: 'folic_acid', label: 'Folic Acid 400mcg', price: 10 },
  { id: 'calcium_carbonate', label: 'Calcium Carbonate 500mg', price: 20 },
  { id: 'vitamin_c', label: 'Vitamin C 500mg', price: 12 },
  { id: 'vitamin_d', label: 'Vitamin D 1000IU', price: 18 },
  { id: 'zinc', label: 'Zinc Sulfate 220mg', price: 14 },
  { id: 'iodine', label: 'Iodine (Potassium Iodide) 250mcg', price: 16 },
  { id: 'multivitamin_prenatal', label: 'Prenatal Multivitamin', price: 35 },
  { id: 'vitamin_b_complex', label: 'Vitamin B Complex', price: 22 },
  { id: 'vitamin_a', label: 'Vitamin A 5000IU', price: 13 }
];

export function findVitamin(id) {
  return VITAMINS.find((v) => v.id === id);
}
