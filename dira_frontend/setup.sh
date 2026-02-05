#!/bin/bash
# Setup script for Dira frontend

set -e

echo "=== Dira Frontend Setup ==="
echo ""

echo "Installing Node.js dependencies..."
npm install

echo ""
echo "Checking for .env file..."
if [ ! -f ".env" ]; then
    echo "Creating .env from template..."
    cp .env.template .env
    echo "✓ .env created"
else
    echo "✓ .env file already exists"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Start development server:"
echo "   npm run dev"
echo ""
echo "2. Build for production:"
echo "   npm run build"
echo ""
echo "3. Preview production build:"
echo "   npm run preview"
echo ""
