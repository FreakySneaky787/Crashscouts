from django.urls import path

from .views import OwnAvatarView, OwnProfileView, PublicProfileView, avatar_image

urlpatterns = [
    path("me/profile/", OwnProfileView.as_view(), name="own-profile"),
    path("me/profile/avatar/", OwnAvatarView.as_view(), name="own-avatar"),
    path("profiles/<str:username>/", PublicProfileView.as_view(), name="public-profile"),
    path("avatars/<uuid:key>/", avatar_image, name="avatar-image"),
]
