from src.models.simulation import simulationInput
from src.services.ai_client import aiClient
from src.services.cloud_client import cloudClient
from src.services.simulation_demo import AdviceStep, STAGE_CHECKS
from src.services.weather_client import weatherClient


class simulationService:
    def __init__(self, cloud: cloudClient) -> None:
        self.cloud = cloud
        self.ai = aiClient(cloud)
        self.weather = weatherClient(cloud)

    def simulate(self, payload: object) -> dict:
        inputs = simulationInput.parse(payload)
        report = self.ai.simulate(inputs.payload)
        return {**report, "fieldAdvice": report_advice(inputs.payload, report)}

    def catalog(self) -> dict:
        return {**self.cloud.request("/api/catalog"), "localService": self.cloud.is_local}

    def forecast(self, locationId: str) -> dict:
        return self.weather.forecast(locationId)

    def history(self) -> dict:
        return self.cloud.request("/api/datasets/weather-history")


def report_advice(inputs: dict, report: dict) -> list[AdviceStep]:
    stage = {"seedling": "Mạ non", "tillering": "Đẻ nhánh", "panicle": "Làm đòng",
             "flowering": "Trổ bông", "ripening": "Chín vàng"}[inputs["stage"]]
    salinity = f"{inputs['salinityGl']:g}".replace(".", ",")
    canal = inputs["salinitySite"] == "canalWater"
    steps: list[AdviceStep] = [{
        "title": "Lấy thêm mẫu trong thửa" if canal else "Theo dõi độ mặn ở cùng điểm đo",
        "body": (
            f"Giá trị {salinity} g/L trong kịch bản thuộc nước kênh hoặc cống. Trước khi tính chuyện lấy nước, đo thêm trong thửa ở một vị trí xác định. Ghi giờ và trạng thái cửa cho từng mẫu để biết nguồn ngoài kênh và nước cây đang tiếp xúc khác nhau thế nào."
            if canal else
            f"Kịch bản dùng {salinity} g/L tại ruộng. Đánh dấu điểm đã lấy mẫu và kiểm tra thêm một điểm cuối đường nước. Sau khi mở cửa hoặc có mưa, trở lại đúng các điểm ấy, ghi số mới cùng giờ đo. Nếu lấy nước từ kênh, dành một dòng riêng cho mẫu nguồn."
        ),
    }]
    depth, height = inputs["waterDepthCm"], inputs["plantHeightCm"]
    water = f"Độ sâu đã nhập là {depth:g} cm so với mặt ruộng. "
    if height is None:
        water += "Đo thêm chiều cao cây tại cùng chỗ đo nước, từ mặt đất tới ngọn, để biết phần cây nào còn trên mặt nước. "
    elif depth >= height:
        water += f"So với chiều cao cây {height:g} cm đã nhập, mực nước chạm hoặc vượt ngọn tại điểm giả định. Ưu tiên ra vạt thấp xác nhận tình trạng ngập ngọn, ghi giờ bắt đầu thấy ngập và xem cửa tiêu có thoát được nước. "
    else:
        water += f"So với chiều cao cây {height:g} cm, ngọn còn trên mực nước ở điểm giả định. Đi thêm tới chỗ trũng để xem cây thấp hơn có bị chìm ngọn. "
    steps.append({"title": "So mực nước với chiều cao cây", "body": water + "Đọc lại cùng mốc sau khi nước lên hoặc rút. Số ngày chạy kịch bản chưa cho biết ruộng đã ngập liên tục bao lâu."})
    steps.append({"title": f"Kiểm tra lúa đang {stage.lower()}", "body": STAGE_CHECKS[stage]})
    hot_days = [day for day in report.get("dailyScenario", []) if day.get("heatConcern") is True]
    if hot_days:
        steps.append({"title": "Đối chiếu ngày nóng với giờ hoa mở", "body":
            f"Báo cáo đánh dấu {len(hot_days)} ngày có điều kiện nóng lúc trổ. Hôm ra đồng, ghi giờ hoa đang mở ở mé và giữa ruộng. Đối chiếu với nhiệt độ thực đo cùng giờ nếu có; nhiệt độ cao nhất ngày chỉ giúp chọn thời điểm cần theo dõi. Đánh dấu vài bông để xem lại lúc vào hạt."})
    return steps
