from rest_framework import serializers
from .models import (
    CandidateProfile,
    StoryBankItem,
    JobApplication,
    InterviewSession,
    TranscriptEntryModel,
    SuggestionEntryModel,
    InterviewDebrief,
)

class CandidateProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = CandidateProfile
        fields = ['id', 'title', 'position', 'company_info', 'job_description', 'resume', 'created_at', 'updated_at']

class StoryBankItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = StoryBankItem
        fields = ['id', 'title', 'situation', 'task', 'action', 'result', 'tags', 'metrics', 'created_at', 'updated_at']

class TranscriptEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = TranscriptEntryModel
        fields = ['id', 'session', 'speaker', 'text', 'timestamp']

class SuggestionEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = SuggestionEntryModel
        fields = ['id', 'session', 'text', 'timestamp']

class InterviewDebriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = InterviewDebrief
        fields = [
            'id', 'session', 'overall_score', 'executive_summary',
            'question_reviews', 'thank_you_email_draft', 'follow_up_questions', 'created_at'
        ]

class InterviewSessionSerializer(serializers.ModelSerializer):
    transcripts = TranscriptEntrySerializer(many=True, read_only=True)
    suggestions = SuggestionEntrySerializer(many=True, read_only=True)
    debrief = InterviewDebriefSerializer(read_only=True)

    class Meta:
        model = InterviewSession
        fields = [
            'id', 'title', 'job_application', 'session_type', 'created_at',
            'notes', 'total_fillers', 'avg_wpm', 'transcripts', 'suggestions', 'debrief'
        ]

class JobApplicationSerializer(serializers.ModelSerializer):
    sessions = InterviewSessionSerializer(many=True, read_only=True)

    class Meta:
        model = JobApplication
        fields = [
            'id', 'company_name', 'position', 'job_description', 'resume',
            'predicted_questions', 'status', 'created_at', 'updated_at', 'sessions'
        ]
