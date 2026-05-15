from __future__ import annotations

import asyncio
import logging
import platform
import time
from dataclasses import dataclass
from typing import Any

from apps.api.app.core import settings

LOGGER = logging.getLogger(__name__)

MACOS_WRITE_ATTEMPTS = 2
MACOS_RECONNECT_DELAY_SECONDS = 0.35


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

        try:
            target = await self._find_device(BleakScanner, identifier)
            client_target = target or identifier
            client = BleakClient(client_target, timeout=settings.ble_connect_timeout_seconds)
            connected = False
            start = time.monotonic()
            try:
                LOGGER.info("BLE inspect connect start identifier=%s target=%s", identifier, self._target_label(client_target))
                await client.connect()
                connected = True
                LOGGER.info("BLE inspect connect ok identifier=%s elapsed_ms=%d", identifier, self._elapsed_ms(start))
                services = client.services or await client.get_services()
                LOGGER.info("BLE inspect services ok identifier=%s elapsed_ms=%d", identifier, self._elapsed_ms(start))
                return self._resolve_characteristics(
                    services=services,
                    preferred_write_uuids=preferred_write_uuids,
                    preferred_read_uuids=preferred_read_uuids,
                    preferred_write_handle=preferred_write_handle,
                )
            finally:
                await self._disconnect_client(client, identifier, "inspect", connected)
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

        attempts = self._write_attempts()
        last_error: Exception | None = None
        for attempt in range(1, attempts + 1):
            try:
                return await self._write_command_once(
                    BleakClient=BleakClient,
                    BleakScanner=BleakScanner,
                    identifier=identifier,
                    payload=payload,
                    preferred_write_uuids=preferred_write_uuids,
                    preferred_read_uuids=preferred_read_uuids,
                    preferred_write_handle=preferred_write_handle,
                    attempt=attempt,
                    attempts=attempts,
                )
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                LOGGER.warning(
                    "BLE write attempt failed identifier=%s attempt=%d/%d error=%s",
                    identifier,
                    attempt,
                    attempts,
                    exc,
                    exc_info=True,
                )
                if attempt < attempts:
                    await asyncio.sleep(MACOS_RECONNECT_DELAY_SECONDS)

        raise BLEAdapterError(f"BLE write failed for {identifier}: {last_error}") from last_error

    async def _write_command_once(
        self,
        *,
        BleakClient,
        BleakScanner,
        identifier: str,
        payload: bytes,
        preferred_write_uuids: tuple[str, ...],
        preferred_read_uuids: tuple[str, ...],
        preferred_write_handle: int | None,
        attempt: int,
        attempts: int,
    ) -> ResolvedBLECharacteristics:
        target = await self._find_device(BleakScanner, identifier)
        client_target = target or identifier
        client = BleakClient(client_target, timeout=settings.ble_connect_timeout_seconds)
        connected = False
        start = time.monotonic()
        try:
            LOGGER.info(
                "BLE write connect start identifier=%s target=%s attempt=%d/%d payload=%s",
                identifier,
                self._target_label(client_target),
                attempt,
                attempts,
                payload.hex(" "),
            )
            await client.connect()
            connected = True
            LOGGER.info(
                "BLE write connect ok identifier=%s attempt=%d/%d elapsed_ms=%d",
                identifier,
                attempt,
                attempts,
                self._elapsed_ms(start),
            )
            services = client.services or await client.get_services()
            resolved = self._resolve_characteristics(
                services=services,
                preferred_write_uuids=preferred_write_uuids,
                preferred_read_uuids=preferred_read_uuids,
                preferred_write_handle=preferred_write_handle,
            )
            LOGGER.info(
                "BLE write characteristic resolved identifier=%s uuid=%s handle=%s attempt=%d/%d elapsed_ms=%d",
                identifier,
                resolved.write_uuid,
                resolved.write_handle,
                attempt,
                attempts,
                self._elapsed_ms(start),
            )
            await client.write_gatt_char(resolved.write_uuid, payload, response=False)
            LOGGER.info(
                "BLE write ok identifier=%s uuid=%s handle=%s attempt=%d/%d elapsed_ms=%d",
                identifier,
                resolved.write_uuid,
                resolved.write_handle,
                attempt,
                attempts,
                self._elapsed_ms(start),
            )
            return resolved
        finally:
            await self._disconnect_client(client, identifier, "write", connected)

    async def _find_device(self, BleakScanner, identifier: str) -> Any:
        start = time.monotonic()
        LOGGER.info("BLE find_device start identifier=%s timeout=%s", identifier, settings.ble_connect_timeout_seconds)
        target = await BleakScanner.find_device_by_address(identifier, timeout=settings.ble_connect_timeout_seconds)
        LOGGER.info(
            "BLE find_device %s identifier=%s elapsed_ms=%d",
            "hit" if target else "miss",
            identifier,
            self._elapsed_ms(start),
        )
        return target

    async def _disconnect_client(self, client, identifier: str, operation: str, connected: bool) -> None:
        if not connected and not bool(getattr(client, "is_connected", False)):
            return

        start = time.monotonic()
        try:
            await client.disconnect()
            LOGGER.info("BLE %s disconnect ok identifier=%s elapsed_ms=%d", operation, identifier, self._elapsed_ms(start))
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("BLE %s disconnect failed identifier=%s error=%s", operation, identifier, exc, exc_info=True)

    def _write_attempts(self) -> int:
        return MACOS_WRITE_ATTEMPTS if platform.system() == "Darwin" else 1

    def _target_label(self, target: Any) -> str:
        return str(getattr(target, "address", None) or target)

    def _elapsed_ms(self, start: float) -> int:
        return int((time.monotonic() - start) * 1000)

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
