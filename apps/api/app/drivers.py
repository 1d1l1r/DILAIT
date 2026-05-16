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
ZENGGE_WRITE_UUID = "0000ff01-0000-1000-8000-00805f9b34fb"
ZENGGE_NOTIFY_UUID = "0000ff02-0000-1000-8000-00805f9b34fb"
BJ_LED_SERVICE_UUID = "0000eea0-0000-1000-8000-00805f9b34fb"
BJ_LED_WRITE_UUID = "0000ee01-0000-1000-8000-00805f9b34fb"
BJ_LED_READ_UUID = "0000ee02-0000-1000-8000-00805f9b34fb"


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


@dataclass(frozen=True, slots=True)
class ZenggeProfile:
    key: str
    family: str
    product_ids: tuple[int, ...]
    ble_versions: tuple[int, ...]
    name_prefixes: tuple[str, ...]
    preferred_write_uuids: tuple[str, ...]
    preferred_read_uuids: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class BJLedProfile:
    key: str
    family: str
    name_prefixes: tuple[str, ...]
    name_hints: tuple[str, ...]
    preferred_service_uuids: tuple[str, ...]
    preferred_write_uuids: tuple[str, ...]
    preferred_read_uuids: tuple[str, ...]


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

ZENGGE_CAPABILITIES = {
    "power": True,
    "brightness": True,
    "rgb": True,
    "white_channel": False,
    "effects": False,
    "readback_state": False,
}

ZENGGE_PROFILES = (
    ZenggeProfile(
        key="zengge_lednetwf_0x33_v5",
        family=DeviceFamily.ZENGGE.value,
        product_ids=(0x33,),
        ble_versions=(5,),
        name_prefixes=("lednetwf020033", "lednetwf", "surplife"),
        preferred_write_uuids=(ZENGGE_WRITE_UUID,),
        preferred_read_uuids=(ZENGGE_NOTIFY_UUID,),
    ),
    ZenggeProfile(
        key="zengge_iotbt_0x6400_v35",
        family=DeviceFamily.ZENGGE.value,
        product_ids=(0x6400,),
        ble_versions=(0x23,),
        name_prefixes=("iotbt",),
        preferred_write_uuids=(ZENGGE_WRITE_UUID,),
        preferred_read_uuids=(ZENGGE_NOTIFY_UUID,),
    ),
)

ZENGGE_PROFILE_INDEX = {profile.key: profile for profile in ZENGGE_PROFILES}

BJ_LED_CAPABILITIES = {
    "power": True,
    "brightness": True,
    "rgb": True,
    "white_channel": False,
    "effects": False,
    "readback_state": False,
}

BJ_LED_PROFILES = (
    BJLedProfile(
        key="bj_led_mohuan_v1",
        family=DeviceFamily.BJ_LED.value,
        name_prefixes=("bj_led", "bj_led_m"),
        name_hints=("mohuan", "mohuanled"),
        preferred_service_uuids=(BJ_LED_SERVICE_UUID,),
        preferred_write_uuids=(BJ_LED_WRITE_UUID,),
        preferred_read_uuids=(BJ_LED_READ_UUID, BJ_LED_WRITE_UUID),
    ),
)

BJ_LED_PROFILE_INDEX = {profile.key: profile for profile in BJ_LED_PROFILES}


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
        if ble_identifier.startswith("mock://"):
            profile = self._pick_profile(name=name, family_hint=self.family)
            return ProbeResult(family=profile.family, capabilities=ELK_BLEDOM_CAPABILITIES.copy(), metadata={"simulated": True, "driver_profile": profile.key})

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
                read_handle=ble_meta.get("read_handle"),
                write_properties=ble_meta.get("write_properties", []),
                read_properties=ble_meta.get("read_properties", []),
                write_response=bool(ble_meta.get("write_response", False)),
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
            "read_handle": resolved.read_handle,
            "write_properties": resolved.write_properties,
            "read_properties": resolved.read_properties,
            "write_response": resolved.write_response,
            "service_uuids": resolved.service_uuids,
            "characteristic_uuids": resolved.characteristic_uuids,
        }


class ZenggeDriver:
    family = DeviceFamily.ZENGGE.value

    def __init__(self) -> None:
        self._scanner = BleakDiscoveryScanner()
        self._adapter = BleakBLEAdapter()
        self._sequence = 0

    async def discover_candidates(self) -> list[DriverCandidate]:
        results = await self._scanner.scan()
        return [self._scan_result_to_candidate(item) for item in results]

    async def probe(self, ble_identifier: str, name: str | None = None) -> ProbeResult:
        scan_result = await self._find_scan_result(ble_identifier)
        scan_metadata = scan_result.metadata if scan_result else {}
        resolved_name = name or (scan_result.name if scan_result else None)
        profile = self._pick_profile(name=resolved_name, metadata=scan_metadata)
        if profile is None:
            raise RuntimeError(
                "No verified ZENGGE profile found for this device yet. "
                "Sprint 3 currently supports the validated LEDnetWF 0x33 controller path."
            )

        resolved = await self._adapter.inspect_characteristics(
            identifier=ble_identifier,
            preferred_write_uuids=profile.preferred_write_uuids,
            preferred_read_uuids=profile.preferred_read_uuids,
        )
        return ProbeResult(
            family=profile.family,
            capabilities=ZENGGE_CAPABILITIES.copy(),
            metadata=self._resolved_metadata(profile, resolved, scan_metadata),
        )

    async def turn_on(self, device: Device) -> None:
        await self._write_for_device(device, self._build_power_command(True))

    async def turn_off(self, device: Device) -> None:
        await self._write_for_device(device, self._build_power_command(False))

    async def set_brightness(self, device: Device, value: int) -> None:
        brightness = max(0, min(int(value), 100))
        await self._write_for_device(device, self._build_brightness_command(brightness))

    async def set_rgb(self, device: Device, r: int, g: int, b: int) -> None:
        await self._write_for_device(
            device,
            self._build_color_command(
                r=max(0, min(int(r), 255)),
                g=max(0, min(int(g), 255)),
                b=max(0, min(int(b), 255)),
            ),
        )

    async def get_capabilities(self, device: Device | None = None) -> dict[str, bool]:
        return ZENGGE_CAPABILITIES.copy()

    def _scan_result_to_candidate(self, result: BLEScanResult) -> DriverCandidate:
        detected_family = result.detected_family or "Unclassified"
        is_verified_profile = self._pick_profile(name=result.name, metadata=result.metadata) is not None
        supported = detected_family in {DeviceFamily.ZENGGE.value, DeviceFamily.SURPLIFE.value} and is_verified_profile
        return DriverCandidate(
            family=detected_family,
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

    async def _find_scan_result(self, ble_identifier: str) -> BLEScanResult | None:
        for result in await self._scanner.scan(timeout=4):
            if result.ble_identifier == ble_identifier or result.address == ble_identifier:
                return result
        return None

    async def _write_for_device(self, device: Device, payload: bytes) -> None:
        profile = self._profile_from_device(device)
        if profile is None:
            raise BLEAdapterError(
                "No verified ZENGGE profile is attached to this device. "
                "Re-onboard it from discovery so we can capture metadata."
            )

        try:
            resolved = await self._adapter.write_command(
                identifier=device.ble_identifier,
                payload=payload,
                preferred_write_uuids=profile.preferred_write_uuids,
                preferred_read_uuids=profile.preferred_read_uuids,
                preferred_write_handle=((device.meta_json or {}).get("ble") or {}).get("write_handle"),
            )
        except BLEAdapterError as exc:
            LOGGER.error("ZENGGE command failed for %s: %s", device.name, exc, exc_info=True)
            raise

        existing_ble = (device.meta_json or {}).get("ble") or {}
        device.meta_json = {
            **(device.meta_json or {}),
            "ble": self._resolved_metadata(profile, resolved, existing_ble),
        }

    def _profile_from_device(self, device: Device) -> ZenggeProfile | None:
        ble_meta = (device.meta_json or {}).get("ble") or {}
        profile_key = ble_meta.get("driver_profile")
        if profile_key and profile_key in ZENGGE_PROFILE_INDEX:
            return ZENGGE_PROFILE_INDEX[profile_key]
        return self._pick_profile(name=device.name, metadata=ble_meta)

    def _pick_profile(self, name: str | None, metadata: dict[str, Any] | None) -> ZenggeProfile | None:
        normalized_name = (name or "").strip().lower()
        metadata = metadata or {}
        product_id = metadata.get("product_id")
        ble_version = metadata.get("ble_version")

        for profile in ZENGGE_PROFILES:
            if product_id in profile.product_ids and (ble_version in profile.ble_versions or ble_version is None):
                return profile
            if any(normalized_name.startswith(prefix) for prefix in profile.name_prefixes):
                if product_id in profile.product_ids or ble_version in profile.ble_versions:
                    return profile

        return None

    def _next_sequence(self) -> int:
        self._sequence = (self._sequence + 1) % 256
        return self._sequence

    def _build_power_command(self, turn_on: bool) -> bytes:
        mode = 0x23 if turn_on else 0x24
        raw_payload = bytearray([0x3B, mode, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x32, 0x00, 0x00])
        raw_payload.append(sum(raw_payload) & 0xFF)
        return self._wrap_command(raw_payload, seq=self._next_sequence())

    def _build_brightness_command(self, brightness_pct: int) -> bytes:
        raw_payload = bytearray([0x3B, 0x01, 0x00, 0x00, brightness_pct & 0xFF, 0x00, brightness_pct & 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00])
        raw_payload.append(sum(raw_payload) & 0xFF)
        return self._wrap_command(raw_payload, seq=self._next_sequence())

    def _build_color_command(self, r: int, g: int, b: int) -> bytes:
        raw_payload = bytearray([0x31, r & 0xFF, g & 0xFF, b & 0xFF, 0x00, 0x00, 0xF0, 0x0F])
        raw_payload.append(sum(raw_payload) & 0xFF)
        return self._wrap_command(raw_payload, seq=self._next_sequence())

    def _wrap_command(self, raw_payload: bytearray, seq: int, cmd_family: int = 0x0B) -> bytes:
        payload_len = len(raw_payload)
        packet = bytearray(8 + payload_len)
        packet[0] = 0x00
        packet[1] = seq & 0xFF
        packet[2] = 0x80
        packet[3] = 0x00
        packet[4] = (payload_len >> 8) & 0xFF
        packet[5] = payload_len & 0xFF
        packet[6] = (payload_len + 1) & 0xFF
        packet[7] = cmd_family
        packet[8:] = raw_payload
        return bytes(packet)

    def _resolved_metadata(
        self,
        profile: ZenggeProfile,
        resolved: ResolvedBLECharacteristics,
        metadata: dict[str, Any] | None,
    ) -> dict[str, Any]:
        metadata = metadata or {}
        return {
            "driver_profile": profile.key,
            "protocol_hint": metadata.get("protocol_hint", "lednetwf"),
            "product_id": metadata.get("product_id"),
            "ble_version": metadata.get("ble_version"),
            "firmware_version": metadata.get("firmware_version"),
            "manufacturer_id": metadata.get("manufacturer_id"),
            "manufacturer_mac": metadata.get("manufacturer_mac"),
            "manufacturer_payload_hex": metadata.get("manufacturer_payload_hex"),
            "write_uuid": resolved.write_uuid,
            "read_uuid": resolved.read_uuid,
            "write_handle": resolved.write_handle,
            "read_handle": resolved.read_handle,
            "write_properties": resolved.write_properties,
            "read_properties": resolved.read_properties,
            "write_response": resolved.write_response,
            "service_uuids": resolved.service_uuids,
            "characteristic_uuids": resolved.characteristic_uuids,
        }


class BJLEDDriver:
    family = DeviceFamily.BJ_LED.value

    def __init__(self) -> None:
        self._scanner = BleakDiscoveryScanner()
        self._adapter = BleakBLEAdapter()

    async def discover_candidates(self) -> list[DriverCandidate]:
        results = await self._scanner.scan()
        return [self._scan_result_to_candidate(item) for item in results]

    async def probe(self, ble_identifier: str, name: str | None = None) -> ProbeResult:
        scan_result = await self._find_scan_result(ble_identifier)
        metadata = scan_result.metadata if scan_result else {}
        resolved_name = (scan_result.name if scan_result else None) or name
        profile = self._pick_profile(resolved_name, metadata)
        if profile is None:
            raise RuntimeError(
                "No verified BJ_LED / MohuanLED profile found for this device yet. "
                "Sprint 4 currently supports the validated BJ_LED controller path."
            )

        resolved = await self._adapter.inspect_characteristics(
            identifier=ble_identifier,
            preferred_write_uuids=profile.preferred_write_uuids,
            preferred_read_uuids=profile.preferred_read_uuids,
        )
        if not set(profile.preferred_service_uuids).intersection({value.lower() for value in resolved.service_uuids}):
            raise RuntimeError(
                "Connected device does not expose the validated BJ_LED service layout "
                f"({profile.preferred_service_uuids})."
            )

        return ProbeResult(
            family=profile.family,
            capabilities=BJ_LED_CAPABILITIES.copy(),
            metadata=self._resolved_metadata(profile, resolved, metadata),
        )

    async def turn_on(self, device: Device) -> None:
        await self._write_for_device(device, self._build_power_command(True))

    async def turn_off(self, device: Device) -> None:
        await self._write_for_device(device, self._build_power_command(False))

    async def set_brightness(self, device: Device, value: int) -> None:
        brightness = max(0, min(int(value), 100))
        rgb = self._base_rgb_for_device(device)
        await self._write_for_device(device, self._build_color_command(rgb["r"], rgb["g"], rgb["b"], brightness))

    async def set_rgb(self, device: Device, r: int, g: int, b: int) -> None:
        state = device.desired_state_json or device.known_state_json or {}
        brightness = max(0, min(int(state.get("brightness", 100)), 100))
        await self._write_for_device(
            device,
            self._build_color_command(
                r=max(0, min(int(r), 255)),
                g=max(0, min(int(g), 255)),
                b=max(0, min(int(b), 255)),
                brightness=brightness,
            ),
        )

    async def get_capabilities(self, device: Device | None = None) -> dict[str, bool]:
        return BJ_LED_CAPABILITIES.copy()

    def _scan_result_to_candidate(self, result: BLEScanResult) -> DriverCandidate:
        detected_family = result.detected_family or "Unclassified"
        is_verified_profile = self._pick_profile(result.name, result.metadata) is not None
        supported = detected_family in {DeviceFamily.BJ_LED.value, DeviceFamily.MOHUANLED.value} and is_verified_profile
        return DriverCandidate(
            family=detected_family,
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

    async def _find_scan_result(self, ble_identifier: str) -> BLEScanResult | None:
        for result in await self._scanner.scan(timeout=4):
            if result.ble_identifier == ble_identifier or result.address == ble_identifier:
                return result
        return None

    async def _write_for_device(self, device: Device, payload: bytes) -> None:
        profile = self._profile_from_device(device)
        if profile is None:
            raise BLEAdapterError(
                "No verified BJ_LED profile is attached to this device. "
                "Re-onboard it from discovery so we can capture metadata."
            )

        try:
            resolved = await self._adapter.write_command(
                identifier=device.ble_identifier,
                payload=payload,
                preferred_write_uuids=profile.preferred_write_uuids,
                preferred_read_uuids=(),
                preferred_write_handle=((device.meta_json or {}).get("ble") or {}).get("write_handle"),
            )
        except BLEAdapterError as exc:
            LOGGER.error("BJ_LED command failed for %s: %s", device.name, exc, exc_info=True)
            raise

        existing_ble = (device.meta_json or {}).get("ble") or {}
        device.meta_json = {
            **(device.meta_json or {}),
            "ble": self._resolved_metadata(profile, resolved, existing_ble),
        }

    def _profile_from_device(self, device: Device) -> BJLedProfile | None:
        ble_meta = (device.meta_json or {}).get("ble") or {}
        profile_key = ble_meta.get("driver_profile")
        if profile_key and profile_key in BJ_LED_PROFILE_INDEX:
            return BJ_LED_PROFILE_INDEX[profile_key]
        return self._pick_profile(device.name, ble_meta)

    def _pick_profile(self, name: str | None, metadata: dict[str, Any] | None) -> BJLedProfile | None:
        normalized_name = (name or "").strip().lower()
        metadata = metadata or {}
        service_uuids = {value.lower() for value in metadata.get("service_uuids", [])}
        characteristic_uuids = {value.lower() for value in metadata.get("characteristic_uuids", [])}

        for profile in BJ_LED_PROFILES:
            if any(normalized_name.startswith(prefix) for prefix in profile.name_prefixes):
                return profile
            if any(hint in normalized_name for hint in profile.name_hints):
                return profile
            if set(profile.preferred_service_uuids).intersection(service_uuids) and BJ_LED_WRITE_UUID in characteristic_uuids:
                return profile

        return None

    def _base_rgb_for_device(self, device: Device) -> dict[str, int]:
        for state in (device.desired_state_json or {}, device.known_state_json or {}):
            rgb = state.get("rgb")
            if isinstance(rgb, dict):
                return {
                    "r": max(0, min(int(rgb.get("r", 255)), 255)),
                    "g": max(0, min(int(rgb.get("g", 255)), 255)),
                    "b": max(0, min(int(rgb.get("b", 255)), 255)),
                }
        return {"r": 255, "g": 255, "b": 255}

    def _build_power_command(self, turn_on: bool) -> bytes:
        return bytes.fromhex("69 96 06 01 01" if turn_on else "69 96 02 01 00")

    def _build_color_command(self, r: int, g: int, b: int, brightness: int) -> bytes:
        brightness_pct = max(0, min(int(brightness), 100))
        scaled = [
            max(0, min(int(channel * brightness_pct / 100), 255))
            for channel in (r, g, b)
        ]
        return bytes([0x69, 0x96, 0x05, 0x02, *scaled, max(scaled)])

    def _resolved_metadata(
        self,
        profile: BJLedProfile,
        resolved: ResolvedBLECharacteristics,
        metadata: dict[str, Any] | None,
    ) -> dict[str, Any]:
        metadata = metadata or {}
        return {
            "driver_profile": profile.key,
            "protocol_hint": "mohuanled",
            "feedback_supported": False,
            "state_mode": "optimistic",
            "write_uuid": resolved.write_uuid,
            "read_uuid": resolved.read_uuid,
            "write_handle": resolved.write_handle,
            "read_handle": resolved.read_handle,
            "write_properties": resolved.write_properties,
            "read_properties": resolved.read_properties,
            "write_response": resolved.write_response,
            "service_uuids": resolved.service_uuids,
            "characteristic_uuids": resolved.characteristic_uuids,
            "platform_identifier": metadata.get("platform_identifier"),
        }


SUPPORTED_FAMILIES = [family.value for family in DeviceFamily]
_mock_driver = MockLightDriver()
_elk_driver = ELKBledomDriver()
_zengge_driver = ZenggeDriver()
_bj_led_driver = BJLEDDriver()
DRIVER_REGISTRY: dict[str, LightDriver] = {
    DeviceFamily.MOCK.value: _mock_driver,
    DeviceFamily.ELK_BLEDOM.value: _elk_driver,
    DeviceFamily.DUOCO_STRIP.value: _elk_driver,
    DeviceFamily.ZENGGE.value: _zengge_driver,
    DeviceFamily.SURPLIFE.value: _zengge_driver,
    DeviceFamily.MOHUANLED.value: _bj_led_driver,
    DeviceFamily.BJ_LED.value: _bj_led_driver,
}


def get_driver(family: str) -> LightDriver:
    return DRIVER_REGISTRY.get(family, _mock_driver)
