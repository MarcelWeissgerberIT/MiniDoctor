// Diagnosis: the patient has one of three diseases. Samples in the blood
// give findings; the pilot must name the disease before treatment.
export const DISEASES = ['stenosis', 'virus', 'dvt'];
export const SAMPLE_TYPES = ['plasma', 'wbc', 'platelet', 'lipid', 'particle'];

// finding keys per sample type and disease (translated in FINDINGS)
export const FINDING = {
  plasma: { stenosis: 'f_troponin', virus: 'f_cytokines', dvt: 'f_ddimer' },
  wbc: { stenosis: 'f_wbc_normal', virus: 'f_lymphocytes', dvt: 'f_wbc_normal' },
  platelet: { stenosis: 'f_plt_active', virus: 'f_plt_normal', dvt: 'f_plt_fibrin' },
  lipid: { stenosis: 'f_ldl_high', virus: 'f_lipid_normal', dvt: 'f_lipid_normal' },
  particle: { stenosis: 'f_crystal', virus: 'f_virions', dvt: 'f_fibrin' },
};

// which findings point to which disease (for the evidence meter)
export const EVIDENCE = {
  f_troponin: 'stenosis',
  f_ldl_high: 'stenosis',
  f_crystal: 'stenosis',
  f_plt_active: 'stenosis',
  f_cytokines: 'virus',
  f_lymphocytes: 'virus',
  f_virions: 'virus',
  f_ddimer: 'dvt',
  f_fibrin: 'dvt',
  f_plt_fibrin: 'dvt',
};

export const TREATMENT = { stenosis: 'stent', virus: 'virus', dvt: 'clot' };

export function findingFor(type, disease) {
  return FINDING[type][disease];
}

export function evidence(findings) {
  const score = { stenosis: 0, virus: 0, dvt: 0 };
  for (const f of findings) if (EVIDENCE[f]) score[EVIDENCE[f]]++;
  return score;
}

export function diagnosisOutcome(chosen, actual, scanned) {
  const correct = chosen === actual;
  const damage = correct ? 0 : 30;
  const quality = correct ? Math.min(1, 0.55 + scanned * 0.09) : 0;
  return { correct, damage, quality };
}
