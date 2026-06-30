from __future__ import annotations

import difflib
from dataclasses import dataclass, field


@dataclass
class DiffLine:
    kind: str        # "equal" | "insert" | "delete" | "replace"
    content: str
    line_number_old: int | None = None
    line_number_new: int | None = None


@dataclass
class DiffResult:
    old_version: int
    new_version: int
    stats: dict = field(default_factory=dict)
    lines: list[DiffLine] = field(default_factory=list)

    @property
    def additions(self) -> int:
        return sum(1 for l in self.lines if l.kind == "insert")

    @property
    def deletions(self) -> int:
        return sum(1 for l in self.lines if l.kind == "delete")

    @property
    def changes(self) -> int:
        return sum(1 for l in self.lines if l.kind == "replace")


def compute_diff(old_text: str, new_text: str, old_version: int, new_version: int) -> DiffResult:
    old_lines = old_text.splitlines(keepends=True) if old_text else []
    new_lines = new_text.splitlines(keepends=True) if new_text else []

    matcher = difflib.SequenceMatcher(None, old_lines, new_lines)
    result = DiffResult(old_version=old_version, new_version=new_version)

    old_line_num = 0
    new_line_num = 0

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            for idx in range(i1, i2):
                result.lines.append(DiffLine(
                    kind="equal",
                    content=old_lines[idx].rstrip("\n\r"),
                    line_number_old=old_line_num + 1,
                    line_number_new=new_line_num + 1,
                ))
                old_line_num += 1
                new_line_num += 1

        elif tag == "delete":
            for idx in range(i1, i2):
                result.lines.append(DiffLine(
                    kind="delete",
                    content=old_lines[idx].rstrip("\n\r"),
                    line_number_old=old_line_num + 1,
                ))
                old_line_num += 1

        elif tag == "insert":
            for idx in range(j1, j2):
                result.lines.append(DiffLine(
                    kind="insert",
                    content=new_lines[idx].rstrip("\n\r"),
                    line_number_new=new_line_num + 1,
                ))
                new_line_num += 1

        elif tag == "replace":
            for idx in range(i1, i2):
                result.lines.append(DiffLine(
                    kind="delete",
                    content=old_lines[idx].rstrip("\n\r"),
                    line_number_old=old_line_num + 1,
                ))
                old_line_num += 1
            for idx in range(j1, j2):
                result.lines.append(DiffLine(
                    kind="insert",
                    content=new_lines[idx].rstrip("\n\r"),
                    line_number_new=new_line_num + 1,
                ))
                new_line_num += 1

    num_added = sum(1 for l in result.lines if l.kind == "insert")
    num_deleted = sum(1 for l in result.lines if l.kind == "delete")
    num_equal = sum(1 for l in result.lines if l.kind == "equal")

    result.stats = {
        "additions": num_added,
        "deletions": num_deleted,
        "unchanged": num_equal,
        "total_lines": len(result.lines),
    }

    return result
