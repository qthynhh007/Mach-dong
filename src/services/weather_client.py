from urllib.parse import urlencode

from src.services.cloud_client import cloudClient


class weatherClient:
    def __init__(self, cloud: cloudClient) -> None:
        self.cloud = cloud

    def forecast(self, locationId: str) -> dict:
        return self.cloud.request("/api/weather?" + urlencode({"locationId": locationId}))
