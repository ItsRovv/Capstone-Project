// PhilHealth maternity care package codes and current benefit amounts.
// Reference: PhilHealth maternity case rates (antenatal, delivery, newborn, postpartum).
export const PHILHEALTH_PACKAGES = [
  { code: 'ANV01', label: 'Antenatal Care — 1st Trimester', amount: 1100 },
  { code: 'ANV02', label: 'Antenatal Care — 2nd Trimester', amount: 1500 },
  { code: 'ANV03', label: 'Antenatal Care — 3rd Trimester', amount: 3750 },
  { code: 'NSDBF', label: 'Normal Spontaneous Delivery (Birthing Facility)', amount: 14000 },
  { code: '99460', label: 'Newborn Care Package', amount: 2950 },
  { code: 'PPC01', label: 'Postpartum Care (3 visits)', amount: 1350 },
  { code: 'TDAP1', label: 'Tetanus-Diphtheria-Pertussis Vaccine — 1st Dose', amount: 150 },
  { code: 'TDAP2', label: 'Tetanus-Diphtheria-Pertussis Vaccine — 2nd Dose', amount: 150 }
];

export function findPackage(code) {
  return PHILHEALTH_PACKAGES.find((p) => p.code === code);
}
