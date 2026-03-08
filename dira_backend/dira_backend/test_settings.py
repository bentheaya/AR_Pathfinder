"""
Test-only Django settings for Dira Backend.
Overrides the main settings to use SQLite + dummy cache (no PostGIS, no Redis).
Run with: python manage.py test --settings=dira_backend.test_settings
"""

from .settings import *  # noqa

# GDAL / GEOS paths for Windows
import platform
import os
if platform.system() == 'Windows':
    gdal_path = r'C:\Program Files\GDAL'
    if gdal_path not in os.environ['PATH']:
        os.environ['PATH'] = gdal_path + ';' + os.environ['PATH']
    GDAL_LIBRARY_PATH = os.path.join(gdal_path, 'gdal.dll')
    GEOS_LIBRARY_PATH = os.path.join(gdal_path, 'geos_c.dll')

# Disable database creation for tests (these unit tests don't hit the DB)
from django.test.runner import DiscoverRunner
class NoDbTestRunner(DiscoverRunner):
    def setup_databases(self, **kwargs): pass
    def teardown_databases(self, old_config, **kwargs): pass
TEST_RUNNER = 'dira_backend.test_settings.NoDbTestRunner'

# ─── Override DB: Use plain SQLite instead of PostGIS ───────────────────────
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}

# ─── Override INSTALLED_APPS: Remove django.contrib.gis (needs GDAL/GEOS) ───
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # 'django.contrib.gis',  # ← DISABLED (requires GDAL/GEOS/PostGIS)
    'rest_framework',
    'corsheaders',
    'navigation.apps.NavigationConfig',
]

# ─── Override Cache: Use dummy cache instead of Redis ────────────────────────
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.dummy.DummyCache',
    }
}

# ─── Session: Use DB-backed sessions (not cache) ────────────────────────────
SESSION_ENGINE = 'django.contrib.sessions.backends.db'

# ─── Disable result caching during tests ─────────────────────────────────────
ENABLE_RESULT_CACHING = False

# ─── Gemini: Placeholder key (tests mock the client) ─────────────────────────
GEMINI_API_KEY = 'test-placeholder-key'

# ─── Use a predictable secret key ────────────────────────────────────────────
SECRET_KEY = 'django-test-only-secret-key-not-for-production'

# ─── Speed up password hashing in tests ──────────────────────────────────────
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']

# ─── Logging: suppress during tests ─────────────────────────────────────────
LOGGING = {
    'version': 1,
    'disable_existing_loggers': True,
    'handlers': {'null': {'class': 'logging.NullHandler'}},
    'root': {'handlers': ['null']},
}
