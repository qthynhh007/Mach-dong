from flask import Blueprint, current_app, jsonify, render_template, request
from src.controllers.session_guard import get_auth_service, get_current_auth
from src.models.simulation import simulationError, simulationInput
from src.services.credit_service import default_credit_service

blueprint = Blueprint("simulation", __name__)

class simulationController:
    @staticmethod
    def activeTab(default):
        value = request.args.get("tab", default)
        return value if value in {"mo-phong", "bao-cao", "thoi-tiet"} else default

    def index(self):
        return render_template("simulation/index.html", current_page="simulation", active_tab=self.activeTab("mo-phong"), stage_options=zip(("seedling", "tillering", "panicle", "flowering", "ripening"), ((0,"Mạ non"),(0,"Đẻ nhánh"),(0,"Làm đòng"),(0,"Trổ bông"),(0,"Chín vàng"))))

    def report(self):
        return render_template("simulation/cloud.html", current_page="simulation", active_tab=self.activeTab("bao-cao"))

    def respond(self, action):
        try:
            return jsonify(data=action(), error=None)
        except simulationError as error:
            return jsonify(data=None, error=str(error)), error.status

    def simulate(self):
        if not request.is_json:
            return jsonify(data=None, error="Yêu cầu JSON."), 415
        if request.content_length and request.content_length > 8192:
            return jsonify(data=None, error="Kịch bản quá lớn."), 413
        if request.headers.get("Sec-Fetch-Site") == "cross-site":
            return jsonify(data=None, error="Yêu cầu khác nguồn bị từ chối."), 403
        def run_and_spend():
            payload = request.get_json(silent=True)
            simulationInput.parse(payload)
            auth = get_current_auth()
            auth_service = get_auth_service() if auth else None
            if auth and auth_service and hasattr(auth_service, "spend_simulation_credit"):
                if int(auth[0].simulation_credits) < 1:
                    raise simulationError("Số dư điểm LÚA không đủ (cần ít nhất 1 LÚA để chạy mô phỏng).", 402)
            result = self.service().simulate(payload)
            if auth and auth_service and hasattr(auth_service, "spend_simulation_credit"):
                spend_res = auth_service.spend_simulation_credit(auth[0], 1)
                if not spend_res.ok or not spend_res.data:
                    raise simulationError(spend_res.error or "Không thể trừ điểm LÚA.", spend_res.status_code)
                result.setdefault("remainingCredits", spend_res.data["remaining_credits"])
                if spend_res.data.get("onchain_spend") is not None:
                    result["onchainSpend"] = spend_res.data["onchain_spend"]
            elif auth and auth[0].wallet_address and default_credit_service.is_write_configured:
                wallet_addr = auth[0].wallet_address
                target = result.get("remainingCredits")
                onchain_bal = default_credit_service.get_onchain_balance(wallet_addr)
                if isinstance(target, int) and (onchain_bal is None or onchain_bal != target + 1):
                    sync_res = default_credit_service.sync_credits_onchain(wallet_addr, target)
                    result["onchainSpend"] = sync_res
                    if sync_res.get("onchain"):
                        result["onchainCredits"] = target
                else:
                    spend_onchain = default_credit_service.spend_credits_onchain(
                        wallet_addr, 1, "simulation"
                    )
                    result["onchainSpend"] = spend_onchain
                    if spend_onchain.get("onchain"):
                        new_bal = default_credit_service.get_onchain_balance(wallet_addr)
                        if new_bal is not None:
                            result["onchainCredits"] = new_bal
            return result
        return self.respond(run_and_spend)

    def catalog(self):
        return self.respond(lambda: self.service().catalog())
    def advice(self):
        if not request.is_json:
            return jsonify(data=None, error="Yêu cầu JSON."), 415
        if request.content_length and request.content_length > 8192:
            return jsonify(data=None, error="Kịch bản quá lớn."), 413
        return self.respond(lambda: self.service().advice(request.get_json(silent=True)))
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
blueprint.add_url_rule("/api/simulation/advice", view_func=controller.advice, methods=["POST"])
blueprint.add_url_rule("/api/simulation/catalog", view_func=controller.catalog)
blueprint.add_url_rule("/api/simulation/weather", view_func=controller.weather)
blueprint.add_url_rule("/api/simulation/history", view_func=controller.history)
