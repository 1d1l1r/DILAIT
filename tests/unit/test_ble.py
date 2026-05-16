from __future__ import annotations

import asyncio
import sys
import types

import pytest

from apps.api.app.ble import adapter
from apps.api.app.ble.adapter import ResolvedBLECharacteristics
from apps.api.app.ble.scanner import classify_scan_result
from apps.api.app.drivers import BJLEDDriver, ELKBledomDriver, ZenggeDriver


class FakeCharacteristic:
    uuid = "0000fff3-0000-1000-8000-00805f9b34fb"
    handle = 8
    properties = ["write"]


class FakeReadCharacteristic:
    uuid = "0000fff4-0000-1000-8000-00805f9b34fb"
    handle = 9
    properties = ["notify"]


class FakeService:
    uuid = "0000fff0-0000-1000-8000-00805f9b34fb"
    characteristics = [FakeCharacteristic(), FakeReadCharacteristic()]


class FakeBleakState:
    clients = []
    fail_first_write = False
    fail_direct_connect_once = False
    write_calls = 0
    write_responses = []
    notify_starts = []
    notify_stops = []
    scanner_calls = 0


class FakeBleakScanner:
    @staticmethod
    async def find_device_by_address(identifier: str, timeout: float):
        FakeBleakState.scanner_calls += 1
        return f"scanned:{identifier}"


class FakeBleakClient:
    def __init__(self, target, timeout: float):
        self.target = target
        self.timeout = timeout
        self.services = [FakeService()]
        self.is_connected = False
        self.disconnect_calls = 0
        FakeBleakState.clients.append(self)

    async def connect(self):
        if FakeBleakState.fail_direct_connect_once and str(self.target).startswith("FDE59B07-"):
            FakeBleakState.fail_direct_connect_once = False
            raise RuntimeError("CoreBluetooth cache miss")
        self.is_connected = True

    async def disconnect(self):
        self.disconnect_calls += 1
        self.is_connected = False

    async def start_notify(self, uuid: str, callback):
        FakeBleakState.notify_starts.append(uuid)

    async def stop_notify(self, uuid: str):
        FakeBleakState.notify_stops.append(uuid)

    async def write_gatt_char(self, uuid: str, payload: bytes, response: bool):
        FakeBleakState.write_calls += 1
        FakeBleakState.write_responses.append(response)
        if FakeBleakState.fail_first_write and FakeBleakState.write_calls == 1:
            raise RuntimeError("stale CoreBluetooth session")


@pytest.fixture
def fake_bleak(monkeypatch):
    FakeBleakState.clients = []
    FakeBleakState.fail_first_write = False
    FakeBleakState.fail_direct_connect_once = False
    FakeBleakState.write_calls = 0
    FakeBleakState.write_responses = []
    FakeBleakState.notify_starts = []
    FakeBleakState.notify_stops = []
    FakeBleakState.scanner_calls = 0
    bleak_module = types.SimpleNamespace(BleakClient=FakeBleakClient, BleakScanner=FakeBleakScanner)
    monkeypatch.setitem(sys.modules, "bleak", bleak_module)
    monkeypatch.setattr(adapter.asyncio, "sleep", _instant_sleep)
    return FakeBleakState


async def _instant_sleep(delay: float):
    return None


def test_classify_scan_result_detects_elk_name_prefix():
    family, reason = classify_scan_result("ELK-BLEDOM", [])
    assert family == "ELK-BLEDOM"
    assert "ELK prefix" in reason


def test_classify_scan_result_detects_elk_service_hint():
    family, reason = classify_scan_result("Unnamed strip", ["0000FFF3-0000-1000-8000-00805F9B34FB"])
    assert family == "ELK-BLEDOM"
    assert "advertised ELK service" in reason


def test_classify_scan_result_detects_zengge_name_prefix():
    family, reason = classify_scan_result("LEDnetWF02003348BC6C", [])
    assert family == "ZENGGE"
    assert "ZENGGE hint" in reason


def test_classify_scan_result_detects_zengge_manufacturer_signature():
    family, reason = classify_scan_result(
        "Unknown BLE Device",
        [],
        {"0x5a02": "5405e498bb48bc6c0033200a01102361230100ffff000a00f00000"},
    )
    assert family == "ZENGGE"
    assert "product_id=0x33" in reason


def test_classify_scan_result_detects_bj_led_name_prefix():
    family, reason = classify_scan_result("BJ_LED", ["0000180F-0000-1000-8000-00805F9B34FB"])
    assert family == "BJ_LED"
    assert "BJ_LED hint" in reason


def test_profile_selection_falls_back_to_generic_when_handle_does_not_match():
    driver = ELKBledomDriver()
    resolved = ResolvedBLECharacteristics(
        write_uuid="0000fff3-0000-1000-8000-00805f9b34fb",
        read_uuid="0000fff4-0000-1000-8000-00805f9b34fb",
        write_handle=8,
        read_handle=9,
        write_properties=["write"],
        read_properties=["notify"],
        write_response=True,
        service_uuids=["0000fff0-0000-1000-8000-00805f9b34fb"],
        characteristic_uuids=["0000fff3-0000-1000-8000-00805f9b34fb"],
    )

    profile = driver._profile_for_device_name("ELK-BLEDOM", "ELK-BLEDOM", resolved)

    assert profile.key == "elk_bledom_generic"


def test_zengge_profile_selection_picks_verified_lednetwf_controller():
    driver = ZenggeDriver()

    profile = driver._pick_profile(
        name="LEDnetWF02003348BC6C",
        metadata={"product_id": 0x33, "ble_version": 5},
    )

    assert profile is not None
    assert profile.key == "zengge_lednetwf_0x33_v5"


def test_zengge_profile_selection_picks_iotbt_controller():
    driver = ZenggeDriver()

    profile = driver._pick_profile(
        name="IOTBTF53",
        metadata={"product_id": 0x6400, "ble_version": 0x23},
    )

    assert profile is not None
    assert profile.key == "zengge_iotbt_0x6400_v35"


def test_zengge_commands_match_verified_packets():
    driver = ZenggeDriver()

    assert driver._build_power_command(True).hex(" ") == "00 01 80 00 00 0d 0e 0b 3b 23 00 00 00 00 00 00 00 32 00 00 90"
    assert driver._build_color_command(255, 0, 0).hex(" ") == "00 02 80 00 00 09 0a 0b 31 ff 00 00 00 00 f0 0f 2f"
    assert driver._build_brightness_command(30).hex(" ") == "00 03 80 00 00 0d 0e 0b 3b 01 00 00 1e 00 1e 00 00 00 00 00 78"


def test_bj_led_profile_selection_picks_validated_name():
    driver = BJLEDDriver()

    profile = driver._pick_profile(
        name="BJ_LED",
        metadata={},
    )

    assert profile is not None
    assert profile.key == "bj_led_mohuan_v1"


def test_bj_led_commands_match_verified_packets():
    driver = BJLEDDriver()

    assert driver._build_power_command(True).hex(" ") == "69 96 06 01 01"
    assert driver._build_power_command(False).hex(" ") == "69 96 02 01 00"
    assert driver._build_color_command(255, 0, 0, 100).hex(" ") == "69 96 05 02 ff 00 00 ff"
    assert driver._build_color_command(255, 0, 0, 30).hex(" ") == "69 96 05 02 4c 00 00 4c"


def test_ble_adapter_retries_with_clean_reconnect_on_macos(monkeypatch, fake_bleak):
    monkeypatch.setattr(adapter.platform, "system", lambda: "Darwin")
    fake_bleak.fail_first_write = True

    resolved = asyncio.run(async_write_command())

    assert resolved.write_uuid == FakeCharacteristic.uuid
    assert resolved.write_response is True
    assert fake_bleak.write_calls == 2
    assert fake_bleak.write_responses == [True, True]
    assert fake_bleak.notify_starts == [FakeReadCharacteristic.handle, FakeReadCharacteristic.handle]
    assert fake_bleak.notify_stops == [FakeReadCharacteristic.handle, FakeReadCharacteristic.handle]
    assert len(fake_bleak.clients) == 2
    assert [client.disconnect_calls for client in fake_bleak.clients] == [1, 1]


def test_ble_adapter_enables_notifications_before_write_when_read_uuid_notifies(monkeypatch, fake_bleak):
    monkeypatch.setattr(adapter.platform, "system", lambda: "Darwin")

    resolved = asyncio.run(async_write_command(preferred_read_uuids=(FakeReadCharacteristic.uuid,)))

    assert resolved.read_uuid == FakeReadCharacteristic.uuid
    assert resolved.read_properties == ["notify"]
    assert fake_bleak.notify_starts == [FakeReadCharacteristic.handle]
    assert fake_bleak.notify_stops == [FakeReadCharacteristic.handle]


def test_ble_adapter_skips_discovery_for_corebluetooth_uuid_on_macos(monkeypatch, fake_bleak):
    monkeypatch.setattr(adapter.platform, "system", lambda: "Darwin")

    asyncio.run(
        adapter.BleakBLEAdapter().write_command(
            identifier="FDE59B07-F422-9B78-3326-023A9325215F",
            payload=b"\x69\x96\x02\x01\x01",
            preferred_write_uuids=(FakeCharacteristic.uuid,),
        )
    )

    assert fake_bleak.write_calls == 1
    assert fake_bleak.scanner_calls == 0


def test_ble_adapter_scans_once_when_corebluetooth_direct_connect_misses(monkeypatch, fake_bleak):
    monkeypatch.setattr(adapter.platform, "system", lambda: "Darwin")
    fake_bleak.fail_direct_connect_once = True

    asyncio.run(
        adapter.BleakBLEAdapter().write_command(
            identifier="FDE59B07-F422-9B78-3326-023A9325215F",
            payload=b"\x69\x96\x02\x01\x01",
            preferred_write_uuids=(FakeCharacteristic.uuid,),
        )
    )

    assert fake_bleak.write_calls == 1
    assert fake_bleak.scanner_calls == 1
    assert [client.target for client in fake_bleak.clients] == [
        "FDE59B07-F422-9B78-3326-023A9325215F",
        "scanned:FDE59B07-F422-9B78-3326-023A9325215F",
    ]


def test_ble_adapter_raises_when_write_keeps_failing(monkeypatch, fake_bleak):
    monkeypatch.setattr(adapter.platform, "system", lambda: "Linux")

    async def always_fail(self, uuid: str, payload: bytes, response: bool):
        raise RuntimeError("write not permitted")

    monkeypatch.setattr(FakeBleakClient, "write_gatt_char", always_fail)

    with pytest.raises(adapter.BLEAdapterError, match="write not permitted"):
        asyncio.run(async_write_command())

    assert len(fake_bleak.clients) == 1
    assert fake_bleak.clients[0].disconnect_calls == 1


async def async_write_command(preferred_read_uuids: tuple[str, ...] = ()) -> ResolvedBLECharacteristics:
    return await adapter.BleakBLEAdapter().write_command(
        identifier="AA:BB:CC:DD:EE:FF",
        payload=b"\x7e\x00\x04\xf0\x00\x01\xff\x00\xef",
        preferred_write_uuids=(FakeCharacteristic.uuid,),
        preferred_read_uuids=preferred_read_uuids,
    )
