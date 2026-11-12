from django.urls import path

from .views import MyProjectsView, ProjectCreateView, ProjectDetailView

urlpatterns = [
    path("projects/", ProjectCreateView.as_view(), name="project-create"),
    path("projects/<str:slug>/", ProjectDetailView.as_view(), name="project-detail"),
    path("me/projects/", MyProjectsView.as_view(), name="my-projects"),
]
