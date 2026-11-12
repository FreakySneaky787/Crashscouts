import uuid

import pytest
from django.contrib.auth import get_user_model


@pytest.mark.django_db
def test_user_primary_key_is_random_uuid4():
    user_model = get_user_model()
    first = user_model.objects.create_user(username="alice", password="a-long-test-passphrase")
    second = user_model.objects.create_user(username="bob", password="a-long-test-passphrase")

    assert isinstance(first.pk, uuid.UUID)
    assert first.pk.version == 4
    assert first.pk != second.pk


@pytest.mark.django_db
def test_password_is_stored_with_argon2_and_verifiable():
    user = get_user_model().objects.create_user(
        username="carol", password="correct horse battery staple"
    )
    user.refresh_from_db()

    assert user.password.startswith("argon2$argon2id$")
    assert "correct horse battery staple" not in user.password
    assert user.check_password("correct horse battery staple")
    assert not user.check_password("wrong password")


@pytest.mark.django_db
def test_new_users_are_not_staff_or_superuser():
    user = get_user_model().objects.create_user(username="dave", password="a-long-test-passphrase")

    assert user.is_staff is False
    assert user.is_superuser is False
