from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import WaypointViewSet, analyze_frame, analyze_horizon, get_offline_manifest, get_metrics
from .celestial_views import search_celestial_poi, generate_turn_guidance_view

router = DefaultRouter()
router.register(r'waypoints', WaypointViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('analyze-frame/', analyze_frame, name='analyze-frame'),
    path('analyze-horizon/', analyze_horizon, name='analyze-horizon'),
    path('search-celestial/', search_celestial_poi, name='search-celestial'),
    path('turn-guidance/', generate_turn_guidance_view, name='turn-guidance'),
    path('offline-manifest/', get_offline_manifest, name='offline-manifest'),
    path('metrics/', get_metrics, name='metrics'),
]
