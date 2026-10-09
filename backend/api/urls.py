from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    health_check,
    CandidateProfileViewSet,
    StoryBankItemViewSet,
    JobApplicationViewSet,
    InterviewSessionViewSet,
    InterviewDebriefViewSet,
    gemini_proxy,
)

router = DefaultRouter()
router.register(r'profiles', CandidateProfileViewSet, basename='profile')
router.register(r'stories', StoryBankItemViewSet, basename='story')
router.register(r'applications', JobApplicationViewSet, basename='application')
router.register(r'sessions', InterviewSessionViewSet, basename='session')
router.register(r'debriefs', InterviewDebriefViewSet, basename='debrief')

urlpatterns = [
    path('health/', health_check, name='health-check'),
    path('copilot/chat/', gemini_proxy, name='gemini-proxy'),
    path('', include(router.urls)),
]
