# Gemini 3 Neural Core - Implementation Guide

## Overview

The Dira navigation system now includes AI-powered frame analysis using Google's Gemini 3 v1alpha API. This "Neural Core" processes camera frames in real-time and provides human-centric navigation instructions while maintaining contextual memory through thought signatures.

---

## Architecture

### Components

1. **services.py** - `GeminiNavigationService` class
   - Handles all Gemini API interactions
   - Manages thought signatures for context retention
   - Provides fallback mechanisms

2. **views.py** - API endpoints
   - `/api/v1/analyze-frame/` - Real-time frame analysis
   - `/api/v1/offline-manifest/` - Pre-fetch landmarks for offline use

3. **Thought Signatures** - Contextual Memory
   - Remembers landmarks from previous frames
   - Maintains reasoning chain across requests
   - Prevents "forgetting" what was seen 10 seconds ago

---

## Key Features

### 1. Real-Time AI Navigation

```python
# Example Request
POST /api/v1/analyze-frame/
{
  "image": "base64_encoded_jpeg",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "heading": 45.0,
  "thought_signature": "previous_signature_if_available",
  "destination": "Golden Gate Park"
}

# Response
{
  "instructions": [{
    "direction": "right",
    "distance": 150.5,
    "message": "Turn right towards the yellow cafe building"
  }],
  "confidence": 0.85,
  "landmarks": ["Sunny's Cafe", "Market St", "City Hall"],
  "thought_signature": "new_signature_for_next_frame"
}
```

### 2. Optimized Gemini 3 Configuration

```python
# LOW thinking_level for real-time navigation (reduced latency)
thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW)

# LOW media_resolution to save tokens during active walking
media_resolution=types.MediaResolution.LOW

# Structured JSON output
response_mime_type='application/json'

# Low temperature for consistent navigation
temperature=0.3
```

### 3. Offline Manifest System

Pre-download visual cues for offline navigation:

```python
# Request with AI-generated cues
GET /api/v1/offline-manifest/?lat=37.7749&lon=-122.4194&radius=1000&generate_cues=true

# Response
{
  "landmarks": [
    {
      "id": 1,
      "name": "Golden Gate Park",
      "coords": [37.7694, -122.4862],
      "description": "Large urban park",
      "distance": 524.3,
      "visual_cue": "Look for green trees and the park entrance sign",
      "approach_hint": "Head west from Market Street"
    }
  ],
  "count": 12,
  "center": [37.7749, -122.4194],
  "radius_meters": 1000
}
```

---

## Optimizations Implemented

### Error Handling
- ✅ Graceful fallback to geometric navigation if AI fails
- ✅ Validates and fixes incomplete AI responses
- ✅ Comprehensive logging for debugging
- ✅ Safe defaults for all fields

### Performance
- ✅ `LOW` thinking level for sub-second responses
- ✅ `LOW` media resolution for bandwidth efficiency
- ✅ Single-instance service pattern (global cache)
- ✅ Optional frame storage (privacy-conscious)

### Context Retention
- ✅ Thought signatures maintain reasoning chain
- ✅ AI remembers previously seen landmarks
- ✅ Destination-aware prompts
- ✅ Heading-based spatial reasoning

---

## Configuration

### 1. Install Dependencies

```bash
cd dira_backend
source venv/bin/activate
pip install -r requirements.txt  # includes google-genai>=0.3.0
```

### 2. Set Gemini API Key

Update your `.env` file:

```bash
GEMINI_API_KEY=your-actual-gemini-api-key-here
```

Get your API key from: https://aistudio.google.com/apikey

### 3. Test the Integration

```python
# Test basic service
from navigation.services import get_navigation_service

service = get_navigation_service()
print(f"Service initialized: {service.client is not None}")
```

---

## Usage Examples

### Frontend Integration

```typescript
// Send frame with thought signature
const analyzeFrame = async (imageBase64: string, thoughtSignature?: string) => {
  const response = await fetch('/api/v1/analyze-frame/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: imageBase64,
      latitude: currentLocation.lat,
      longitude: currentLocation.lon,
      heading: compassHeading,
      thought_signature: thoughtSignature,  // From previous frame
      destination: "City Hall"
    })
  });
  
  const data = await response.json();
  
  // Store thought signature for next frame
  setThoughtSignature(data.thought_signature);
  
  return data;
};
```

### Download Offline Manifest

```typescript
// Pre-fetch for offline use
const downloadOfflineManifest = async () => {
  const response = await fetch(
    `/api/v1/offline-manifest/?lat=${lat}&lon=${lon}&radius=1000&generate_cues=true`
  );
  
  const manifest = await response.json();
  
  // Store in IndexedDB for offline access
  await storeInIndexedDB('landmarks', manifest.landmarks);
};
```

---

## Advanced Features

### Route Pre-Analysis

The service can analyze an entire route ahead of time:

```python
from navigation.services import get_navigation_service

service = get_navigation_service()
result = service.analyze_route_ahead(
    waypoints=[
        {'name': 'Start', 'lat': 37.7749, 'lon': -122.4194},
        {'name': 'Midpoint', 'lat': 37.7750, 'lon': -122.4195},
        {'name': 'End', 'lat': 37.7751, 'lon': -122.4196}
    ],
    user_location=(37.7749, -122.4194)
)

# Returns visual cues for each waypoint
```

---

## API Endpoints Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/analyze-frame/` | POST | Real-time AI frame analysis |
| `/api/v1/offline-manifest/` | GET | Pre-fetch landmarks for offline |
| `/api/v1/waypoints/` | GET | List all waypoints |
| `/api/v1/waypoints/nearby/` | GET | Find nearby waypoints (PostGIS) |

---

## Logging

Logs are configured for debugging:

```python
# In Django settings
LOGGING = {
    'loggers': {
        'navigation': {
            'level': 'DEBUG',  # See detailed AI interactions
        },
    },
}
```

Check logs for:
- AI request/response details
- Fallback triggers
- Error traces
- Performance metrics

---

## Next Steps

1. **Get Gemini API Key**: https://aistudio.google.com/apikey
2. **Update `.env`**: Add `GEMINI_API_KEY=...`
3. **Install dependencies**: `pip install -r requirements.txt`
4. **Test endpoint**: Use Postman or curl
5. **Integrate frontend**: Pass thought signatures between frames

---

## Troubleshooting

### "Gemini client not initialized"
- Check if `GEMINI_API_KEY` is set in `.env`
- Verify API key is valid
- Restart Django server after updating `.env`

### AI responses are slow
- Use `thinking_level=LOW` (already configured)
- Reduce image resolution before base64 encoding
- Consider caching for repeated frames

### Thought signatures not working
- Verify frontend sends `thought_signature` in request
- Check response includes new signature
- Ensure signature is stored and reused

---

## Production Recommendations

1. **Rate Limiting**: Add API rate limits for analyze-frame endpoint
2. **Image Compression**: Reduce base64 image size before sending
3. **Caching**: Cache results for similar locations/headings
4. **Monitoring**: Track AI latency and failure rates
5. **Fallback Quality**: Improve geometric navigation for offline scenarios
