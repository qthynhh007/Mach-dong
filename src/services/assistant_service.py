def explain_risk(stage: str, salt: str, flood: str, depth: float, temp: float) -> str:
    summary = f"Lúa đang {stage.lower()}. Rủi ro mặn {salt.lower()}, rủi ro ngập {flood.lower()}."
    if depth < -5:
        return f"{summary} Mực nước dưới ngưỡng khô của mô hình. Kiểm tra độ ẩm và ghi số đo tại ruộng."
    if temp > 35:
        return f"{summary} Nhiệt độ vượt ngưỡng stress nhiệt của mô hình. Ghi nhiệt độ thực đo và quan sát lá."
    return f"{summary} Theo dõi mực nước và độ mặn tại ruộng. Đếm cây sống trên cùng ô mẫu qua các ngày."
