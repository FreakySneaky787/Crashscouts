"""Loads the SPDX licence list shipped in apps/catalog/data/spdx-licenses.json (see ADR 0014)."""

import json
from pathlib import Path

DATA_FILE = Path(__file__).resolve().parent / "data" / "spdx-licenses.json"
PROPRIETARY = ("LicenseRef-Proprietary", "Proprietary (closed source)")


def load_entries(path: Path = DATA_FILE) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    entries = [
        {"spdx_id": i["id"], "name": i["name"], "is_osi_approved": i["osi"]}
        for i in data["licenses"]
    ]
    entries.append({"spdx_id": PROPRIETARY[0], "name": PROPRIETARY[1], "is_osi_approved": False})
    return entries


def sync(license_model, path: Path = DATA_FILE) -> int:
    """Inserts or updates all entries; returns their number. Existing references stay intact."""
    entries = load_entries(path)
    for entry in entries:
        license_model.objects.update_or_create(
            spdx_id=entry["spdx_id"],
            defaults={"name": entry["name"], "is_osi_approved": entry["is_osi_approved"]},
        )
    return len(entries)
