import sys
from pathlib import Path

import pytest
jax = pytest.importorskip("jax")
import jax.numpy as jnp
import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts" / "experimental"))

import underestimation as u
import underestimation_sim as us

PARAMS = dict(mu=1.2, sigma=0.9, delta_a=0.5, tau_a=0.6, tau_s=0.4, a_a=-4.0, b_a=1.5, pmax_a=0.9,
              a_s=-1.5, b_s=2.5, pmax_s=0.88, t0=90.0, kappa=0.6)


@pytest.fixture(scope="module")
def overpass():
    return us.default_overpass(np.random.default_rng(1))


def test_persistence_patterns_are_consistent():
    gap = jnp.array([-90.0, -30.0, -5.0, 0.1, 10.0, 49.0, 51.0, 120.0])
    life = jnp.array([20.0, 80.0, 400.0])
    w = u._patterns(gap, life)
    active = sum(v for k, v in w.items() if k[0] == 1)
    births_a = sum(v for k, v in w.items() if k[0] == 0 and k[1] == 1)
    births_n = sum(v for k, v in w.items() if k[0] == 0 and k[2] == 1)
    assert np.allclose(active, 1.0)
    assert np.allclose(births_a, 1 - np.exp(-np.abs(gap)[:, None] / life[None, :]))
    assert np.allclose(births_n, 1 - np.exp(-u.NOAA20_LAG / life[None, :]))
    assert min(float(v.min()) for v in w.values()) >= 0


def test_simulator_matches_expected_facts(overpass):
    rng = np.random.default_rng(2)
    frame, truth = us.simulate(PARAMS, rng, overpass, active=150_000, days=1500)
    observed = u.facts(frame)
    expected = us.expected_facts(PARAMS, us.fit_sample(rng, overpass, 150_000), targets=observed)
    for key in ("coincidence_s_given_a_0-20", "coincidence_s_given_a_20-40", "a_given_s_sim", "n_a_over_n_s_sim",
                "a_given_s_frp_s_class1", "s_given_a_frp_a_class2", "persistence_n_given_s_class0",
                "persistence_n_given_s_class2", "doubles_log_frp_diff_mean"):
        assert observed[key] == pytest.approx(expected[key], abs=0.02), key
    main = u.chapman(*u.counts(frame[u.simultaneous(frame["gap"].to_numpy())]))
    assert truth["N_sim"] / main == pytest.approx(expected["true_factor_sim"], rel=0.04)


def test_births_keep_aqua_count_stationary(overpass):
    rng = np.random.default_rng(3)
    frame, _ = us.simulate(PARAMS, rng, overpass, active=150_000, days=1500)
    days = frame.groupby("day").agg(a=("a", "sum"), s=("s", "sum"), gap=("gap", "first"))
    near, far = days[days.gap.abs() < 20], days[days.gap.abs() > 60]
    assert near.a.sum() / near.s.sum() == pytest.approx(far.a.sum() / far.s.sum(), rel=0.06)


def test_chapman_is_unbiased_without_heterogeneity_or_flicker(overpass):
    rng = np.random.default_rng(4)
    params = dict(PARAMS, sigma=0.02, tau_a=0.02, tau_s=0.02, t0=1e9)
    frame, truth = us.simulate(params, rng, overpass, active=100_000, days=1000)
    result = u.main_estimate(frame, rng, draws=50)
    assert result["N"] / truth["N_sim"] == pytest.approx(1, abs=0.03)


def test_main_underestimates_with_heterogeneity(overpass):
    rng = np.random.default_rng(5)
    frame, truth = us.simulate(dict(PARAMS, t0=1e9), rng, overpass, active=100_000, days=1000)
    assert u.main_estimate(frame, rng, draws=20)["N"] / truth["N_sim"] < 0.92


def test_latent_intensity_recovers_its_own_model(overpass):
    rng = np.random.default_rng(6)
    frame, truth = us.simulate(dict(PARAMS, t0=1e9), rng, overpass, active=50_000, days=500)
    result = u.latent_two_list(frame, interval=False)
    assert result["N"] / truth["N_sim"] == pytest.approx(1, abs=0.06)


def test_detection_persistence_recovers_flickering_population(overpass):
    rng = np.random.default_rng(10)
    frame, truth = us.simulate(PARAMS, rng, overpass, active=12_000, days=150)
    result = u.latent_persistence(frame, interval=False)
    assert result["N"] / truth["N_all"] == pytest.approx(1, abs=0.08)


def test_huggins_and_latent_class_run(overpass):
    rng = np.random.default_rng(7)
    frame, truth = us.simulate(PARAMS, rng, overpass, active=40_000, days=500)
    result = u.huggins_imputed(frame, rng, draws=10)
    assert result["low"] <= result["N"] <= result["high"]
    assert 0.5 < result["N"] / truth["N_sim"] < 1.5
    result = u.latent_class(frame, rng, draws=3)
    assert not np.isfinite(result["N"]) or result["N"] > 0


def test_latent_class_recovers_two_class_population():
    rng = np.random.default_rng(8)
    n = 200_000
    big = rng.random(n) < 0.4
    pa, ps = np.where(big, 0.5, 0.05), np.where(big, 0.9, 0.5)
    a, s, nn = (rng.random(n) < pa), (rng.random(n) < ps), (rng.random(n) < ps)
    seen = a | s | nn
    frame = pd.DataFrame(dict(a=a[seen].astype(int), s=s[seen].astype(int), n=nn[seen].astype(int),
                              gap=np.zeros(seen.sum())))
    estimate, _ = u._latent_class_fit(u._history_counts(frame), rng)
    assert estimate / n == pytest.approx(1, abs=0.03)


def test_calibration_reduces_loss(overpass):
    rng = np.random.default_rng(9)
    frame, _ = us.simulate(PARAMS, rng, overpass, active=80_000, days=800)
    observed = u.facts(frame)
    sample = us.fit_sample(rng, overpass, 20_000)
    start = dict(PARAMS, a_s=-1.0, t0=60.0)
    before = us.loss(start, sample, observed)
    fit = us.calibrate(observed, sample, fixed={k: v for k, v in PARAMS.items() if k not in ("a_s", "t0")},
                       start=start)
    assert fit["loss"] < before
    assert fit["params"]["t0"] == pytest.approx(PARAMS["t0"], rel=0.25)


def test_calibration_bounds_exclude_degenerate_detection_curve():
    free = list(us.PARAMS)
    bounds = us.vector_bounds(free)
    extreme = dict(PARAMS, a_s=-14025.0, b_s=19909.0)
    clipped = np.clip(us.to_vector(extreme, free), bounds[:, 0], bounds[:, 1])
    restored = us.from_vector(clipped, free, {})
    assert restored["a_s"] == u.config.UNDER_SIM_BOUNDS["a_s"][0]
    assert restored["b_s"] == pytest.approx(u.config.UNDER_SIM_BOUNDS["b_s"][1])
    assert np.all(np.isfinite(bounds))


def test_simulated_calendar_has_each_month_in_each_year(overpass):
    frame, _ = us.simulate(PARAMS, np.random.default_rng(u.config.SEED), overpass, active=12_000)
    assert (frame.groupby("year").month.nunique() == 12).all()


def test_exam_counts_invalid_intervals_as_noncoverage():
    reps = [dict(results={"candidate": dict(N=100., target=100., low=90., high=110.)}),
            dict(results={"candidate": dict(N=100., target=100., low=0., high=np.inf)}),
            dict(results={"candidate": dict(error="failed")})]
    row = us.summarize(reps)["candidate"]
    assert row["coverage"] == pytest.approx(1 / 3)
    assert row["failures"] == 2


def test_no_real_factor_when_nobody_passes(tmp_path, monkeypatch):
    exam = tmp_path / "underestimation_exam.json"
    factor = tmp_path / "underestimation_factor.json"
    exam.write_text('{"verdict": {"A1_huggins_imputed": {"passes": false}}}')
    monkeypatch.setattr(u, "EXAM_PATH", exam)
    monkeypatch.setattr(u, "FACTOR_PATH", factor)
    monkeypatch.setattr(u, "_connect", lambda: pytest.fail("Real data must not be fitted after failure"))
    u.main()
    import json
    result = json.loads(factor.read_text())
    assert result["rows"] == []
    assert result["status"] == "no_estimator_passed"


def test_main_month_strata_preserve_projection_identity(overpass):
    rng = np.random.default_rng(u.config.SEED)
    frame, _ = us.simulate(PARAMS, rng, overpass, active=12_000)
    frame["month"] = 1
    result = u.main_estimate(frame, rng, draws=10)
    pooled = u.pooled_estimate(frame, np.random.default_rng(u.config.SEED), draws=10)
    assert result["N"] == pytest.approx(pooled["N"])
    assert result["N_all"] == pytest.approx(pooled["N_all"])


def test_exam_requires_every_scenario_even_if_calibration_fit_is_poor(monkeypatch):
    monkeypatch.setattr(u, "ESTIMATORS", {"candidate": None})
    monkeypatch.setattr(us, "REPLICATES", 2)
    output = dict(scenarios={"good": dict(reasonable=True), "stress": dict(reasonable=False)}, rules={})
    reps = [dict(scenario=name, results={"candidate": dict(N=100., target=100., low=lo, high=120.)})
            for name, lo in (("good", 80.), ("stress", 110.)) for _ in range(2)]
    result = us.finalize_exam(output, reps)
    assert not result["verdict"]["candidate"]["passes"]
    assert not result["verdict"]["main_all_days"]["passes"]
