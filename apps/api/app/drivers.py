from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from apps.api.app.models import Device, DeviceFamily


@dataclass(slots=True)
class DriverCandidate:
    family: str
    name: str
    ble_identifier: str
    vendor_name: str | None = None
    rssi: int | None = None
    services: list[str] | None = None


@dataclass(slots=True)
class ProbeResult:
    family: str
    capabilities: dict[str, bool]


class LightDriver(Protocol):
    family: str

    async def discover_candidates(self) -> list[DriverCandidate]: ...
    async def probe(self, ble_identifier: str) -> ProbeResult: ...
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
                services=["mock-power", "mock-rgb"],
            ),
            DriverCandidate(
                family=DeviceFamily.ELK_BLEDOM.value,
                name="ELK-BLEDOM Simulator",
                ble_identifier="mock://elk-bledom",
                vendor_name="ELK",
                rssi=-55,
                services=["ffb0", "ffd0"],
            ),
        ]

    async def probe(self, ble_identifier: str) -> ProbeResult:
        family = DeviceFamily.MOCK.value if ble_identifier.startswith("mock://strip") else DeviceFamily.ELK_BLEDOM.value
        return ProbeResult(family=family, capabilities=await self.get_capabilities())

    async def turn_on(self, device: Device) -> None:
        return None

    async def turn_off(self, device: Device) -> None:
        return None

    async def set_brightness(self, device: Device, value: int) -> None:
        return None

    async def set_rgb(self, device: Device, r: int, g: int, b: int) -> None:
        return None

    async def get_capabilities(self, device: Device | None = None) -> dict[str, bool]:
        return {
            "power": True,
            "brightness": True,
            "rgb": True,
            "white_channel": False,
            "effects": False,
            "readback_state": False,
        }


SUPPORTED_FAMILIES = [family.value for family in DeviceFamily]
_mock_driver = MockLightDriver()
DRIVER_REGISTRY: dict[str, LightDriver] = {family: _mock_driver for family in SUPPORTED_FAMILIES}


def get_driver(family: str) -> LightDriver:
    return DRIVER_REGISTRY.get(family, _mock_driver)

