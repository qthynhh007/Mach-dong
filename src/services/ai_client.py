from src.services.cloud_client import cloudClient


class aiClient:
    """Shared cloud API; Gemini secrets and inference stay on the server."""
    def __init__(self, cloud: cloudClient) -> None:
        self.cloud = cloud

    def simulate(self, payload: dict) -> dict:
        return self.cloud.request("/api/simulation", payload)
