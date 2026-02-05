from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import WaypointViewSet, analyze_frame

router = DefaultRouter()
router.register(r'waypoints', WaypointViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('analyze-frame/', analyze_frame, name='analyze-frame'),
]
