import os
from rest_framework import viewsets, status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import CandidateProfile, InterviewSession, TranscriptEntryModel, SuggestionEntryModel
from .serializers import CandidateProfileSerializer, InterviewSessionSerializer, TranscriptEntrySerializer, SuggestionEntrySerializer
from google import genai

@api_view(['GET'])
def health_check(request):
    return Response({'status': 'ok', 'service': 'TUDLOIKO Backend', 'version': '1.0.0'})

class CandidateProfileViewSet(viewsets.ModelViewSet):
    queryset = CandidateProfile.objects.all()
    serializer_class = CandidateProfileSerializer

    def get_queryset(self):
        return CandidateProfile.objects.all().order_by('-updated_at')

class InterviewSessionViewSet(viewsets.ModelViewSet):
    queryset = InterviewSession.objects.all().order_by('-created_at')
    serializer_class = InterviewSessionSerializer

@api_view(['POST'])
def gemini_proxy(request):
    """
    Proxies Gemini API calls from backend using central API key.
    """
    prompt = request.data.get('prompt', '')
    api_key = request.data.get('api_key') or os.environ.get('GEMINI_API_KEY')

    if not api_key:
        return Response(
            {'error': 'Gemini API key must be provided in request or configured on server.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if not prompt:
        return Response({'error': 'Prompt text is required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        return Response({'response': response.text})
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
