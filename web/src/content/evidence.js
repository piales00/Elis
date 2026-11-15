export const METHODS = "https://github.com/piales00/firechronos-peru/blob/main/docs/methods";
export const REPORT_PDF = "/firechronos-technical-report.pdf";

export const EVIDENCE_DOCS = {
  index: `${METHODS}/README.md`,
  capture: `${METHODS}/01-harmonization.md`,
  emulator: `${METHODS}/02-modis-emulator.md`,
  bayes: `${METHODS}/03-bayesian-three-satellites.md`,
  underestimation: `${METHODS}/04-underestimation.md`,
  forecast: `${METHODS}/05-seasonal-forecast.md`,
  validation: `${METHODS}/06-validation.md`,
  continuity: `${METHODS}/07-continuity-and-live.md`,
  limits: `${METHODS}/README.md`,
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
