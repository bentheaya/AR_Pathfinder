from django.contrib import admin
from django.contrib.gis.admin import GISModelAdmin
from .models import Waypoint, NavigationSession, FrameAnalysis


@admin.register(Waypoint)
class WaypointAdmin(GISModelAdmin):
    list_display = ['name', 'created_at']
    search_fields = ['name', 'description']
    
    # OpenStreetMap-based map for PostGIS fields
    default_lon = 0
    default_lat = 0
    default_zoom = 2


@admin.register(NavigationSession)
class NavigationSessionAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'started_at', 'is_active']
    list_filter = ['is_active', 'started_at']
    readonly_fields = ['started_at']


@admin.register(FrameAnalysis)
class FrameAnalysisAdmin(admin.ModelAdmin):
    list_display = ['id', 'session', 'heading', 'confidence', 'analyzed_at']
    list_filter = ['analyzed_at']
    readonly_fields = ['analyzed_at']
