"""Fixed lists: programming languages and the SPDX licence list (WP 2.1)."""

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.catalog.models import License


@pytest.mark.django_db
def test_languages_are_part_of_the_public_catalog():
    data = APIClient().get("/api/v1/catalog/").json()
    assert {"python", "rust", "typescript", "other"} <= {item["slug"] for item in data["languages"]}


@pytest.mark.django_db
def test_licences_come_from_the_spdx_list_with_the_open_source_label():
    response = APIClient().get("/api/v1/catalog/licenses/")
    assert response.status_code == 200
    assert response["Cache-Control"] == "public, max-age=3600"
    by_id = {item["spdx_id"]: item for item in response.json()}
    assert len(by_id) == 709  # 708 non-deprecated SPDX licences (list 3.29.0) + proprietary
    assert by_id["MIT"]["open_source"] is True
    assert by_id["AGPL-3.0-only"]["open_source"] is True
    # Source-available and proprietary licences are not labelled open source.
    assert by_id["BUSL-1.1"]["open_source"] is False
    assert by_id["SSPL-1.0"]["open_source"] is False
    assert by_id["LicenseRef-Proprietary"]["open_source"] is False


@pytest.mark.django_db
def test_deprecated_identifiers_are_not_offered():
    assert not License.objects.filter(spdx_id="GPL-3.0").exists()  # deprecated in favour of -only
    assert License.objects.filter(spdx_id="GPL-3.0-only").exists()


@pytest.mark.django_db
def test_sync_is_idempotent(capsys):
    before = License.objects.count()
    call_command("sync_spdx_licenses")
    assert License.objects.count() == before
    assert "Licences synchronised: 709" in capsys.readouterr().out
