# Căn cứ cho cảnh sinh lý lúa

Trang Mô phỏng dùng mô hình `SIM-PHYSIOLOGY-V1` để tính CHI và phân loại rủi ro. Cơ chế sinh lý dưới đây giải thích hướng thay đổi có thể gặp. Các hệ số uốn lá, độ dài vệt đầu lá và lượng nước phủ khóm trong `src/services/simulation_physiology.py` phục vụ vẽ SVG. Đánh giá thiệt hại ngoài ruộng cần chiều cao cây, độ ẩm đất, số đo mặn tại ruộng và thời gian phơi nhiễm.

| Yếu tố | Cảnh thay đổi | Căn cứ khoa học |
| --- | --- | --- |
| **Sinh trưởng** | Mạ thấp, đẻ nhánh có nhiều chồi, làm đòng có bông nằm trong bẹ, trổ bông thấy đầu bông và chín thì chuyển vàng. | Chu kỳ thực tế phụ thuộc giống và điều kiện canh tác. Các khoảng ngày trong trang là mốc của mô hình OM5451. [IRRI · Morphology, Growth, and Development of the Rice Plant](https://books.irri.org/0471097608_content.pdf) |
| **Mặn** | Đầu lá chuyển vàng nâu ở một số lá. Màu này được vẽ riêng với màu chín của cả tán. | Mặn có thể gây stress thẩm thấu và tổn thương do ion. Nghiên cứu trên mạ quan sát Na tích tụ và diệp lục giảm ở phần đầu hoặc giữa lá. [Nghiên cứu phân bố Na và tổn thương lá lúa](https://doi.org/10.1626/pps.5.269) |
| **Đất khô** | Đất có vệt nứt minh họa, lá hẹp và rũ xuống. | Lúa có thể cuốn lá khi đất khô. Độ cuốn còn thay đổi theo giống và hình dạng lá. [Cal và cộng sự · Lá lúa cuốn trong điều kiện hạn](https://doi.org/10.1111/pce.13514) |
| **Ngập** | Nước che từ gốc lên trên. Với cùng mực nước, hình mạ thấp bị che rõ hơn khóm trưởng thành. | Nguồn oxy đến rễ lúa phụ thuộc trao đổi khí qua thân lá và oxy trong nước. Ngập sâu hạn chế trao đổi khí và ánh sáng khi lá chìm. [Winkel và cộng sự · Oxy trong rễ lúa khi ngập](https://doi.org/10.1111/nph.12048) |
| **Nóng** | Ánh sáng ấm hơn và tán có thể rũ theo dấu hiệu minh họa. Ở giai đoạn trổ, bản giải thích nêu thời điểm hoa nở. | Thí nghiệm cho thấy khả năng thụ phấn thay đổi theo nhiệt độ và thời điểm tiếp xúc nóng. Hình dáng tán riêng lẻ chưa đủ để suy ra tỷ lệ lép. [Jagadish và cộng sự · Nhiệt độ và khả năng hữu thụ](https://doi.org/10.1093/jxb/erm003) |
