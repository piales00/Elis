from datetime import date
from math import inf
from pathlib import Path


COUNTRY = "Peru"
RAW_DIR = Path(__file__).resolve().parents[1] / "data" / "raw"
INTERIM_DIR = RAW_DIR.parent / "interim"
PROCESSED_DIR = RAW_DIR.parent / "processed"
GRID_DEG = 0.1
FIRE_TYPE = 0
MODIS_MIN_CONFIDENCE = 30
VIIRS_CONFIDENCE = ("n", "h")
CALIBRATION_YEARS = (2013, 2020)
TEST_YEARS = (2021, 2024)
HISTORY_YEARS = (2003, 2025)
FIRST_YEAR, LAST_YEAR = 2000, 2026
AQUA_START = date(2002, 7, 4)
VIIRS_START = date(2012, 1, 20)
REGIONS = ("amazonia", "sierra", "costa")
NATIONAL = "peru"
MIN_RECAPTURES = 5
CI_LEVEL = 0.90
BOOTSTRAP_N = 500
SEED = 42
ANOMALY_PERCENTILES = (25, 75, 90)
FRP_CLASSES = (0, 5, 20, inf)
EMULATOR_PARAMS = {
    "max_iter": 300,
    "learning_rate": 0.05,
    "max_leaf_nodes": 31,
    "early_stopping": True,
    "validation_fraction": 0.10,
    "random_state": SEED,
}
OUTAGES = {
    "aqua": [(date(2022, 4, 1), date(2022, 4, 16))],
    "snpp": [
        (date(2022, 7, 27), date(2022, 8, 10)),
        (date(2024, 5, 30), date(2024, 6, 3)),
        (date(2024, 7, 10), date(2024, 7, 15)),
    ],
    "terra": [],
}
DEGRADED = {"aqua": [(date(2020, 8, 16), date(2020, 9, 2))]}
TEST_SPLIT_DRIFT = ((2021, 2022), (2023, 2024))
TEST_MAX_REL_BIAS = 0.05
TEST_MIN_COVERAGE = 0.85
TEST_REPLICATES = 1000
EMULATOR_PERMUTATION_SAMPLE = 20000
EMULATOR_PERMUTATION_REPEATS = 5
RELIABILITY_BINS = 10
N_JOBS = 4
EMULATOR_LOGIT_PARAMS = {"C": 1.0, "solver": "lbfgs", "max_iter": 2000, "tol": 1e-4}
EMULATOR_CALIBRATION = {"method": "isotonic", "cv": 3, "max_ece": 0.02}
EMULATOR_CALIBRATION_YEARS = (2019, 2020)
SIMULTANEOUS_MAX_MINUTES = 20
DRIFT_START_YEAR = 2023
TERRA_BRIDGE_YEARS = (2003, 2011)
TERRA_BACKCAST_TEST_YEARS = (2003, 2006)
TERRA_BACKCAST_TRAIN_YEARS = (2007, 2011)
