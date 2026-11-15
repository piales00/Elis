import json
from pathlib import Path

from api.chat import _build_decision_suggestions
from api.chat_tools import DECISION_PROFILES
from scripts.check_chat_presets import build


def test_saved_answers_match_processed_sources():
    path = Path(__file__).resolve().parents[1] / 'web/src/data/chat-presets.json'
    assert json.loads(path.read_text(encoding='utf-8')) == build()


def test_followup_chips_explore_sensors_and_continuity():
    suggestions = _build_decision_suggestions([{'content': 'Hello'}], [], 'peru', 'en')
    assert {s['id'] for s in suggestions} == {'ChipForecast2027', 'ChipContinuity', 'ChipSensorComparison'}
    assert all('Action Plan' not in s['label'] and 'Pasture' not in s['label'] for s in suggestions)
    assert all('fire_regime' not in profile and 'intervention_matrix' not in profile for profile in DECISION_PROFILES.values())
