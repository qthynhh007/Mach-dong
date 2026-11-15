from dataclasses import dataclass


@dataclass(frozen=True)
class Contribution:
    filename: str
    columns: list[str]
    row_count: int
