# Dira: The Digital Pathfinder

AR Navigation app using Django (Backend) and React (Frontend) with Three.js for 3D/AR rendering.

## Project Structure

```
/dira_backend/   - Django REST API with PostGIS support
/dira_frontend/  - React/Vite frontend with Three.js AR
/shared/         - Shared types and schema definitions
```

## Setup Instructions

### Backend (Django)

1. Install system dependencies:
   ```bash
   sudo apt install python3.12-venv postgresql postgresql-contrib postgis
   ```

2. Create and activate virtual environment:
   ```bash
   cd dira_backend
   python3 -m venv venv
   source venv/bin/activate
   ```

3. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure environment:
   - Copy the backend environment template and configure your settings
   - Set up PostgreSQL database with PostGIS extension

5. Run migrations and start server:
   ```bash
   python manage.py migrate
   python manage.py runserver
   ```

### Frontend (React)

1. Install dependencies:
   ```bash
   cd dira_frontend
   npm install
   ```

2. Configure environment:
   - Copy the frontend environment template

3. Start development server:
   ```bash
   npm run dev
   ```

## Features

- **AR Navigation**: Real-time pathfinding with 3D arrow overlays
- **PostGIS Integration**: Spatial queries for location-based navigation
- **PWA Support**: Offline-first architecture
- **Human-Centric UI**: Glassmorphic design optimized for outdoor use

## API Endpoints

- `/api/v1/analyze-frame/` - Receives base64 images with GPS/compass metadata
