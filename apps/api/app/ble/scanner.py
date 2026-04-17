from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from apps.api.app.core import settings
from apps.api.app.models import DeviceFamily

LOGGER = logging.getLogger(__name__)

ELK_NAME_PREFIXES = (
    "elk-bledom",
    "elk-ble",
    "elk-btc",
    "elk-bulb",
    "elk-lampl",
)
ELK_SERVICE_HINTS = {
    "0000fff0-0000-1000-8000-00805f9b34fb",
    "0000fff3-0000-1000-8000-00805f9b34fb",
    "0000fff4-0000-1000-8000-00805f9b34fb",
}
ZENGGE_NAME_PREFIXES = (
    "lednetwf",
    "iotbt",
    "magic hue",
    "ybcrg",
)
SURPLIFE_NAME_PREFIXES = ("surplife",)
ZENGGE_SERVICE_HINTS = {
    "0000ff01-0000-1000-8000-00805f9b34fb",
    "0000ff02-0000-1000-8000-00805f9b34fb",
    "0000ffff-0000-1000-8000-00805f9b34fb",
    "00005a00-0000-1000-8000-00805f9b34fb",
    "00005b00-0000-1000-8000-00805f9b34fb",
    "0000fe00-0000-1000-8000-00805f9b34fb",
}


@dataclass(slots=True)
class BLEScanResult:
    name: str
    ble_identifier: str
    address: str | None
    rssi: int | None
    advertised_services: list[str] = field(default_factory=list)
    manufacturer_data: dict[str, str] = field(default_factory=dict)
    source: str = "real"
    detected_family: str | None = None
    classification_reason: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


def _normalize_uuid(value: str) -> str:
    return value.lower()


def parse_zengge_manufacturer_data(manufacturer_data: dict[str, str]) -> dict[str, Any]:
    for manufacturer_id, payload_hex in manufacturer_data.items():
        normalized_id = manufacturer_id.lower()
        if not normalized_id.startswith(("0x5a", "0x5b")):
            continue

        try:
            payload = bytes.fromhex(payload_hex)
        except ValueError:
            LOGGER.debug("Unable to parse manufacturer data %s=%s", manufacturer_id, payload_hex)
            return {"manufacturer_id": normalized_id}

        metadata: dict[str, Any] = {
            "protocol_hint": "lednetwf",
            "manufacturer_id": normalized_id,
            "manufacturer_payload_hex": payload_hex.lower(),
            "manufacturer_payload_length": len(payload),
        }
        if len(payload) >= 10:
            metadata["manufacturer_mac"] = ":".join(f"{value:02X}" for value in payload[2:8])
            metadata["product_id"] = (payload[8] << 8) | payload[9]
        if len(payload) >= 2:
            metadata["ble_version"] = payload[1]
        if len(payload) >= 12:
            metadata["firmware_version"] = payload[10]
            metadata["led_hardware_version"] = payload[11]
        return metadata

    return {}


def classify_scan_result(
    name: str | None,
    advertised_services: list[str],
    manufacturer_data: dict[str, str] | None = None,
) -> tuple[str | None, str | None]:
    normalized_name = (name or "").strip().lower()
    normalized_services = {_normalize_uuid(value) for value in advertised_services}
    zengge_metadata = parse_zengge_manufacturer_data(manufacturer_data or {})

    if any(normalized_name.startswith(prefix) for prefix in ELK_NAME_PREFIXES):
        return DeviceFamily.ELK_BLEDOM.value, f"name matched ELK prefix '{name}'"

    if "duoco" in normalized_name:
        return DeviceFamily.DUOCO_STRIP.value, f"name matched duoCo hint '{name}'"

    if normalized_services.intersection(ELK_SERVICE_HINTS):
        matched = sorted(normalized_services.intersection(ELK_SERVICE_HINTS))[0]
        return DeviceFamily.ELK_BLEDOM.value, f"advertised ELK service {matched}"

    if any(prefix in normalized_name for prefix in SURPLIFE_NAME_PREFIXES):
        return DeviceFamily.SURPLIFE.value, f"name matched Surplife hint '{name}'"

    if any(normalized_name.startswith(prefix) for prefix in ZENGGE_NAME_PREFIXES):
        return DeviceFamily.ZENGGE.value, f"name matched ZENGGE hint '{name}'"

    if normalized_services.intersection(ZENGGE_SERVICE_HINTS):
        matched = sorted(normalized_services.intersection(ZENGGE_SERVICE_HINTS))[0]
        return DeviceFamily.ZENGGE.value, f"advertised ZENGGE service {matched}"

    if zengge_metadata.get("manufacturer_id"):
        product_id = zengge_metadata.get("product_id")
        if product_id is not None:
            return DeviceFamily.ZENGGE.value, f"manufacturer payload matched ZENGGE family (product_id=0x{product_id:02X})"
        return DeviceFamily.ZENGGE.value, "manufacturer payload matched ZENGGE family"

    return None, None


class BleakDiscoveryScanner:
    async def scan(self, timeout: float | None = None) -> list[BLEScanResult]:
        try:
            from bleak import BleakScanner
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("Bleak scanner unavailable: %s", exc)
            return []

        timeout_seconds = timeout or settings.ble_scan_timeout_seconds
        try:
            discovered = await BleakScanner.discover(timeout=timeout_seconds, return_adv=True)
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("BLE discovery failed: %s", exc, exc_info=True)
            return []

        results: list[BLEScanResult] = []
        for identifier, (device, advertisement) in discovered.items():
            services = sorted({value.lower() for value in (advertisement.service_uuids or [])})
            manufacturer_data = {hex(key): value.hex() for key, value in (advertisement.manufacturer_data or {}).items()}
            family_metadata = parse_zengge_manufacturer_data(manufacturer_data)
            candidate_name = (advertisement.local_name or device.name or identifier or "Unnamed BLE device").strip()
            detected_family, reason = classify_scan_result(candidate_name, services, manufacturer_data)
            results.append(
                BLEScanResult(
                    name=candidate_name,
                    ble_identifier=device.address or identifier,
                    address=device.address,
                    rssi=advertisement.rssi if advertisement.rssi is not None else getattr(device, "rssi", None),
                    advertised_services=services,
                    manufacturer_data=manufacturer_data,
                    detected_family=detected_family,
                    classification_reason=reason,
                    metadata={
                        "platform_identifier": identifier,
                        "tx_power": advertisement.tx_power,
                        **family_metadata,
                    },
                )
            )

        results.sort(key=lambda item: (item.name.lower(), -(item.rssi or -9999)))
        return results
