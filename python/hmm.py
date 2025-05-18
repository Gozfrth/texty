from pydantic import BaseModel
from fastapi import FastAPI
from agno.agent import Agent
from agno.memory.v2.db.sqlite import SqliteMemoryDb
from agno.memory.v2.memory import Memory
from agno.models.ollama import Ollama
from agno.storage.sqlite import SqliteStorage



class SuggestionInfo(BaseModel):
  line: int
  suggestion: str

class SuggestionList(BaseModel):
  suggestions: list[SuggestionInfo]


class ReviewRequest(BaseModel):
    prompt: str


class ReviewResponse(BaseModel):
    response: SuggestionList


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

# Initialize FastAPI app
app = FastAPI()

# Database file for memory and storage
db_file = "tmp/agent.db"
# User ID placeholder for memory operations
def default_user_id():
    return "default_user"

# Initialize memory.v2 for storing user memories
memory = Memory(
    model=Ollama(id="qwen2.5:3b"),
    db=SqliteMemoryDb(table_name="user_memories", db_file=db_file),
)
# Initialize storage for chat sessions/history
storage = SqliteStorage(table_name="agent_sessions", db_file=db_file)

# Initialize Agent with memory, storage, and tools
agent = Agent(
    model=Ollama(id="qwen2.5:3b"),
    memory=memory,
    enable_agentic_memory=True,
    enable_user_memories=True,
    storage=storage,
    add_history_to_messages=True,
    num_history_runs=3,
    markdown=True,
)


@app.post("/review_code")
async def review_code_endpoint(req: ReviewRequest) -> ReviewResponse:
    print(req.prompt, "\nHUH\n")
    # client = AsyncClient()
    response = agent.run("What is getChatWebviewContent doing?")

    suggestionResponse = SuggestionList.model_validate_json(response.message.content)

    print(suggestionResponse)

    return {"response": suggestionResponse}


# Prompt for code review
REVIEW_PROMPT = """
You are a code tutor who helps students learn how to write better code. Your job is to evaluate a block of code that the user gives you and then annotate any lines that could be improved with a brief suggestion and the reason why you are making that suggestion. Only make suggestions when you feel the severity is enough that it will impact the readability and maintainability of the code. Be friendly with your suggestions and remember that these are students so they need gentle guidance. Format each suggestion as a single JSON object. It is not necessary to wrap your response in triple backticks.
"""