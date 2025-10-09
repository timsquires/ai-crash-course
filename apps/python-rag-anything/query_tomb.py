import asyncio, os
from raganything import RAGAnything
from lightrag import LightRAG
from lightrag.llm.openai import openai_complete_if_cache, openai_embed
from lightrag.utils import EmbeddingFunc
from lightrag.kg.shared_storage import initialize_pipeline_status


def build_lightrag():
    api_key = os.getenv("OPENAI_API_KEY")
    base_url = os.getenv("OPENAI_BASE_URL", None)

    # Allow override via env; default to project rag_storage
    working_dir = os.getenv("LIGHTRAG_WORKING_DIR")
    if not working_dir:
        working_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "rag_storage"))

    return LightRAG(
        working_dir=working_dir,
        llm_model_func=lambda prompt, system_prompt=None, history_messages=[], **kw: openai_complete_if_cache(
            "gpt-4o-mini",
            prompt,
            system_prompt=system_prompt,
            history_messages=history_messages,
            api_key=api_key,
            base_url=base_url,
            **kw,
        ),
        embedding_func=EmbeddingFunc(
            embedding_dim=3072,
            max_token_size=8192,
            func=lambda texts: openai_embed(
                texts,
                model="text-embedding-3-large",
                api_key=api_key,
                base_url=base_url,
            ),
        ),
    )


async def main():
    # Ensure LightRAG storages are initialized/loaded before querying
    lightrag_instance = build_lightrag()
    await lightrag_instance.initialize_storages()
    await initialize_pipeline_status()

    # Pass initialized LightRAG into RAG-Anything
    rag = RAGAnything(lightrag=lightrag_instance)

    while True:
        q = input("\nQuestion: ").strip()
        if not q:
            break
        ans = await rag.aquery(q, mode="hybrid")  # or "local"/"global"/"naive"
        print("\nAnswer:\n", ans)


if __name__ == "__main__":
    asyncio.run(main())