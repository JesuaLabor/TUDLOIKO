from rest_framework import serializers
from .models import CandidateProfile, InterviewSession, TranscriptEntryModel, SuggestionEntryModel

class CandidateProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = CandidateProfile
        fields = ['id', 'title', 'position', 'company_info', 'job_description', 'resume', 'created_at', 'updated_at']

class TranscriptEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = TranscriptEntryModel
        fields = ['id', 'session', 'speaker', 'text', 'timestamp']

class SuggestionEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = SuggestionEntryModel
        fields = ['id', 'session', 'text', 'timestamp']

class InterviewSessionSerializer(serializers.ModelSerializer):
    transcripts = TranscriptEntrySerializer(many=True, read_only=True)
    suggestions = SuggestionEntrySerializer(many=True, read_only=True)

    class Meta:
        model = InterviewSession
        fields = ['id', 'title', 'created_at', 'notes', 'transcripts', 'suggestions']
