#!/bin/bash
# Setup script for Dira backend

set -e

echo "=== Dira Backend Setup ==="
echo ""

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

echo ""
echo "Checking for .env file..."
if [ ! -f ".env" ]; then
    echo "Creating .env from template..."
    cp .env.template .env
    echo "⚠️  Please edit .env and configure your database credentials!"
else
    echo "✓ .env file already exists"
fi

echo ""
echo "=== Next Steps ==="
echo "1. Configure PostgreSQL database:"
echo "   sudo -u postgres createuser dira_user"
echo "   sudo -u postgres createdb -O dira_user dira_db"
echo "   sudo -u postgres psql -d dira_db -c 'CREATE EXTENSION postgis;'"
echo ""
echo "2. Update .env with your database password"
echo ""
echo "3. Run migrations:"
echo "   source venv/bin/activate"
echo "   python manage.py migrate"
echo ""
echo "4. Create superuser (optional):"
echo "   python manage.py createsuperuser"
echo ""
echo "5. Start development server:"
echo "   python manage.py runserver"
echo ""
