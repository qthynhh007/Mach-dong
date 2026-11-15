from flask import Blueprint, Response, jsonify, render_template, request

from src.models.simulation import SimulationInput
from src.services.simulation_service import evaluate

blueprint = Blueprint("simulation", __name__)


@blueprint.get("/simulation")
def simulation() -> str:
    return render_template("simulation/index.html", current_page="simulation")


@blueprint.post("/api/simulation")
def run_simulation() -> tuple[Response, int]:
    try:
        inputs = SimulationInput.parse(request.get_json(silent=True))
    except (TypeError, ValueError):
        return jsonify(data=None, error="Thông số mô phỏng không hợp lệ."), 400
    return jsonify(data=evaluate(inputs), error=None), 200
