"""
Voice Command View — processes transcribed user speech and returns a
context-aware Gemini response. The model is told which mode the user
is in (navigation or horizon) so it responds appropriately.
"""

import logging
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response
from rest_framework import status
from .services import get_navigation_service
from .throttling import AnalyzeFrameAnonThrottle

logger = logging.getLogger(__name__)

# Short mode-aware system prompt snippets
MODE_CONTEXT = {
    'navigation': (
        "You are Dira, an AR navigation guide. The user is navigating on foot with their phone camera raised. "
        "Respond helpfully and concisely to their spoken question. Prioritize safety, direction, and nearby landmarks. "
        "Speak naturally — your words will be read aloud by the device."
    ),
    'horizon': (
        "You are Dira, an AR horizon explorer. The user is looking at the sky or horizon, scanning for distant landmarks, "
        "labeled locations, mountains, cities, and points of interest. "
        "Respond with interesting and relevant information about what they might be seeing. "
        "Speak naturally — your words will be read aloud by the device."
    ),
}

AMBIENT_GREETINGS = {
    'navigation': [
        "Navigation mode active. I'm analyzing your surroundings and ready to guide you.",
        "Camera is online. I'll let you know when I detect your environment.",
        "Ready to navigate. Point your camera ahead and I'll guide the way.",
    ],
    'horizon': [
        "Horizon mode active. Scan the skyline and I'll identify landmarks around you.",
        "Exploring your horizon. I can describe cities, mountains, and points of interest nearby.",
        "Horizon scan ready. Rotate slowly and I'll tell you what's around you.",
    ],
}


@api_view(['POST'])
@throttle_classes([AnalyzeFrameAnonThrottle])
def voice_command(request):
    """
    Process transcribed user speech and return a Gemini text response.

    Request body:
        transcript (str): The transcribed speech from the user.
        mode (str): 'navigation' or 'horizon'.
        latitude (float, optional): User latitude.
        longitude (float, optional): User longitude.
        heading (float, optional): User compass heading.
        thought_signature (str, optional): Agentic loop context.
    """
    transcript = request.data.get('transcript', '').strip()
    mode = request.data.get('mode', 'navigation')
    latitude = request.data.get('latitude')
    longitude = request.data.get('longitude')
    heading = request.data.get('heading', 0)
    thought_signature = request.data.get('thought_signature')

    if not transcript:
        return Response(
            {'error': 'transcript is required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    logger.info(f"[VoiceCommand] mode={mode} transcript='{transcript}' lat={latitude} lon={longitude}")

    # Build location string for context if available
    location_context = ''
    if latitude and longitude:
        location_context = f"The user is at coordinates ({latitude:.5f}, {longitude:.5f}), heading {heading:.0f}°."

    system_context = MODE_CONTEXT.get(mode, MODE_CONTEXT['navigation'])
    full_prompt = (
        f"{system_context}\n\n"
        f"{location_context}\n\n"
        f"User says: \"{transcript}\"\n\n"
        "Respond in 1-3 short, natural sentences."
    )

    try:
        nav_service = get_navigation_service()

        # Use the Gemini client directly via the service's generate method
        response_text = nav_service.generate_voice_response(
            prompt=full_prompt,
            thought_signature=thought_signature
        )

        logger.info(f"[VoiceCommand] Gemini response: {response_text[:80]}...")

        return Response({
            'response': response_text,
            'mode': mode,
        }, status=status.HTTP_200_OK)

    except Exception as e:
        logger.error(f"[VoiceCommand] Error: {e}", exc_info=True)
        return Response(
            {'error': str(e), 'response': "Sorry, I couldn't process that. Please try again."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
def get_ambient_greeting(request):
    """
    Returns a mode-aware ambient greeting for the app startup or mode switch.
    Used to make the app feel alive even before the first frame is analyzed.

    Query params:
        mode (str): 'navigation' or 'horizon'
        idx (int, optional): which greeting index to use (cycles through list)
    """
    mode = request.GET.get('mode', 'navigation')
    idx = int(request.GET.get('idx', 0))

    greetings = AMBIENT_GREETINGS.get(mode, AMBIENT_GREETINGS['navigation'])
    greeting = greetings[idx % len(greetings)]

    return Response({'greeting': greeting, 'mode': mode})
