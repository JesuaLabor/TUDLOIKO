from django.db import models

class CandidateProfile(models.Model):
    title = models.CharField(max_length=200, default='Default Profile')
    position = models.CharField(max_length=250, blank=True, default='')
    company_info = models.TextField(blank=True, default='')
    job_description = models.TextField(blank=True, default='')
    resume = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.title} ({self.position or 'No role specified'})"

class InterviewSession(models.Model):
    title = models.CharField(max_length=250, default='Interview Session')
    created_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True, default='')

    def __str__(self):
        return f"{self.title} - {self.created_at.strftime('%Y-%m-%d %H:%M')}"

class TranscriptEntryModel(models.Model):
    session = models.ForeignKey(InterviewSession, on_delete=models.CASCADE, related_name='transcripts', null=True, blank=True)
    speaker = models.CharField(max_length=50, default='unknown')
    text = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)

class SuggestionEntryModel(models.Model):
    session = models.ForeignKey(InterviewSession, on_delete=models.CASCADE, related_name='suggestions', null=True, blank=True)
    text = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)
