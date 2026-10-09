import os
import json
import re
from rest_framework import viewsets, status
from rest_framework.decorators import api_view, action
from rest_framework.response import Response
from google import genai
from .models import (
    CandidateProfile,
    StoryBankItem,
    JobApplication,
    InterviewSession,
    TranscriptEntryModel,
    SuggestionEntryModel,
    InterviewDebrief,
)
from .serializers import (
    CandidateProfileSerializer,
    StoryBankItemSerializer,
    JobApplicationSerializer,
    InterviewSessionSerializer,
    TranscriptEntrySerializer,
    SuggestionEntrySerializer,
    InterviewDebriefSerializer,
)

def get_gemini_client(api_key=None):
    key = api_key or os.environ.get('GEMINI_API_KEY') or os.environ.get('VITE_GEMINI_API_KEY')
    if not key:
        return None
    return genai.Client(api_key=key)

def clean_json_text(text: str) -> str:
    """Strip markdown code fence blocks if Gemini returns ```json ... ```"""
    text = text.strip()
    if text.startswith('```'):
        text = re.sub(r'^```(?:json)?\s*', '', text)
        text = re.sub(r'\s*```$', '', text)
    return text.strip()

@api_view(['GET'])
def health_check(request):
    return Response({'status': 'ok', 'service': 'TUDLOIKO Backend', 'version': '1.1.0'})

class CandidateProfileViewSet(viewsets.ModelViewSet):
    queryset = CandidateProfile.objects.all().order_by('-updated_at')
    serializer_class = CandidateProfileSerializer

class StoryBankItemViewSet(viewsets.ModelViewSet):
    queryset = StoryBankItem.objects.all().order_by('-updated_at')
    serializer_class = StoryBankItemSerializer

    @action(detail=False, methods=['post'])
    def refine(self, request):
        """
        Takes raw notes/experience and uses Gemini to refine into STAR format with tags & metrics.
        """
        raw_notes = request.data.get('raw_notes', '')
        title_hint = request.data.get('title', '')
        client = get_gemini_client(request.data.get('api_key'))

        if not client:
            return Response({'error': 'Gemini API key is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not raw_notes:
            return Response({'error': 'raw_notes is required.'}, status=status.HTTP_400_BAD_REQUEST)

        prompt = f"""
You are TUDLOIKO Career Coach. Transform the following raw career experience notes into a structured STAR-method interview story.

User's raw notes:
"{raw_notes}"
Title hint: "{title_hint}"

Return a valid JSON object ONLY with this exact schema (no markdown fences, no extra text):
{{
  "title": "Short punchy story title (e.g., Scaling Payment Processing Under High Traffic)",
  "situation": "Concise situation and context (1-2 sentences)",
  "task": "The specific responsibility or challenge faced (1-2 sentences)",
  "action": "Key actions taken, leadership shown, or technologies used (2-3 sentences)",
  "result": "Quantifiable outcomes, metrics, or positive impact (1-2 sentences)",
  "tags": ["skill1", "skill2", "skill3"],
  "metrics": ["metric or key achievement (e.g. 40% latency reduction)"]
}}
"""
        try:
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
            )
            data = json.loads(clean_json_text(response.text))
            return Response(data)
        except Exception as e:
            return Response({'error': f'Failed to refine story: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class JobApplicationViewSet(viewsets.ModelViewSet):
    queryset = JobApplication.objects.all().order_by('-updated_at')
    serializer_class = JobApplicationSerializer

    @action(detail=True, methods=['post'])
    def predict_questions(self, request, pk=None):
        """
        Analyzes the Job Description and candidate resume to predict interview questions.
        """
        application = self.get_object()
        client = get_gemini_client(request.data.get('api_key'))

        if not client:
            return Response({'error': 'Gemini API key is required.'}, status=status.HTTP_400_BAD_REQUEST)

        prompt = f"""
You are TUDLOIKO AI Interview Prep Coach. Analyze the following target job role and candidate background:

Role: {application.position} at {application.company_name}
Job Description:
{application.job_description or "General software engineering/professional role"}

Candidate Resume:
{application.resume or "Not provided"}

Predict 8-12 highly probable, high-impact interview questions categorized by type.
Return a valid JSON array ONLY (no markdown fences) containing objects with this exact schema:
[
  {{
    "id": "q1",
    "category": "Behavioral" | "Technical" | "Culture & Values" | "Situational",
    "question": "The specific question text",
    "intent": "Why the interviewer asks this / what they are evaluating",
    "recommended_star_points": [
      "Brief cue for Situation/Task",
      "Key Action to highlight",
      "Expected Result/Impact"
    ]
  }}
]
"""
        try:
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
            )
            questions = json.loads(clean_json_text(response.text))
            application.predicted_questions = questions
            application.save(update_fields=['predicted_questions', 'updated_at'])
            return Response(questions)
        except Exception as e:
            return Response({'error': f'Failed to predict questions: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class InterviewSessionViewSet(viewsets.ModelViewSet):
    queryset = InterviewSession.objects.all().order_by('-created_at')
    serializer_class = InterviewSessionSerializer

    @action(detail=False, methods=['post'])
    def match_story(self, request):
        """
        Given an interviewer's question, finds the best matching story from the user's Story Bank.
        """
        question = request.data.get('question', '')
        client = get_gemini_client(request.data.get('api_key'))
        stories = list(StoryBankItem.objects.all().values('id', 'title', 'situation', 'task', 'action', 'result', 'tags', 'metrics'))

        if not question or not stories:
            return Response({'matched_story': None, 'reason': 'No question provided or no stories in bank'})

        if not client:
            # Fallback simple keyword match
            first_story = stories[0]
            return Response({'matched_story': first_story, 'cue': f"Use your experience from: {first_story['title']}"})

        stories_summary = json.dumps([
            {'id': s['id'], 'title': s['title'], 'tags': s['tags'], 'result': s['result']}
            for s in stories
        ])

        prompt = f"""
Given this interview question:
"{question}"

And the candidate's available Story Bank entries:
{stories_summary}

Select the SINGLE best matching story that the candidate should use as their example.
Return a valid JSON object ONLY:
{{
  "story_id": <id of selected story>,
  "reason": "Brief 1-sentence reason why this story fits",
  "star_cue": "1-sentence STAR reminder tailored to this question"
}}
"""
        try:
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
            )
            result = json.loads(clean_json_text(response.text))
            story_id = result.get('story_id')
            matched = next((s for s in stories if s['id'] == story_id), stories[0])
            return Response({
                'matched_story': matched,
                'reason': result.get('reason', ''),
                'star_cue': result.get('star_cue', ''),
            })
        except Exception as e:
            return Response({'matched_story': stories[0], 'reason': 'Default fallback', 'error': str(e)})

    @action(detail=True, methods=['post'])
    def generate_debrief(self, request, pk=None):
        """
        Generates a post-interview debrief, answer-by-answer review, score, and thank-you email draft.
        """
        session = self.get_object()
        client = get_gemini_client(request.data.get('api_key'))

        if not client:
            return Response({'error': 'Gemini API key is required.'}, status=status.HTTP_400_BAD_REQUEST)

        transcripts = session.transcripts.all().order_by('timestamp')
        transcript_text = "\n".join([f"[{t.speaker}]: {t.text}" for t in transcripts])
        notes = session.notes or "None"

        prompt = f"""
You are TUDLOIKO AI Career Coach. Review this completed job interview session transcript and notes:

Session Title: {session.title}
Notes Taken by Candidate: {notes}
Transcript:
{transcript_text or "General interview discussion."}

Generate a comprehensive post-interview debrief. Return a valid JSON object ONLY (no markdown):
{{
  "overall_score": 85, // integer 1-100
  "executive_summary": "2-3 paragraph summary of how the interview went, strengths displayed, and overall tone.",
  "question_reviews": [
    {{
      "question": "Question asked by interviewer",
      "candidate_response_summary": "Summary of what applicant said",
      "strong_points": "What was articulate and clear",
      "areas_to_improve": "What was vague or could be framed better",
      "suggested_model_answer": "Concise bulleted STAR model answer"
    }}
  ],
  "thank_you_email_draft": "Subject: Thank you - [Position] Interview\\n\\nDear [Interviewer],\\n...",
  "follow_up_questions": [
    "Thoughtful question 1 to ask in follow-up",
    "Thoughtful question 2"
  ]
}}
"""
        try:
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
            )
            data = json.loads(clean_json_text(response.text))
            debrief, _ = InterviewDebrief.objects.update_or_create(
                session=session,
                defaults={
                    'overall_score': data.get('overall_score', 80),
                    'executive_summary': data.get('executive_summary', ''),
                    'question_reviews': data.get('question_reviews', []),
                    'thank_you_email_draft': data.get('thank_you_email_draft', ''),
                    'follow_up_questions': data.get('follow_up_questions', []),
                }
            )
            return Response(InterviewDebriefSerializer(debrief).data)
        except Exception as e:
            return Response({'error': f'Failed to generate debrief: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class InterviewDebriefViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = InterviewDebrief.objects.all().order_by('-created_at')
    serializer_class = InterviewDebriefSerializer

@api_view(['POST'])
def gemini_proxy(request):
    """
    Proxies general Gemini API calls from frontend.
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
