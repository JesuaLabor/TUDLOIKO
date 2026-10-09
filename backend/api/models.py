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

class StoryBankItem(models.Model):
    title = models.CharField(max_length=255)
    situation = models.TextField(blank=True, default='')
    task = models.TextField(blank=True, default='')
    action = models.TextField(blank=True, default='')
    result = models.TextField(blank=True, default='')
    tags = models.JSONField(default=list, blank=True)
    metrics = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title

class JobApplication(models.Model):
    company_name = models.CharField(max_length=255)
    position = models.CharField(max_length=255)
    job_description = models.TextField(blank=True, default='')
    resume = models.TextField(blank=True, default='')
    predicted_questions = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=50, default='Applied')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.position} at {self.company_name}"

class InterviewSession(models.Model):
    job_application = models.ForeignKey(JobApplication, on_delete=models.SET_NULL, null=True, blank=True, related_name='sessions')
    title = models.CharField(max_length=250, default='Interview Session')
    session_type = models.CharField(max_length=50, default='Live Interview')
    created_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True, default='')
    total_fillers = models.IntegerField(default=0)
    avg_wpm = models.FloatField(default=0.0)

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

class InterviewDebrief(models.Model):
    session = models.OneToOneField(InterviewSession, on_delete=models.CASCADE, related_name='debrief')
    overall_score = models.IntegerField(default=0)
    executive_summary = models.TextField(blank=True, default='')
    question_reviews = models.JSONField(default=list, blank=True)
    thank_you_email_draft = models.TextField(blank=True, default='')
    follow_up_questions = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Debrief for {self.session.title} (Score: {self.overall_score})"
