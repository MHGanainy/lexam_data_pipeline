import os
import time
import httpx

DEEPINFRA_API_KEY = os.environ.get("DEEPINFRA_API_KEY", "")
DEEPINFRA_URL = "https://api.deepinfra.com/v1/openai/chat/completions"

_client: httpx.Client | None = None


def get_client() -> httpx.Client:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.Client(timeout=120.0)
    return _client


def close_client() -> None:
    global _client
    if _client is not None and not _client.is_closed:
        _client.close()
        _client = None


def chat_completion(
    model: str,
    messages: list[dict],
    temperature: float = 0.7,
    max_tokens: int = 2048,
    max_retries: int = 3,
) -> dict:
    """Call DeepInfra chat completions. Returns {content, input_tokens, output_tokens}."""
    client = get_client()
    headers = {
        "Authorization": f"Bearer {DEEPINFRA_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    last_err = None
    for attempt in range(max_retries):
        try:
            resp = client.post(DEEPINFRA_URL, json=payload, headers=headers)
            if resp.status_code in (429, 500, 502, 503):
                wait = 2 ** attempt
                time.sleep(wait)
                last_err = f"HTTP {resp.status_code}: {resp.text[:200]}"
                continue
            resp.raise_for_status()
            data = resp.json()
            choice = data["choices"][0]["message"]["content"]
            usage = data.get("usage", {})
            return {
                "content": choice,
                "input_tokens": usage.get("prompt_tokens", 0),
                "output_tokens": usage.get("completion_tokens", 0),
            }
        except httpx.HTTPStatusError as e:
            last_err = str(e)
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
            continue
        except Exception as e:
            last_err = str(e)
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
            continue

    raise RuntimeError(f"DeepInfra API failed after {max_retries} retries: {last_err}")
