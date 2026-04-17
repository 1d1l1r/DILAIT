from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Protocol

from apps.api.app.ble.adapter import BLEAdapterError, BleakBLEAdapter, ResolvedBLECharacteristics
from apps.api.app.ble.scanner import BLEScanResult, BleakDiscoveryScanner
from apps.api.app.models import Device, DeviceFamily

LOGGER = logging.getLogger(__name__)

ELK_BLEDOM_WRITE_UUID = "0000fff3-0000-1000-8000-00805f9b34fb"
ELK_BLEDOM_READ_UUID = "0000fff4-0000-1000-8000-00805f9b34fb"


@dataclass(slots=True)
class DriverCandidate:
    family: str
    name: str
    ble_identifier: str
    address: str | None = None
    vendor_name: str | None = None
    rssi: int | None = None
    source: str = "mock"
    is_supported: bool = True
    classification_reason: str | None = None
    advertised_services: list[str] = field(default_factory=list)
    manufacturer_data: dict[str, str] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ProbeResult:
    family: str
    capabilities: dict[str, bool]
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class ELKBledomProfile:
    key: str
    family: str
    match_prefixes: tuple[str, ...]
    preferred_write_uuids: tuple[str, ...]
    preferred_read_uuids: tuple[str, ...]
    preferred_write_handle: int | None
    turn_on_template: tuple[int, ...]
    turn_off_template: tuple[int, ...]
    brightness_template: tuple[int | str, ...]
    color_template: tuple[int | str, ...]


ELK_BLEDOM_CAPABILITIES = {
    "power": True,
    "brightness": True,
    "rgb": True,
    "white_channel": False,
    "effects": False,
    "readback_state": False,
}

ELK_BLEDOM_PROFILES = (
    ELKBledomProfile(
        key="elk_bledom_handle13",
        family=DeviceFamily.ELK_BLEDOM.value,
        match_prefixes=("elk-bledom",),
        preferred_write_uuids=(ELK_BLEDOM_WRITE_UUID,),
        preferred_read_uuids=(ELK_BLEDOM_READ_UUID,),
        preferred_write_handle=13,
        turn_on_template=(126, 4, 4, 240, 0, 1, 255, 0, 239),
        turn_off_template=(126, 4, 4, 0, 0, 0, 255, 0, 239),
        brightness_template=(126, 4, 1, "i", 1, 255, 2, 1, 239),
        color_template=(126, 7, 5, 3, "r", "g", "b", 10, 239),
    ),
    ELKBledomProfile(
        key="elk_bledom_generic",
        family=DeviceFamily.ELK_BLEDOM.value,
        match_prefixes=("elk-bledom", "elk-ble", "elk-btc", "elk-bulb", "elk-lampl"),
        preferred_write_uuids=(ELK_BLEDOM_WRITE_UUID,),
        preferred_read_uuids=(ELK_BLEDOM_READ_UUID,),
        preferred_write_handle=None,
        turn_on_template=(126, 0, 4, 240, 0, 1, 255, 0, 239),
        turn_off_template=(126, 0, 4, 0, 0, 0, 255, 0, 239),
        brightness_template=(126, 0, 1, "i", 0, 0, 0, 0, 239),
        color_template=(126, 0, 5, 3, "r", "g", "b", 0, 239),
    ),
    ELKBledomProfile(
        key="duoco_fallback",
        family=DeviceFamily.DUOCO_STRIP.value,
        match_prefixes=("duoco",),
        preferred_write_uuids=(ELK_BLEDOM_WRITE_UUID,),
        preferred_read_uuids=(ELK_BLEDOM_READ_UUID,),
        preferred_write_handle=None,
        turn_on_template=(126, 0, 4, 240, 0, 1, 255, 0, 239),
        turn_off_template=(126, 0, 4, 0, 0, 0, 255, 0, 239),
        brightness_template=(126, 0, 1, "i", 0, 0, 0, 0, 239),
        color_template=(126, 0, 5, 3, "r", "g", "b", 0, 239),
    ),
)

ELK_PROFILE_INDEX = {profile.key: profile for profile in ELK_BLEDOM_PROFILES}


class LightDriver(Protocol):
    family: str

    async def discover_candidates(self) -> list[DriverCandidate]: ...
    async def probe(self, ble_identifier: str, name: str | None = None) -> ProbeResult: ...
    async def turn_on(self, device: Device) -> None: ...
    async def turn_off(self, device: Device) -> None: ...
    async def set_brightness(self, device: Device, value: int) -> None: ...
    async def set_rgb(self, device: Device, r: int, g: int, b: int) -> None: ...
    async def get_capabilities(self, device: Device | None = None) -> dict[str, bool]: ...


class MockLightDriver:
    family = DeviceFamily.MOCK.value

    async def discover_candidates(self) -> list[DriverCandidate]:
        return [
            DriverCandidate(
                family=self.family,
                name="Mock Strip Alpha",
                ble_identifier="mock://strip-alpha",
                vendor_name="MockVendor",
                rssi=-41,
                source="mock",
                advertised_services=["mock-power", "mock-rgb"],
                metadata={"simulated": True},
            ),
            DriverCandidate(
                family=DeviceFamily.ELK_BLEDOM.value,
                name="ELK-BLEDOM Simulator",
                ble_identifier="mock://elk-bledom",
                vendor_name="ELK",
                rssi=-55,
                source="mock",
                classification_reason="simulated ELK-BLEDOM candidate",
                advertised_services=["0000fff3-0000-1000-8000-00805f9b34fb"],
                metadata={"simulated": True, "driver_profile": "elk_bledom_generic"},
            ),
        ]

    async def probe(self, ble_identifier: str, name: str | None = None) -> ProbeResult:
        family = DeviceFamily.MOCK.value if ble_identifier.startswith("mock://strip") else DeviceFamily.ELK_BLEDOM.value
        return ProbeResult(family=family, capabilities=await self.get_capabilities(), metadata={"simulated": True})

    async def turn_on(self, device: Device) -> None:
        return None

    async def turn_off(self, device: Device) -> None:
        return None

    async def set_brightness(self, device: Device, value: int) -> None:
        return None

    async def set_rgb(self, device: Device, r: int, g: int, b: int) -> None:
        return None

    async def get_capabilities(self, device: Device | None = None) -> dict[str, bool]:
        return ELK_BLEDOM_CAPABILITIES.copy()


class ELKBledomDriver:
    family = DeviceFamily.ELK_BLEDOM.value

    def __init__(self) -> None:
        self._scanner = BleakDiscoveryScanner()
        self._adapter = BleakBLEAdapter()

    async def discover_candidates(self) -> list[DriverCandidate]:
        results = await self._scanner.scan()
        return [self._scan_result_to_candidate(item) for item in results]

    async def probe(self, ble_identifier: str, name: str | None = None) -> ProbeResult:
        profile = self._pick_profile(name=name, family_hint=self.family)
        resolved = await self._adapter.inspect_characteristics(
            identifier=ble_identifier,
            preferred_write_uuids=profile.preferred_write_uuids,
            preferred_read_uuids=profile.preferred_read_uuids,
            preferred_write_handle=profile.preferred_write_handle,
        )
        selected_profile = self._profile_for_device_name(name=name, family_hint=profile.family, resolved=resolved)
        return ProbeResult(
            family=selected_profile.family,
            capabilities=ELK_BLEDOM_CAPABILITIES.copy(),
            metadata=self._resolved_metadata(selected_profile, resolved),
        )

    async def turn_on(self, device: Device) -> None:
        await self._write_for_device(device, command_kind="turn_on")

    async def turn_off(self, device: Device) -> None:
        await self._write_for_device(device, command_kind="turn_off")

    async def set_brightness(self, device: Device, value: int) -> None:
        brightness = max(0, min(int(value), 100))
        await self._write_for_device(device, command_kind="brightness", i=brightness)

    async def set_rgb(self, device: Device, r: int, g: int, b: int) -> None:
        await self._write_for_device(
            device,
            command_kind="color",
            r=max(0, min(int(r), 255)),
            g=max(0, min(int(g), 255)),
            b=max(0, min(int(b), 255)),
        )

    async def get_capabilities(self, device: Device | None = None) -> dict[str, bool]:
        return ELK_BLEDOM_CAPABILITIES.copy()

    def _scan_result_to_candidate(self, result: BLEScanResult) -> DriverCandidate:
        supported = result.detected_family in {DeviceFamily.ELK_BLEDOM.value, DeviceFamily.DUOCO_STRIP.value}
        return DriverCandidate(
            family=result.detected_family or "Unclassified",
            name=result.name,
            ble_identifier=result.ble_identifier,
            address=result.address,
            vendor_name=result.metadata.get("vendor_name"),
            rssi=result.rssi,
            source=result.source,
            is_supported=supported,
            classification_reason=result.classification_reason,
            advertised_services=result.advertised_services,
            manufacturer_data=result.manufacturer_data,
            metadata=result.metadata,
        )

    async def _write_for_device(self, device: Device, command_kind: str, **values: int) -> None:
        profile = self._profile_from_device(device)
        try:
            resolved = await self._adapter.write_command(
                identifier=device.ble_identifier,
                payload=self._build_command(profile, command_kind, **values),
                preferred_write_uuids=profile.preferred_write_uuids,
                preferred_read_uuids=profile.preferred_read_uuids,
                preferred_write_handle=profile.preferred_write_handle,
            )
        except BLEAdapterError as exc:
            LOGGER.error("ELK-BLEDOM command '%s' failed for %s: %s", command_kind, device.name, exc, exc_info=True)
            raise

        device.meta_json = {
            **(device.meta_json or {}),
            "ble": self._resolved_metadata(profile, resolved),
        }

    def _profile_from_device(self, device: Device) -> ELKBledomProfile:
        profile_key = ((device.meta_json or {}).get("ble") or {}).get("driver_profile")
        if profile_key and profile_key in ELK_PROFILE_INDEX:
            return ELK_PROFILE_INDEX[profile_key]

        ble_meta = (device.meta_json or {}).get("ble") or {}
        resolved = None
        if ble_meta.get("write_uuid"):
            resolved = ResolvedBLECharacteristics(
                write_uuid=ble_meta["write_uuid"],
                read_uuid=ble_meta.get("read_uuid"),
                write_handle=ble_meta.get("write_handle"),
                service_uuids=ble_meta.get("service_uuids", []),
                characteristic_uuids=ble_meta.get("characteristic_uuids", []),
            )
        return self._profile_for_device_name(
            name=device.name,
            family_hint=device.family.value if isinstance(device.family, DeviceFamily) else str(device.family),
            resolved=resolved,
        )

    def _profile_for_device_name(
        self,
        name: str | None,
        family_hint: str | None,
        resolved: ResolvedBLECharacteristics | None,
    ) -> ELKBledomProfile:
        normalized_name = (name or "").strip().lower()

        if resolved and resolved.write_handle == 13 and normalized_name.startswith("elk-bledom"):
            return ELK_PROFILE_INDEX["elk_bledom_handle13"]

        for profile in ELK_BLEDOM_PROFILES:
            if profile.preferred_write_handle is not None and resolved and resolved.write_handle != profile.preferred_write_handle:
                continue
            if any(normalized_name.startswith(prefix) for prefix in profile.match_prefixes):
                return profile

        if family_hint == DeviceFamily.DUOCO_STRIP.value:
            return ELK_PROFILE_INDEX["duoco_fallback"]

        return ELK_PROFILE_INDEX["elk_bledom_generic"]

    def _pick_profile(self, name: str | None, family_hint: str | None) -> ELKBledomProfile:
        return self._profile_for_device_name(name=name, family_hint=family_hint, resolved=None)

    def _build_command(self, profile: ELKBledomProfile, command_kind: str, **values: int) -> bytes:
        template = {
            "turn_on": profile.turn_on_template,
            "turn_off": profile.turn_off_template,
            "brightness": profile.brightness_template,
            "color": profile.color_template,
        }[command_kind]
        payload = []
        for part in template:
            if isinstance(part, str):
                payload.append(int(values[part]))
            else:
                payload.append(part)
        return bytes(payload)

    def _resolved_metadata(self, profile: ELKBledomProfile, resolved: ResolvedBLECharacteristics) -> dict[str, Any]:
        return {
            "driver_profile": profile.key,
            "write_uuid": resolved.write_uuid,
            "read_uuid": resolved.read_uuid,
            "write_handle": resolved.write_handle,
            "service_uuids": resolved.service_uuids,
            "characteristic_uuids": resolved.characteristic_uuids,
        }


SUPPORTED_FAMILIES = [family.value for family in DeviceFamily]
_mock_driver = MockLightDriver()
_elk_driver = ELKBledomDriver()
DRIVER_REGISTRY: dict[str, LightDriver] = {
    DeviceFamily.MOCK.value: _mock_driver,
    DeviceFamily.ELK_BLEDOM.value: _elk_driver,
    DeviceFamily.DUOCO_STRIP.value: _elk_driver,
    DeviceFamily.ZENGGE.value: _mock_driver,
    DeviceFamily.SURPLIFE.value: _mock_driver,
    DeviceFamily.MOHUANLED.value: _mock_driver,
    DeviceFamily.BJ_LED.value: _mock_driver,
}


def get_driver(family: str) -> LightDriver:
    return DRIVER_REGISTRY.get(family, _mock_driver)
