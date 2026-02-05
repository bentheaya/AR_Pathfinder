from rest_framework import serializers
from .models import Waypoint, NavigationSession, FrameAnalysis


class WaypointSerializer(serializers.ModelSerializer):
    latitude = serializers.SerializerMethodField()
    longitude = serializers.SerializerMethodField()
    
    class Meta:
        model = Waypoint
        fields = ['id', 'name', 'description', 'latitude', 'longitude', 'created_at']
    
    def get_latitude(self, obj):
        return obj.location.y if obj.location else None
    
    def get_longitude(self, obj):
        return obj.location.x if obj.location else None


class FrameAnalysisSerializer(serializers.Serializer):
    """Serializer for incoming frame analysis requests"""
    image = serializers.CharField(help_text="Base64 encoded image string")
    latitude = serializers.FloatField()
    longitude = serializers.FloatField()
    heading = serializers.FloatField(help_text="Compass heading in degrees")
    accuracy = serializers.FloatField(required=False, default=0.0)
    
    def validate_image(self, value):
        """Validate base64 image format"""
        if not value or len(value) < 100:
            raise serializers.ValidationError("Invalid image data")
        return value
    
    def validate_heading(self, value):
        """Validate heading is between 0-360 degrees"""
        if not (0 <= value <= 360):
            raise serializers.ValidationError("Heading must be between 0 and 360 degrees")
        return value


class NavigationInstructionSerializer(serializers.Serializer):
    """Serializer for navigation instruction responses"""
    direction = serializers.ChoiceField(choices=['forward', 'left', 'right', 'turn-around'])
    distance = serializers.FloatField(help_text="Distance in meters")
    message = serializers.CharField()


class AnalyzeFrameResponseSerializer(serializers.Serializer):
    """Serializer for frame analysis response"""
    instructions = NavigationInstructionSerializer(many=True)
    confidence = serializers.FloatField()
    landmarks = serializers.ListField(child=serializers.CharField())
    session_id = serializers.IntegerField(required=False)
