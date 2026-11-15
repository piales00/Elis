export const DOCS = "https://github.com/piales00/firechronos-peru/blob/main/docs";

export const EVIDENCE_DOCS = {
  capture: `${DOCS}/plan-t2.md`,
  emulator: `${DOCS}/traspaso-2026-11-14.md`,
  bayes: `${DOCS}/resultados-bayes.md`,
  underestimation: `${DOCS}/resultados-subestimacion.md`,
  forecast: `${DOCS}/contrato-datos.md`,
  validation: `${DOCS}/traspaso-2026-11-14.md`,
  limits: `${DOCS}/contrato-datos.md`,
};

export const DOC_ONLY = {
  emulatorFixedRatioAuc: 0.62,
  mapbiomasWithinEras: 0.92,
  bayes: {
    period: "2018-04 to 2022-12",
    persistence: 0.396,
    lagMinutes: 50,
    bySize: [
      { key: "small", value: 0.26 },
      { key: "medium", value: 0.44 },
      { key: "large", value: 0.64 },
    ],
    oddsRatio: 4,
  },
  underestimation: {
    bias: -0.112,
    factor: 1.13,
    factorRange: [1.1, 1.18],
    estimatorsTested: 7,
    estimatorsPassed: 0,
  },
};
