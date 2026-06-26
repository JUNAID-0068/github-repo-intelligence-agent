# GitHub Intelligence

## Setup Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload

## Setup Frontend  
cd frontend
npm install
npm run dev

## Environment Variables (backend/.env)
GROQ_API_KEY=
DATABASE_URL=
CHROMA_PERSIST_DIR=./chroma_db
REPOS_TEMP_DIR=/tmp/repos

## Test Backend
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{"repo_url": "https://github.com/fastapi/fastapi"}'
