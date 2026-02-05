"""
Gemini 3 Neural Core for Dira Navigation.
Handles AI-powered frame analysis with thought signatures for contextual memory.
"""

import base64
import json
import logging
from typing import Optional, Dict, Any, Tuple
from django.conf import settings
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)


class GeminiNavigationService:
    """
    Service class for Gemini 3 AI-powered navigation analysis.
    Uses thought signatures to maintain reasoning context across frames.
    """
    
    def __init__(self):
        """Initialize Gemini client with v1alpha API version."""
        try:
            self.client = genai.Client(
                api_key=settings.GEMINI_API_KEY,
                http_options={'api_version': 'v1alpha'}
            )
        except Exception as e:
            logger.error(f"Failed to initialize Gemini client: {e}")
            self.client = None
    
    def analyze_navigation_frame(
        self,
        image_b64: str,
        latitude: float,
        longitude: float,
        heading: float,
        thought_signature: Optional[str] = None,
        destination_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        The Brain of Dira. Processes a camera frame and returns structured AR instructions.
        
        Args:
            image_b64: Base64 encoded JPEG image data
            latitude: User's current latitude
            longitude: User's current longitude
            heading: Compass heading in degrees (0-360)
            thought_signature: Previous reasoning signature for context retention
            destination_name: Optional destination landmark name
            
        Returns:
            Dictionary containing:
                - data: Parsed JSON navigation instruction
                - thought_signature: New signature for next frame
                - error: Error message if processing failed
        """
        if not self.client:
            return {
                "error": "Gemini client not initialized. Check GEMINI_API_KEY in settings.",
                "data": self._get_fallback_response()
            }
        
        try:
            # 1. Decode and prepare image part
            image_bytes = base64.b64decode(image_b64)
            image_part = types.Part.from_bytes(
                data=image_bytes,
                mime_type='image/jpeg'
            )
            
            # 2. Build contextual prompt with destination awareness
            destination_context = (
                f" User is navigating to: '{destination_name}'." 
                if destination_name else ""
            )
            
            prompt = f"""You are Dira, a human-centric AR navigation assistant.{destination_context}

Current Context:
- Location: ({latitude:.6f}, {longitude:.6f})
- Heading: {heading:.1f}° (0°=North, 90°=East, 180°=South, 270°=West)

Task: Analyze the camera frame and provide navigation guidance using visible landmarks.

Requirements:
1. Identify visible local landmarks (buildings, signs, stores, street features)
2. Compare landmark positions to user's heading
3. Give clear walking directions using "human landmarks" - what they can actually see
4. Estimate bearing adjustment needed (positive = turn right, negative = turn left)
5. Detect if user appears lost or off-route

Return ONLY valid JSON (no markdown):
{{
  "instruction": "concise walking direction using visible landmarks",
  "bearing_adjustment": <integer degrees to adjust, -180 to 180>,
  "landmark_identified": "name of most prominent landmark visible",
  "confidence": <float 0.0-1.0>,
  "is_lost": <boolean>
}}

Example: {{"instruction": "Turn right towards the yellow cafe building", "bearing_adjustment": 45, "landmark_identified": "Sunny's Cafe", "confidence": 0.85, "is_lost": false}}"""

            # 3. Configure Gemini 3 with optimized settings
            config = types.GenerateContentConfig(
                # LOW thinking for real-time navigation (reduce latency)
                thinking_config=types.ThinkingConfig(
                    thinking_level=types.ThinkingLevel.LOW
                ),
                # LOW resolution to save tokens during active walking
                # Upgrade to MEDIUM if landmark detection is poor
                media_resolution=types.MediaResolution.LOW,
                response_mime_type='application/json',
                temperature=0.3,  # Lower temperature for consistent navigation
                response_modalities=['TEXT']
            )

            # 4. Generate content with thought signature continuity
            response = self.client.models.generate_content(
                model="gemini-3-flash-preview",
                contents=[image_part, prompt],
                config=config,
                thought_signature=thought_signature  # Maintains reasoning chain
            )

            # 5. Parse and validate response
            try:
                navigation_data = json.loads(response.text)
                
                # Validate required fields
                required_fields = ['instruction', 'bearing_adjustment', 'landmark_identified']
                if not all(field in navigation_data for field in required_fields):
                    logger.warning(f"Incomplete response from Gemini: {navigation_data}")
                    navigation_data = self._fill_missing_fields(navigation_data)
                
                return {
                    "data": navigation_data,
                    "thought_signature": response.thought_signature,
                    "success": True
                }
                
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse Gemini response as JSON: {e}")
                logger.debug(f"Raw response: {response.text}")
                return {
                    "error": "Invalid JSON response from AI",
                    "data": self._get_fallback_response(),
                    "thought_signature": response.thought_signature
                }
        
        except Exception as e:
            logger.error(f"Error during Gemini analysis: {e}", exc_info=True)
            return {
                "error": str(e),
                "data": self._get_fallback_response()
            }
    
    def analyze_route_ahead(
        self,
        waypoints: list,
        user_location: Tuple[float, float]
    ) -> Dict[str, Any]:
        """
        Pre-analyze an entire route to generate visual manifest for offline use.
        
        Args:
            waypoints: List of waypoint dictionaries with name, lat, lon
            user_location: Tuple of (latitude, longitude)
            
        Returns:
            Visual manifest with landmark cues for each waypoint
        """
        if not self.client:
            return {"error": "Gemini client not initialized"}
        
        try:
            # Build route context
            waypoint_list = "\n".join([
                f"- {w['name']}: ({w['lat']}, {w['lon']})"
                for w in waypoints
            ])
            
            prompt = f"""Generate visual navigation cues for offline AR navigation.

User Location: {user_location}

Route Waypoints:
{waypoint_list}

For each waypoint, provide:
1. Visual description of the location
2. Key landmarks to look for
3. Directional hints from previous waypoint

Return JSON array:
[
  {{
    "waypoint_name": "string",
    "visual_cue": "what to look for",
    "landmarks": ["landmark1", "landmark2"],
    "approach_hint": "how to approach from previous point"
  }}
]"""

            config = types.GenerateContentConfig(
                thinking_config=types.ThinkingConfig(
                    thinking_level=types.ThinkingLevel.MEDIUM  # Higher quality for route planning
                ),
                response_mime_type='application/json',
                temperature=0.5
            )

            response = self.client.models.generate_content(
                model="gemini-3-flash-preview",
                contents=[prompt],
                config=config
            )

            return {
                "data": json.loads(response.text),
                "success": True
            }
            
        except Exception as e:
            logger.error(f"Error analyzing route: {e}", exc_info=True)
            return {"error": str(e)}
    
    def analyze_horizon(
        self,
        image_b64: str,
        latitude: float,
        longitude: float,
        heading: float,
        visible_pois: list,
        thought_signature: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Analyze the horizon landscape to refine POI marker positioning.
        Uses Gemini 3 Vision to detect mountains, buildings, and skyline features
        that might occlude or affect the visual placement of AR markers.
        
        PERFORMANCE OPTIMIZATION: DEM pre-check to skip Gemini on flat terrain.
        
        Args:
            image_b64: Base64 encoded JPEG image of the horizon
            latitude: User's current latitude
            longitude: User's current longitude
            heading: Compass heading (0-360°)
            visible_pois: List of POI dictionaries with bearing, distance, name
            thought_signature: Previous reasoning signature for context
            
        Returns:
            Dictionary containing:
                - refined_pois: List of POIs with adjusted positions or occlusion flags
                - skyline_features: Detected landscape features
                - horizon_line_y: Estimated Y-coordinate of visual horizon (0-1)
                - thought_signature: New signature for next analysis
                - skipped_reason: If Gemini was skipped (performance optimization)
        """
        # 🚀 PERFORMANCE: DEM Pre-Check
        try:
            from .dem_service import should_skip_gemini_analysis
            should_skip, reason = should_skip_gemini_analysis(latitude, longitude)
            
            if should_skip:
                logger.info(f"⚡ Skipping Gemini analysis: {reason}")
                return {
                    "data": {
                        "horizon_line_y_percent": 50,
                        "skyline_features": [],
                        "refined_pois": visible_pois  # No refinement needed
                    },
                    "success": True,
                    "skipped_reason": reason
                }
        except ImportError:
            logger.warning("DEM service not available, proceeding with Gemini")
        except Exception as e:
            logger.warning(f"DEM pre-check failed: {e}, proceeding with Gemini")
        
        if not self.client:
            return {
                "error": "Gemini client not initialized",
                "refined_pois": visible_pois  # Return unmodified as fallback
            }
        
        try:
            # 1. Prepare image
            image_bytes = base64.b64decode(image_b64)
            image_part = types.Part.from_bytes(
                data=image_bytes,
                mime_type='image/jpeg'
            )
            
            # 2. Build POI context
            poi_summary = "\n".join([
                f"- {poi['name']} at {poi['bearing_degrees']:.1f}° ({poi['distance_meters']/1000:.1f}km)"
                for poi in visible_pois
            ])
            
            # 3. Construct semantic analysis prompt
            prompt = f"""You are analyzing a landscape photo for AR navigation horizon markers.

Current Context:
- Location: ({latitude:.6f}, {longitude:.6f})
- Camera Heading: {heading:.1f}° (0°=North, 90°=East, 180°=South, 270°=West)
- Field of View: ~90° horizontal

Visible POIs (Points of Interest) in this direction:
{poi_summary}

Task: Analyze the landscape to refine AR marker placement:

1. Identify major visual features:
   - Mountains/hills with estimated height
   - Buildings/skyscrapers
   - Trees/forest lines
   - Horizon line position (as Y% from bottom: 0-100)

2. For each POI, determine:
   - Is it visually occluded (behind mountain/building)?
   - Should its Y-position be adjusted based on skyline?
   - What bearing range does each obstacle occupy?

3. Recommend positioning:
   - "show": Display normally at calculated position
   - "hide": Behind obstacle, hide marker
   - "raise": Move higher to appear above skyline feature
   - "lower": Move lower (not blocked)

Return ONLY valid JSON:
{{
  "horizon_line_y_percent": <integer 0-100, % from bottom>,
  "skyline_features": [
    {{
      "type": "mountain|building|treeline",
      "bearing_start": <degrees>,
      "bearing_end": <degrees>,
      "estimated_height_degrees": <vertical angle above horizon>
    }}
  ],
  "refined_pois": [
    {{
      "name": "POI name",
      "original_bearing": <degrees>,
      "action": "show|hide|raise|lower",
      "y_adjustment": <float -1.0 to 1.0>,
      "reasoning": "brief explanation"
    }}
  ]
}}

Example: {{"horizon_line_y_percent": 45, "skyline_features": [{{"type": "mountain", "bearing_start": 80, "bearing_end": 110, "estimated_height_degrees": 15}}], "refined_pois": [{{"name": "Kisumu City", "original_bearing": 87, "action": "raise", "y_adjustment": 0.3, "reasoning": "Behind mountain range, raise above peaks"}}]}}"""

            # 4. Configure Gemini for visual analysis
            config = types.GenerateContentConfig(
                thinking_config=types.ThinkingConfig(
                    thinking_level=types.ThinkingLevel.MEDIUM  # Higher quality for landscape analysis
                ),
                media_resolution=types.MediaResolution.MEDIUM,  # Better for skyline detection
                response_mime_type='application/json',
                temperature=0.4,
                response_modalities=['TEXT']
            )
            
            # 5. Generate analysis
            response = self.client.models.generate_content(
                model="gemini-3-flash-preview",
                contents=[image_part, prompt],
                config=config,
                thought_signature=thought_signature
            )
            
            # 6. Parse and validate response
            try:
                analysis_data = json.loads(response.text)
                
                # Validate structure
                if 'refined_pois' not in analysis_data:
                    logger.warning("Missing refined_pois in horizon analysis")
                    analysis_data['refined_pois'] = visible_pois
                
                return {
                    "data": analysis_data,
                    "thought_signature": response.thought_signature,
                    "success": True
                }
                
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse horizon analysis JSON: {e}")
                logger.debug(f"Raw response: {response.text}")
                return {
                    "error": "Invalid JSON from horizon analysis",
                    "refined_pois": visible_pois,
                    "thought_signature": response.thought_signature
                }
        
        except Exception as e:
            logger.error(f"Horizon analysis error: {e}", exc_info=True)
            return {
                "error": str(e),
                "refined_pois": visible_pois  # Safe fallback
            }
    
    def generate_turn_guidance(
        self,
        user_heading: float,
        target_bearing: float,
        distance_m: float,
        poi_name: str
    ) -> Dict[str, Any]:
        """
        Generate natural voice guidance for turning to face a POI.
        
        This is the heart of the "Guided Pivot" experience - Gemini 3 provides
        warm, encouraging guidance as the user rotates to face the target.
        
        Args:
            user_heading: Current device heading (0-360°)
            target_bearing: Target POI bearing (0-360°)
            distance_m: Distance to POI in meters
            poi_name: Name of the POI
            
        Returns:
            {
                "text": "Turn about 45 degrees to your left... keep going!",
                "alignment_status": "turning_left|turning_right|aligned",
                "turn_degrees": -45.2 (negative = turn right, positive = turn left)
            }
        """
        if not self.client:
            return {
                "error": "Gemini client not initialized",
                "text": "Turn to face the target",
                "alignment_status": "unknown",
                "turn_degrees": 0
            }
        
        # Calculate turn direction and amount
        heading_diff = (target_bearing - user_heading + 360) % 360
        
        # Normalize to -180 to 180 (negative = turn right, positive = turn left)
        if heading_diff > 180:
            heading_diff = heading_diff - 360
        
        turn_amount = abs(heading_diff)
        
        # Determine alignment status
        if turn_amount < 5:
            status = "aligned"
        elif heading_diff < 0:
            status = "turning_right"
        else:
            status = "turning_left"
        
        # Convert distance for natural language
        distance_km = distance_m / 1000
        
        # Special case: already aligned
        if status == "aligned":
            if distance_km < 1:
                text = f"Perfect! {poi_name} is about {int(distance_m)} meters straight ahead."
            else:
                text = f"Perfect! {poi_name} is about {distance_km:.1f} kilometers straight ahead."
            
            return {
                "text": text,
                "alignment_status": status,
                "turn_degrees": heading_diff
            }
        
        # Build contextual prompt for Gemini 3
        direction = "left" if heading_diff > 0 else "right"
        
        prompt = f"""You are a warm, encouraging AR navigation guide helping someone find "{poi_name}".

Current situation:
- They need to turn {turn_amount:.0f}° {direction}
- The target is {distance_km:.1f} km away
- Status: {status}

Generate a SHORT, natural voice guidance (max 12 words):
- Be conversational and warm ("Turn about {turn_amount:.0f}° to your {direction}... keep going!")
- Use encouraging language
- Don't mention technical terms like "degrees" unless necessary
- Keep it brief for real-time feedback

Return ONLY the guidance text, nothing else."""

        try:
            # Generate with Gemini 3
            response = self.client.models.generate_content(
                model="gemini-2.0-flash-exp",
                contents=[prompt],
                config=types.GenerateContentConfig(
                    thinking_config=types.ThinkingConfig(
                        thinking_level=types.ThinkingLevel.LOW  # Fast for real-time
                    ),
                    temperature=0.7,  # Natural variation
                    response_modalities=['TEXT']
                )
            )
            
            guidance_text = response.text.strip()
            
            return {
                "text": guidance_text,
                "alignment_status": status,
                "turn_degrees": round(heading_diff, 2)
            }
            
        except Exception as e:
            logger.error(f"Turn guidance generation error: {e}")
            
            # Fallback to template-based guidance
            fallback_text = f"Turn {direction} about {turn_amount:.0f} degrees"
            
            return {
                "text": fallback_text,
                "alignment_status": status,
                "turn_degrees": round(heading_diff, 2)
            }

    
    @staticmethod
    def _get_fallback_response() -> Dict[str, Any]:
        """Return safe fallback navigation instruction when AI fails."""
        return {
            "instruction": "Continue forward - AI navigation temporarily unavailable",
            "bearing_adjustment": 0,
            "landmark_identified": "Unknown",
            "confidence": 0.0,
            "is_lost": False
        }
    
    @staticmethod
    def _fill_missing_fields(data: Dict[str, Any]) -> Dict[str, Any]:
        """Fill in any missing required fields with safe defaults."""
        defaults = {
            "instruction": "Continue forward",
            "bearing_adjustment": 0,
            "landmark_identified": "Unknown",
            "confidence": 0.5,
            "is_lost": False
        }
        return {**defaults, **data}


# Global service instance
_navigation_service = None

def get_navigation_service() -> GeminiNavigationService:
    """Get or create the global navigation service instance."""
    global _navigation_service
    if _navigation_service is None:
        _navigation_service = GeminiNavigationService()
    return _navigation_service
