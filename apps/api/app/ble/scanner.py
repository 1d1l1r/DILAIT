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


def classify_scan_result(name: str | None, advertised_services: list[str]) -> tuple[str | None, str | None]:
    normalized_name = (name or "").strip().lower()
    normalized_services = {_normalize_uuid(value) for value in advertised_services}

    if any(normalized_name.startswith(prefix) for prefix in ELK_NAME_PREFIXES):
        return DeviceFamily.ELK_BLEDOM.value, f"name matched ELK prefix '{name}'"

    if "duoco" in normalized_name:
        return DeviceFamily.DUOCO_STRIP.value, f"name matched duoCo hint '{name}'"

    if normalized_services.intersection(ELK_SERVICE_HINTS):
        matched = sorted(normalized_services.intersection(ELK_SERVICE_HINTS))[0]
        return DeviceFamily.ELK_BLEDOM.value, f"advertised ELK service {matched}"

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
            candidate_name = (advertisement.local_name or device.name or identifier or "Unnamed BLE device").strip()
            detected_family, reason = classify_scan_result(candidate_name, services)
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
                    },
                )
            )

        results.sort(key=lambda item: (item.name.lower(), -(item.rssi or -9999)))
        return results

