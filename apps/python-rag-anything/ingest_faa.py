# ingest_faa.py
import asyncio, os, argparse, glob
from raganything import RAGAnything, RAGAnythingConfig
from lightrag.llm.openai import openai_complete_if_cache, openai_embed
from lightrag.utils import EmbeddingFunc

def build_rag():
    api_key = os.getenv("OPENAI_API_KEY")
    base_url = os.getenv("OPENAI_BASE_URL", None)

    cfg = RAGAnythingConfig()
    embedding_func = EmbeddingFunc(
        embedding_dim=3072,
        max_token_size=8192,
        func=lambda texts: openai_embed(texts, model="text-embedding-3-large", api_key=api_key, base_url=base_url),
    )
    llm = lambda prompt, system_prompt=None, history_messages=[], **kw: openai_complete_if_cache(
        "gpt-4o-mini", prompt, system_prompt=system_prompt, history_messages=history_messages, api_key=api_key, base_url=base_url, **kw
    )
    # Optional: add a vision model if your docs include images
    vlm = lambda prompt, system_prompt=None, history_messages=[], image_data=None, messages=None, **kw: openai_complete_if_cache(
        "gpt-4o", "", system_prompt=None, history_messages=[], messages=messages, api_key=api_key, base_url=base_url, **kw
    ) if messages else llm(prompt, system_prompt, history_messages, **kw)

    return RAGAnything(config=cfg, llm_model_func=llm, embedding_func=embedding_func, vision_model_func=vlm)

async def main():
    p = argparse.ArgumentParser()
    p.add_argument("--folder", required=True, help="Folder with FAA docs")
    p.add_argument("--max-workers", type=int, default=int(os.getenv("MAX_CONCURRENT_FILES", 4)))
    p.add_argument("--recursive", action="store_true", default=True)
    args = p.parse_args()

    rag = build_rag()
    # Build candidate file list respecting supported extensions
    exts = set((rag.config.supported_file_extensions or []))
    pattern = "**/*" if args.recursive else "*"
    candidates = glob.glob(os.path.join(args.folder, pattern), recursive=args.recursive)
    files = [p for p in candidates if os.path.isfile(p) and (not exts or os.path.splitext(p)[1].lower() in exts)]

    for f in files:
        try:
            await rag.process_document_complete(
                file_path=f,
                output_dir=rag.config.parser_output_dir,
                parse_method=rag.config.parse_method,
            )
        except Exception as e:
            try:
                print(f"Retrying with OCR: {f} ({e})")
                await rag.process_document_complete(
                    file_path=f,
                    output_dir=rag.config.parser_output_dir,
                    parse_method="ocr",
                )
            except Exception as e2:
                try:
                    print(f"Retrying with TXT (text-only): {f} ({e2})")
                    await rag.process_document_complete(
                        file_path=f,
                        output_dir=rag.config.parser_output_dir,
                        parse_method="txt",
                    )
                except Exception as e3:
                    print(f"Skipping {f}: {e3}")

    # Let any async finalizers run before the loop stops to avoid event loop warnings
    del rag
    await asyncio.sleep(0)

if __name__ == "__main__":
    asyncio.run(main())