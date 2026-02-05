@api_view(['POST'])
@throttle_classes([BurstAnalyzeFrameThrottle, AnalyzeFrameAnonThrottle])
def analyze_horizon(request):
    """
    Gemini 3 Semantic Horizon Analysis.
    Analyzes landscape to detect visual occlusions and refine POI marker positioning.
    """
    # Validate request data
    required_fields = ['image', 'latitude', 'longitude', 'heading', 'visible_pois']
    missing_fields = [field for field in required_fields if field not in request.data]
    
    if missing_fields:
        return Response(
            {"error": f"Missing required fields: {', '.join(missing_fields)}"},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        # Extract and validate data
        image_b64 = request.data.get('image')
        latitude = float(request.data.get('latitude'))
        longitude = float(request.data.get('longitude'))
        heading = float(request.data.get('heading'))
        visible_pois = request.data.get('visible_pois', [])
        thought_signature = request.data.get('thought_signature')
        
        # Get navigation service
        nav_service = get_navigation_service()
        
        # Perform horizon analysis
        result = nav_service.analyze_horizon(
            image_b64=image_b64,
            latitude=latitude,
            longitude=longitude,
            heading=heading,
            visible_pois=visible_pois,
            thought_signature=thought_signature
        )
        
        # Check for errors
        if 'error' in result and not result.get('success'):
            return Response(
                {
                    "error": result['error'],
                    "refined_pois": result.get('refined_pois', visible_pois)
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # Return successful analysis
        response_data = {
            "horizon_line_y_percent": result['data'].get('horizon_line_y_percent', 50),
            "skyline_features": result['data'].get('skyline_features', []),
            "refined_pois": result['data'].get('refined_pois', []),
            "thought_signature": result.get('thought_signature'),
            "success": True
        }
        
        return Response(response_data, status=status.HTTP_200_OK)
        
    except ValueError as e:
        return Response(
            {"error": f"Invalid numeric value: {str(e)}"},
            status=status.HTTP_400_BAD_REQUEST
        )
    except Exception as e:
        logger.error(f"Unexpected error in horizon analysis: {e}", exc_info=True)
        return Response(
            {
                "error": "Internal server error during horizon analysis",
                "refined_pois": request.data.get('visible_pois', [])
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
