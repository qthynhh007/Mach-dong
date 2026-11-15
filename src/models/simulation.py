from dataclasses import dataclass


@dataclass(frozen=True)
class SimulationInput:
    salinity_gl: float
    water_depth_cm: float
    day_after_sowing: int
    temp_c: float

    @classmethod
    def parse(cls, payload: object) -> "SimulationInput":
        if not isinstance(payload, dict):
            raise TypeError("Expected a JSON object")
        salinity = payload.get("salinity_gl")
        water = payload.get("water_depth_cm")
        day = payload.get("day_after_sowing")
        temp = payload.get("temp_c")
        if (
            type(salinity) not in (int, float)
            or not 0 <= salinity <= 6
            or type(water) not in (int, float)
            or not -10 <= water <= 30
            or type(day) is not int
            or not 0 <= day <= 95
            or type(temp) not in (int, float)
            or not 20 <= temp <= 42
        ):
            raise ValueError("Input outside the simulation limits")
        return cls(salinity, water, day, temp)
