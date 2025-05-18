from pydantic import BaseModel
from fastapi import FastAPI
from ollama import AsyncClient
import sqlite3
import os
import uuid
from contextlib import contextmanager

# Global configuration
# Change this to use a different model (e.g., "llama3:8b", "mistral:7b", etc.)
MODEL_NAME = "qwen2.5:3b"

# Database setup
DB_FILE = "tmp/chat.db"
os.makedirs(os.path.dirname(DB_FILE), exist_ok=True)

@contextmanager
def get_db_connection():
    """Context manager for database connections"""
    conn = sqlite3.connect(DB_FILE)
    try:
        yield conn
    finally:
        conn.commit()
        conn.close()

# Initialize database
with get_db_connection() as conn:
    cursor = conn.cursor()

    # Create tables if they don't exist
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        role TEXT,
        content TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
    )
    ''')

REVIEW_PROMPT = """
You are a code tutor who helps students learn how to write better code. Your job is to evaluate a block of code that the user gives you and then annotate any lines that could be improved with a brief suggestion and the reason why you are making that suggestion. Only make suggestions when you feel the severity is enough that it will impact the readability and maintainability of the code. Be friendly with your suggestions and remember that these are students so they need gentle guidance. Format each suggestion as a single JSON object. It is not necessary to wrap your response in triple backticks. Here is an example of what your response should look like:

{ "line": 1, "suggestion": "I think you should use a for loop instead of a while loop. A for loop is more concise and easier to read." }{ "line": 12, "suggestion": "I think you should use a for loop instead of a while loop. A for loop is more concise and easier to read." }
"""

AUTO_COMPLETE_PROMPT = '''You are a code completion assistant. Your task is to provide a useful code completion at the cursor position.

Important rules:
1. DO NOT repeat code that already exists in the file - this is critical
2. Provide NEW code that would be helpful at the cursor position
3. Make sure your completion is syntactically correct and follows the style of the existing code
4. Only provide the completion text that should be inserted, not the entire line
5. Do not include any explanations, comments, or markdown formatting in your response
6. Your response should be ready to insert directly at the cursor position
7. Your completion should continue from exactly where the cursor is positioned
8. If you can't provide a useful completion, return an empty string
9. Be concise but helpful - provide just what's needed to complete the current thought
10. Pay attention to indentation and code style of the existing code'''


class SuggestionInfo(BaseModel):
  line: int
  suggestion: str

class SuggestionList(BaseModel):
  suggestions: list[SuggestionInfo]


class ReviewRequest(BaseModel):
    prompt: str


class ReviewResponse(BaseModel):
    response: SuggestionList


class AutoCompleteRequest(BaseModel):
    code: str
    line_number: int
    character_position: int = 0


class AutoCompleteResponse(BaseModel):
    completion: str


class ModelUpdateRequest(BaseModel):
    model: str


class ModelUpdateResponse(BaseModel):
    status: str
    model: str


class ChatSession(BaseModel):
    id: str
    name: str
    created_at: str


class ChatRequest(BaseModel):
    prompt: str
    context: str = ""
    chat_id: str = ""  # Chat session ID


class ChatResponse(BaseModel):
    response: str


client = AsyncClient()
app = FastAPI()

@app.post("/review_code")
async def review_code_endpoint(req: ReviewRequest) -> ReviewResponse:
    print(req.prompt, "\nHUH\n")
    # client = AsyncClient()
    response = await client.chat(
        model=MODEL_NAME,
        messages = [
            {
                'role': 'system',
                'content': f"{REVIEW_PROMPT}",
            },
            {
                "role": 'user',
                "content": f"{req.prompt}"
            }],
        format=SuggestionList.model_json_schema(),
        options={'temperature': 0})

    suggestionResponse = SuggestionList.model_validate_json(response.message.content)

    print(suggestionResponse)

    return {"response": suggestionResponse}


@app.post("/chat")
async def chat_endpoint(req: ChatRequest) -> ChatResponse:
    print(req.prompt, "\nHUH\n")

    # Create a new chat session if none is provided
    if not req.chat_id:
        # Generate a new session ID
        session_id = str(uuid.uuid4())
        name = f"Chat {session_id[:8]}"

        # Create new session
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO chat_sessions (id, name) VALUES (?, ?)",
                (session_id, name)
            )

        req.chat_id = session_id

    # Get chat history from the database
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY timestamp",
            (req.chat_id,)
        )
        history = [{"role": row[0], "content": row[1]} for row in cursor.fetchall()]

    # Convert history to Ollama message format
    messages = []

    # Add system message first
    messages.append({
        'role': 'system',
        'content': 'You are a helpful code assistant. Use the provided context to answer questions.'
    })

    # Add history messages
    for msg in history:
        messages.append({
            'role': msg['role'],
            'content': msg['content']
        })

    if req.context:
        messages.append({
            'role' : 'system',
            'content': f"Context: {req.context}"
        })

    # Add current user message
    messages.append({
        'role': 'user',
        'content': req.prompt
    })

    # Save the user message to the database
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)",
            (req.chat_id, 'user', req.prompt)
        )

    # Get response from Ollama
    response = await client.chat(
        model=MODEL_NAME,
        messages=messages
    )

    # Save the assistant message to the database
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)",
            (req.chat_id, 'assistant', response.message.content)
        )

    return {"response": response.message.content}


@app.get("/chat_sessions")
async def get_chat_sessions():
    """Get all chat sessions."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, name, created_at FROM chat_sessions ORDER BY created_at DESC"
        )
        sessions = [{"id": row[0], "name": row[1], "created_at": row[2]} for row in cursor.fetchall()]
    return {"sessions": sessions}


@app.post("/create_chat_session")
async def create_chat_session(name: str = None):
    """Create a new chat session with an optional custom name."""
    session_id = str(uuid.uuid4())
    if name is None:
        name = f"Chat {session_id[:8]}"

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO chat_sessions (id, name) VALUES (?, ?)",
            (session_id, name)
        )

    return {"session_id": session_id}


@app.get("/chat_messages/{chat_id}")
async def get_chat_messages(chat_id: str):
    """Get all messages for a chat session."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY timestamp",
            (chat_id,)
        )
        messages = [{"role": row[0], "content": row[1]} for row in cursor.fetchall()]
    return {"messages": messages}


@app.delete("/chat_session/{chat_id}")
async def delete_chat_session(chat_id: str):
    """Delete a chat session."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM chat_messages WHERE session_id = ?",
            (chat_id,)
        )
        cursor.execute(
            "DELETE FROM chat_sessions WHERE id = ?",
            (chat_id,)
        )
    return {"status": "success"}


@app.post("/rename_chat_session/{chat_id}")
async def rename_chat_session(chat_id: str, name: str):
    """Rename a chat session."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE chat_sessions SET name = ? WHERE id = ?",
            (name, chat_id)
        )
    return {"status": "success"}


@app.post("/auto_complete")
async def auto_complete_endpoint(req: AutoCompleteRequest) -> AutoCompleteResponse:
    """Auto-complete code based on context."""
    # Extract the code context
    code_lines = req.code.split('\n')
    current_line_number = req.line_number
    character_position = req.character_position

    # Get the entire file for better context
    full_context = req.code

    # Extract the current line at cursor position
    cursor_line = code_lines[current_line_number] if current_line_number + 1 < len(code_lines) else ""

    # Split the line at cursor position to show exactly where the cursor is
    cursor_line_before = code_lines[current_line_number][:character_position] if character_position <= len(cursor_line) else cursor_line
    cursor_line_after = cursor_line[character_position:] if character_position <= len(cursor_line) else ""

    print(f"CURSOR AT LINE {current_line_number}, POSITION {character_position}")
    print(f"BEFORE CURSOR: '{cursor_line_before}'")
    print(f"AFTER CURSOR: '{cursor_line_after}'")

    # Get response from Ollama
    response = await client.chat(
        model=MODEL_NAME,
        messages=[
            {
                'role': 'system',
                'content': AUTO_COMPLETE_PROMPT
            },
            {
                'role': 'user',
                'content': f"""Here is the entire file:

{full_context}

The cursor is at line {current_line_number + 1}, character position {character_position}.
Current line content: '{cursor_line}'
Content before cursor: '{cursor_line_before}'
Content after cursor: '{cursor_line_after}'

Provide a useful code completion that would be inserted at the cursor position. Your completion should continue from exactly where the cursor is positioned."""
            }
        ],
        options={'temperature': 0.7}
    )

    completion = response.message.content.strip()
    print(f"COMPLETION: '{completion}'")

    return {"completion": completion}


@app.post("/update_model")
async def update_model_endpoint(req: ModelUpdateRequest) -> ModelUpdateResponse:
    """Update the model used for AI features."""
    global MODEL_NAME

    # Update the global model name
    MODEL_NAME = req.model
    print(f"Model updated to: {MODEL_NAME}")

    return {"status": "success", "model": MODEL_NAME}
