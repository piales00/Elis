import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts" / "experimental"))

import three_lists as tl


H8 = np.array([(0, 0, 0), *tl.HISTORIES], dtype=float)
PAIR8 = np.column_stack([H8[:, i] * H8[:, j] for i, j in tl.PAIRS])


def simulate(n, a, b, rng):
    eta = H8 @ np.asarray(a) + PAIR8 @ np.asarray(b)
    p = np.exp(eta) / np.exp(eta).sum()
    return rng.multinomial(n, p)[1:]


@pytest.mark.parametrize("b", [(0.0, 0.0, 0.0), (0.8, 0.4, -0.3)])
def test_pairwise_recovers_n(b):
    rng = np.random.default_rng(42)
    n = 200000
    estimates = [tl.fit_mle(simulate(n, (-1.5, 0.5, 0.4), b, rng), True)["N"] for _ in range(20)]
    assert abs(np.mean(estimates) / n - 1) < 0.02


def test_independence_recovers_n_only_without_dependence():
    rng = np.random.default_rng(42)
    n = 200000
    independent = tl.fit_mle(simulate(n, (-1.5, 0.5, 0.4), (0, 0, 0), rng), False)["N"]
    dependent = tl.fit_mle(simulate(n, (-0.5, -1.0, -1.0), (0.8, 0.8, 0.8), rng), False)["N"]
    assert abs(independent / n - 1) < 0.01
    assert dependent / n - 1 < -0.05


def test_closed_form_matches_numerical_fit():
    x = np.array([300, 4000, 4200, 350, 340, 2300, 900], dtype=float)
    assert tl.fit_mle(x, True)["unseen"] == pytest.approx(tl.saturated_unseen(x), rel=1e-4)


def test_saturated_interactions_recover_truth():
    rng = np.random.default_rng(42)
    b = np.array([0.8, 0.4, -0.3])
    x = simulate(5_000_000, (-1.5, 0.5, 0.4), b, rng)
    assert tl.saturated_interactions(x) == pytest.approx(b, abs=0.05)


def test_chapman_matches_two_list_independence():
    rng = np.random.default_rng(42)
    x = simulate(500000, (-1.0, 0.8, 0.2), (0, 0, 0), rng)
    marg = tl.marginals(x)
    estimate = tl.chapman(marg["aqua"], marg["snpp"], tl.pair_overlap(x, 0, 1))
    assert estimate / 500000 == pytest.approx(1, abs=0.02)
