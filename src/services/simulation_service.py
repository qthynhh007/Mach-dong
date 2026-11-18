from src.models.simulation import simulationInput
from src.services.ai_client import aiClient
from src.services.cloud_client import cloudClient
from src.services.weather_client import weatherClient


class simulationService:
    def __init__(self, cloud: cloudClient) -> None:
        self.cloud = cloud
        self.ai = aiClient(cloud)
        self.weather = weatherClient(cloud)

    def simulate(self, payload: object) -> dict:
        inputs = simulationInput.parse(payload)
        return self.ai.simulate(inputs.payload)

    def catalog(self) -> dict:
        return self.cloud.request("/api/catalog")

    def forecast(self, locationId: str) -> dict:
        return self.weather.forecast(locationId)

    def history(self) -> dict:
        return self.cloud.request("/api/datasets/weather-history")
