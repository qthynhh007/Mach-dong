"""Real authenticated clients for feature tests; no production auth bypass."""

from src.models.user import UserRole


def sign_in(client, username="test_farmer"):
    service = client.application.extensions["auth_service"]
    if not service.repo.get_by_username(username):
        service.repo.create_user(username=username, name="Nông hộ kiểm thử", email=f"{username}@example.test",
                                 phone="+84912345678", password="test-password-only", role=UserRole.FARMER,
                                 wallet_address=None, wallet_type="AUTO_EMAIL")
    response = client.post("/api/auth/login", json={"identifier": username, "password": "test-password-only"})
    if response.status_code != 200:
        raise AssertionError(response.json)
    data = response.json["data"]
    client.environ_base["HTTP_X_CSRF_TOKEN"] = data["csrf_token"]
    return data
