import os
import django
import glob

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'dira_backend.settings')
django.setup()

from django.db import connection

# Drop tables and migration history
with connection.cursor() as c:
    c.execute('DROP TABLE IF EXISTS navigation_frameanalysis CASCADE;')
    c.execute('DROP TABLE IF EXISTS navigation_navigationsession CASCADE;')
    c.execute('DROP TABLE IF EXISTS navigation_waypoint CASCADE;')
    c.execute("DELETE FROM django_migrations WHERE app='navigation';")

# Delete local migration files
migration_dir = os.path.join(os.path.dirname(__file__), 'navigation', 'migrations')
for f in glob.glob(os.path.join(migration_dir, '*.py')):
    if not f.endswith('__init__.py'):
        os.remove(f)

print("Tables dropped and migrations reset.")
