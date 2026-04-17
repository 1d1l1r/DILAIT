from __future__ import annotations

from apps.api.app.ble.adapter import ResolvedBLECharacteristics
from apps.api.app.ble.scanner import classify_scan_result
from apps.api.app.drivers import ELKBledomDriver


def test_classify_scan_result_detects_elk_name_prefix():
    family, reason = classify_scan_result("ELK-BLEDOM", [])
    assert family == "ELK-BLEDOM"
    assert "ELK prefix" in reason


def test_classify_scan_result_detects_elk_service_hint():
    family, reason = classify_scan_result("Unnamed strip", ["0000FFF3-0000-1000-8000-00805F9B34FB"])
    assert family == "ELK-BLEDOM"
    assert "advertised ELK service" in reason


def test_profile_selection_falls_back_to_generic_when_handle_does_not_match():
    driver = ELKBledomDriver()
    resolved = ResolvedBLECharacteristics(
        write_uuid="0000fff3-0000-1000-8000-00805f9b34fb",
        read_uuid="0000fff4-0000-1000-8000-00805f9b34fb",
        write_handle=8,
        service_uuids=["0000fff0-0000-1000-8000-00805f9b34fb"],
        characteristic_uuids=["0000fff3-0000-1000-8000-00805f9b34fb"],
    )

    profile = driver._profile_for_device_name("ELK-BLEDOM", "ELK-BLEDOM", resolved)

    assert profile.key == "elk_bledom_generic"

