import json

from src.config import REFERENCE_DIR

EDITORIAL_AUTHOR = "editorial:admin"
EDITORIAL_POSTS = {
    f"bai-tham-khao-{item['id']:02d}": item
    for item in json.loads(
        (REFERENCE_DIR / "forum-source-posts.json").read_text(encoding="utf-8")
    )
}

DISCUSSION_TOPICS = {
    "water": "Trữ ngọt rãnh liếp",
    "crop-care": "Chăm sóc lúa",
    "sowing": "Lịch sạ né mặn",
    "field-alert": "Cảnh báo tại ruộng",
}
TOPICS = {**DISCUSSION_TOPICS, "references": "Bài tham khảo"}

CULTIVARS = ("OM5451", "ST25", "OM18", "Đài Thơm 8", "Khác")
STAGES = ("Mạ non", "Đẻ nhánh", "Làm đòng", "Trổ bông", "Chín vàng")

SAMPLE_POSTS = (
    {
        "id": "muong-lo",
        "topic": "water",
        "title": "Kinh nghiệm theo dõi mực nước ruộng khi cống Mương Lộ đóng",
        "author": "Chú Năm Ruộng",
        "location": "Ấp 3, Long Hữu",
        "cultivar": "OM5451",
        "stage": "Làm đòng",
        "score": 42,
        "body": (
            "Tui ghi độ mặn ở ruộng và ngoài cống vào hai dòng riêng để dễ so sánh. "
            "Trong ca minh họa này, nước tại ruộng đo được 1,4 g/L, ngoài cống 2,8 g/L. "
            "Mỗi lần ghi tui ghi thêm giờ đo và tình trạng cống.\n\n"
            "Bà con có kinh nghiệm ghi nhật ký mực nước qua đợt triều thì góp ý thêm nghen."
        ),
        "photos": ["/static/assets/stitch-forum-field.jpg"],
    },
    {
        "id": "quan-sat-re-lua",
        "topic": "crop-care",
        "title": "Ghi lại dấu hiệu trên lá và rễ sau đợt mặn",
        "author": "Mai Hoàng Yến",
        "location": "Đồng bằng sông Cửu Long",
        "cultivar": "OM5451",
        "stage": "Đẻ nhánh",
        "score": 28,
        "body": (
            "Tui chụp ảnh cùng góc sáng tại ô mẫu và đánh dấu ngày quan sát. "
            "Ghi cùng sổ với số đo mặn tại ruộng để dễ đối chiếu dấu hiệu vàng lá và lá mới."
        ),
        "photos": [
            "/static/assets/stitch-forum-roots.jpg",
            "/static/assets/stitch-forum-field.jpg",
        ],
    },
    {
        "id": "lich-sa-dong-xuan",
        "topic": "sowing",
        "title": "So sánh hai lịch xuống giống vụ Đông Xuân",
        "author": "Bác Ba Đất",
        "location": "Ba Tri",
        "cultivar": "OM5451",
        "stage": "Mạ non",
        "score": 15,
        "body": (
            "Tui thử nhập hai ngày xuống giống vào mô phỏng để xem lúc nào ruộng bước vào làm đòng. "
            "Khi ghi nhật ký, tui giữ lại lịch triều và số đo thực tế của từng đợt để cả nhóm đối chiếu."
        ),
        "photos": [],
    },
)

SAMPLE_REPLIES = {
    "muong-lo": (
        {
            "author": "Anh Ba Đất",
            "body": "Chú ghi số đo ở cống và tại ruộng cách nhau bao lâu vậy?",
        },
        {
            "author": "Chú Năm Ruộng",
            "body": "Tui ghi giờ cho từng điểm đo để bà con tiện đối chiếu.",
        },
    ),
}
