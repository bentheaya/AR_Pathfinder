from django.contrib.gis.db import models
from django.contrib.auth.models import User

class Waypoint(models.Model):
    """Represents a geographical waypoint/landmark"""
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    location = models.PointField()  # PostGIS Point field for lat/lon
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['name']
    
    def __str__(self):
        return self.name


class NavigationSession(models.Model):
    """Stores navigation session data"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    start_location = models.PointField()
    destination = models.ForeignKey(Waypoint, on_delete=models.SET_NULL, null=True)
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        ordering = ['-started_at']
    
    def __str__(self):
        return f"Session {self.id} - {self.started_at}"


class FrameAnalysis(models.Model):
    """Stores analyzed frames from camera"""
    session = models.ForeignKey(NavigationSession, on_delete=models.CASCADE, related_name='frames')
    location = models.PointField()
    heading = models.FloatField()  # Compass heading in degrees
    image_hash = models.CharField(max_length=64, blank=True)  # For caching/deduplication
    landmarks_detected = models.JSONField(default=list)
    confidence = models.FloatField(default=0.0)
    analyzed_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-analyzed_at']
    
    def __str__(self):
        return f"Frame {self.id} at {self.analyzed_at}"
