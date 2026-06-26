"""
Groq LLM client using langchain-groq's ChatGroq.

Usage:
    from llm.groq import call_llm

    response = await call_llm("Explain this function: ...")
"""

import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage

load_dotenv()

# ---------------------------------------------------------------------------
# Shared ChatGroq instance (created once at import time)
# ---------------------------------------------------------------------------
_llm = ChatGroq(
    model="llama-3.3-70b-versatile",
    api_key=os.getenv("GROQ_API_KEY", ""),
)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def call_llm(prompt: str) -> str:
    """
    Send a plain-text prompt to Groq and return the response as a string.

    Args:
        prompt: The instruction / question to send to the model.

    Returns:
        The model's reply as a plain string, or an empty string on failure.
    """
    try:
        message = HumanMessage(content=prompt)
        response = await _llm.ainvoke([message])
        return str(response.content)
    except Exception as exc:
        print(f"[LLM ERROR] call_llm failed: {exc}")
        return ""
