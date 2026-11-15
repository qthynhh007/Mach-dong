import csv
from io import StringIO

from src.config import MAX_CSV_BYTES


def preview_csv(raw: bytes) -> dict[str, list[str] | list[list[str]] | int]:
    if not raw or len(raw) > MAX_CSV_BYTES:
        raise ValueError("Tệp cần có dữ liệu và dung lượng không quá 1 MB.")
    try:
        reader = csv.reader(StringIO(raw.decode("utf-8-sig"), newline=""), strict=True)
        columns = [name.strip() for name in next(reader, [])]
        if len(columns) < 2 or len(set(columns)) != len(columns) or not all(columns):
            raise ValueError(
                "CSV cần ít nhất hai cột, tên cột duy nhất và có dấu phẩy phân cách."
            )
        rows = []
        row_count = 0
        for row in reader:
            if not row:
                continue
            if len(row) != len(columns):
                raise ValueError(f"Số cột không khớp ở dòng {reader.line_num}.")
            row_count += 1
            if len(rows) < 5:
                rows.append([cell[:200] for cell in row])
        if not row_count:
            raise ValueError("CSV chưa có dòng số liệu.")
        return {
            "columns": [name[:100] for name in columns],
            "rows": rows,
            "row_count": row_count,
        }
    except (UnicodeDecodeError, csv.Error) as error:
        raise ValueError("Tệp CSV phải có mã hóa UTF-8 và cú pháp hợp lệ.") from error
