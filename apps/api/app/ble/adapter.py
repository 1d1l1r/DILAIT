from __future__ import annotations

import logging
from dataclasses import dataclass

from apps.api.app.core import settings

LOGGER = logging.getLogger(__name__)


class BLEAdapterError(RuntimeError):
    pass


@dataclass(slots=True)
class ResolvedBLECharacteristics:
    write_uuid: str
    read_uuid: str | None
    write_handle: int | None
    service_uuids: list[str]
    characteristic_uuids: list[str]


def _normalize_uuid(value: str) -> str:
    return value.lower()


class BleakBLEAdapter:
    async def inspect_characteristics(
        self,
        identifier: str,
        preferred_write_uuids: tuple[str, ...],
        preferred_read_uuids: tuple[str, ...] = (),
        preferred_write_handle: int | None = None,
    ) -> ResolvedBLECharacteristics:
        try:
            from bleak import BleakClient, BleakScanner
        except Exception as exc:  # noqa: BLE001
            raise BLEAdapterError(f"Bleak is unavailable: {exc}") from exc

        target = await BleakScanner.find_device_by_address(identifier, timeout=settings.ble_connect_timeout_seconds)
        client_target = target or identifier

        try:
            async with BleakClient(client_target, timeout=settings.ble_connect_timeout_seconds) as client:
                services = client.services or await client.get_services()
                return self._resolve_characteristics(
                    services=services,
                    preferred_write_uuids=preferred_write_uuids,
                    preferred_read_uuids=preferred_read_uuids,
                    preferred_write_handle=preferred_write_handle,
                )
        except Exception as exc:  # noqa: BLE001
            raise BLEAdapterError(f"BLE inspection failed for {identifier}: {exc}") from exc

    async def write_command(
        self,
        identifier: str,
        payload: bytes,
        preferred_write_uuids: tuple[str, ...],
        preferred_read_uuids: tuple[str, ...] = (),
        preferred_write_handle: int | None = None,
    ) -> ResolvedBLECharacteristics:
        try:
            from bleak import BleakClient, BleakScanner
        except Exception as exc:  # noqa: BLE001
            raise BLEAdapterError(f"Bleak is unavailable: {exc}") from exc

        target = await BleakScanner.find_device_by_address(identifier, timeout=settings.ble_connect_timeout_seconds)
        client_target = target or identifier

        try:
            async with BleakClient(client_target, timeout=settings.ble_connect_timeout_seconds) as client:
                services = client.services or await client.get_services()
                resolved = self._resolve_characteristics(
                    services=services,
                    preferred_write_uuids=preferred_write_uuids,
                    preferred_read_uuids=preferred_read_uuids,
                    preferred_write_handle=preferred_write_handle,
                )
                LOGGER.info(
                    "Writing BLE command to %s via %s (handle=%s): %s",
                    identifier,
                    resolved.write_uuid,
                    resolved.write_handle,
                    payload.hex(" "),
                )
                await client.write_gatt_char(resolved.write_uuid, payload, response=False)
                return resolved
        except Exception as exc:  # noqa: BLE001
            raise BLEAdapterError(f"BLE write failed for {identifier}: {exc}") from exc

    def _resolve_characteristics(
        self,
        services,
        preferred_write_uuids: tuple[str, ...],
        preferred_read_uuids: tuple[str, ...],
        preferred_write_handle: int | None,
    ) -> ResolvedBLECharacteristics:
        normalized_write_uuids = {_normalize_uuid(value) for value in preferred_write_uuids}
        normalized_read_uuids = {_normalize_uuid(value) for value in preferred_read_uuids}
        service_uuids: list[str] = []
        characteristic_uuids: list[str] = []
        write_matches = []
        read_matches = []

        for service in services:
            service_uuids.append(service.uuid.lower())
            for characteristic in service.characteristics:
                characteristic_uuids.append(characteristic.uuid.lower())
                normalized_uuid = characteristic.uuid.lower()
                props = {value.lower() for value in characteristic.properties}
                if normalized_uuid in normalized_write_uuids or (
                    {"write", "write-without-response"}.intersection(props) and normalized_uuid.endswith(("fff3-0000-1000-8000-00805f9b34fb", "ffe1-0000-1000-8000-00805f9b34fb"))
                ):
                    write_matches.append(characteristic)
                if normalized_uuid in normalized_read_uuids or (
                    {"read", "notify"}.intersection(props) and normalized_uuid.endswith(("fff4-0000-1000-8000-00805f9b34fb", "ffe2-0000-1000-8000-00805f9b34fb"))
                ):
                    read_matches.append(characteristic)

        if not write_matches:
            raise BLEAdapterError(
                "No supported writable characteristic found. "
                f"Preferred UUIDs: {preferred_write_uuids}, available: {characteristic_uuids}"
            )

        if preferred_write_handle is not None:
            write_matches.sort(key=lambda item: getattr(item, "handle", None) != preferred_write_handle)

        write_characteristic = write_matches[0]
        read_characteristic = read_matches[0] if read_matches else None
        return ResolvedBLECharacteristics(
            write_uuid=str(write_characteristic.uuid),
            read_uuid=str(read_characteristic.uuid) if read_characteristic else None,
            write_handle=getattr(write_characteristic, "handle", None),
            service_uuids=sorted(set(service_uuids)),
            characteristic_uuids=sorted(set(characteristic_uuids)),
        )

