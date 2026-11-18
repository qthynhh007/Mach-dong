from collections.abc import Callable

from flask import Blueprint, Response, current_app, jsonify, render_template, request

from src.models.simulation import SimulationDemoInput, simulationError
from src.services.simulation_demo import evaluate

blueprint = Blueprint("simulation", __name__)


class simulationController:
    def index(self):
        return render_template("simulation/index.html", current_page="simulation")

    def report(self) -> str:
        return render_template("simulation/cloud.html", current_page="simulation")

    def respond(self, action):
        try:
            return jsonify(data=action(), error=None)
        except simulationError as error:
            return jsonify(data=None, error=str(error)), error.status

    def simulate(self):
        return self.read_scenario(self.service().simulate)

    def preview(self) -> Response | tuple[Response, int]:
        return self.read_scenario(lambda payload: evaluate(SimulationDemoInput.parse(payload)))

    def read_scenario(self, action: Callable[[object], object]) -> Response | tuple[Response, int]:
        if not request.is_json:
            return jsonify(data=None, error="Yêu cầu JSON."), 415
        if request.content_length and request.content_length > 8192:
            return jsonify(data=None, error="Kịch bản quá lớn."), 413
        if request.headers.get("Sec-Fetch-Site") == "cross-site":
            return jsonify(data=None, error="Yêu cầu khác nguồn bị từ chối."), 403
        return self.respond(lambda: action(request.get_json(silent=True)))

    def catalog(self):
        return self.respond(lambda: self.service().catalog())

    def weather(self):
        return self.respond(lambda: self.service().forecast(request.args.get("locationId", "")))

    def history(self):
        response = self.respond(lambda: self.service().history())
        if not isinstance(response, tuple):
            response.headers["Content-Disposition"] = 'attachment; filename="NASA-POWER-Mekong.json"'
        return response

    def service(self):
        return current_app.extensions["simulationService"]


controller = simulationController()
blueprint.add_url_rule("/simulation", endpoint="simulation", view_func=controller.index)
blueprint.add_url_rule("/simulation/report", endpoint="report", view_func=controller.report)
blueprint.add_url_rule("/api/simulation", view_func=controller.simulate, methods=["POST"])
blueprint.add_url_rule("/api/simulation/preview", view_func=controller.preview, methods=["POST"])
blueprint.add_url_rule("/api/simulation/catalog", view_func=controller.catalog)
blueprint.add_url_rule("/api/simulation/weather", view_func=controller.weather)
blueprint.add_url_rule("/api/simulation/history", view_func=controller.history)
