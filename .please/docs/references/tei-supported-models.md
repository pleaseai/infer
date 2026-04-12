# TEI Supported Models & Hardware

> Source: https://huggingface.co/docs/text-embeddings-inference/en/supported_models
> Last synced: 2026-04-12

## Supported Embedding Model Architectures

TEI supports: Nomic, BERT, CamemBERT, XLM-RoBERTa (absolute positions), JinaBERT (Alibi positions), Mistral, Alibaba GTE, Qwen2 (Rope positions), MPNet, ModernBERT, Qwen3, and Gemma3.

### Embedding Models (by MTEB Rank)

| MTEB Rank | Model Size | Model Type | Model ID |
|-----------|-----------|------------|----------|
| 2 | 7.57B (Very Expensive) | Qwen3 | [Qwen/Qwen3-Embedding-8B](https://hf.co/Qwen/Qwen3-Embedding-8B) |
| 3 | 4.02B (Very Expensive) | Qwen3 | [Qwen/Qwen3-Embedding-4B](https://hf.co/Qwen/Qwen3-Embedding-4B) |
| 4 | 509M | Qwen3 | [Qwen/Qwen3-Embedding-0.6B](https://hf.co/Qwen/Qwen3-Embedding-0.6B) |
| 6 | 7.61B (Very Expensive) | Qwen2 | [Alibaba-NLP/gte-Qwen2-7B-instruct](https://hf.co/Alibaba-NLP/gte-Qwen2-7B-instruct) |
| 7 | 560M | XLM-RoBERTa | [intfloat/multilingual-e5-large-instruct](https://hf.co/intfloat/multilingual-e5-large-instruct) |
| 8 | 308M | Gemma3 | [google/embeddinggemma-300m](https://hf.co/google/embeddinggemma-300m) (gated) |
| 15 | 1.78B (Expensive) | Qwen2 | [Alibaba-NLP/gte-Qwen2-1.5B-instruct](https://hf.co/Alibaba-NLP/gte-Qwen2-1.5B-instruct) |
| 18 | 7.11B (Very Expensive) | Mistral | [Salesforce/SFR-Embedding-2_R](https://hf.co/Salesforce/SFR-Embedding-2_R) |
| 35 | 568M | XLM-RoBERTa | [Snowflake/snowflake-arctic-embed-l-v2.0](https://hf.co/Snowflake/snowflake-arctic-embed-l-v2.0) |
| 41 | 305M | Alibaba GTE | [Snowflake/snowflake-arctic-embed-m-v2.0](https://hf.co/Snowflake/snowflake-arctic-embed-m-v2.0) |
| 52 | 335M | BERT | [WhereIsAI/UAE-Large-V1](https://hf.co/WhereIsAI/UAE-Large-V1) |
| 58 | 137M | NomicBERT | [nomic-ai/nomic-embed-text-v1](https://hf.co/nomic-ai/nomic-embed-text-v1) |
| 79 | 137M | NomicBERT | [nomic-ai/nomic-embed-text-v1.5](https://hf.co/nomic-ai/nomic-embed-text-v1.5) |
| 103 | 109M | MPNet | [sentence-transformers/all-mpnet-base-v2](https://hf.co/sentence-transformers/all-mpnet-base-v2) |
| N/A | 475M-A305M | NomicBERT | [nomic-ai/nomic-embed-text-v2-moe](https://hf.co/nomic-ai/nomic-embed-text-v2-moe) |
| N/A | 434M | Alibaba GTE | [Alibaba-NLP/gte-large-en-v1.5](https://hf.co/Alibaba-NLP/gte-large-en-v1.5) |
| N/A | 396M | ModernBERT | [answerdotai/ModernBERT-large](https://hf.co/answerdotai/ModernBERT-large) |
| N/A | 340M | Qwen3 | [voyageai/voyage-4-nano](https://hf.co/voyageai/voyage-4-nano) |
| N/A | 137M | JinaBERT | [jinaai/jina-embeddings-v2-base-en](https://hf.co/jinaai/jina-embeddings-v2-base-en) |
| N/A | 137M | JinaBERT | [jinaai/jina-embeddings-v2-base-code](https://hf.co/jinaai/jina-embeddings-v2-base-code) |

Full leaderboard: [MTEB Leaderboard](https://huggingface.co/spaces/mteb/leaderboard)

## Supported Re-rankers & Sequence Classification Models

TEI supports CamemBERT and XLM-RoBERTa Sequence Classification models with absolute positions.

| Task | Model Type | Model ID |
|------|-----------|----------|
| Re-Ranking | XLM-RoBERTa | [BAAI/bge-reranker-large](https://huggingface.co/BAAI/bge-reranker-large) |
| Re-Ranking | XLM-RoBERTa | [BAAI/bge-reranker-base](https://huggingface.co/BAAI/bge-reranker-base) |
| Re-Ranking | GTE | [Alibaba-NLP/gte-multilingual-reranker-base](https://huggingface.co/Alibaba-NLP/gte-multilingual-reranker-base) |
| Re-Ranking | ModernBert | [Alibaba-NLP/gte-reranker-modernbert-base](https://huggingface.co/Alibaba-NLP/gte-reranker-modernbert-base) |
| Sentiment Analysis | RoBERTa | [SamLowe/roberta-base-go_emotions](https://huggingface.co/SamLowe/roberta-base-go_emotions) |

## Supported Hardware

| Architecture | Platform | Docker Image |
|-------------|----------|-------------|
| CPU | x86_64 | `ghcr.io/huggingface/text-embeddings-inference:cpu-1.9` |
| CPU | aarch64 | `ghcr.io/huggingface/text-embeddings-inference:cpu-arm64-1.9` |
| Volta | x86_64 | **NOT SUPPORTED** |
| Turing (T4, RTX 2000) | x86_64 | `ghcr.io/huggingface/text-embeddings-inference:turing-1.9` (experimental) |
| Ampere 8.0 (A100, A30) | x86_64 | `ghcr.io/huggingface/text-embeddings-inference:1.9` |
| Ampere 8.6 (A10, A40) | x86_64 | `ghcr.io/huggingface/text-embeddings-inference:86-1.9` |
| Ada Lovelace (RTX 4000) | x86_64 | `ghcr.io/huggingface/text-embeddings-inference:89-1.9` |
| Hopper (H100) | x86_64 | `ghcr.io/huggingface/text-embeddings-inference:hopper-1.9` |
| Blackwell 10.0 (B200) | x86_64 | `ghcr.io/huggingface/text-embeddings-inference:100-1.9` (experimental) |
| Blackwell 12.0 (RTX 5090) | x86_64 | `ghcr.io/huggingface/text-embeddings-inference:120-1.9` (experimental) |
| Blackwell 12.1 (DGX Spark) | multi | `ghcr.io/huggingface/text-embeddings-inference:121-1.9` (experimental) |

**Notes**:
- CUDA compute capability < 7.5 is **not** supported (V100, GTX 1000 series, etc.)
- Requires NVIDIA drivers with CUDA >= 12.2 for GPU
- Flash Attention is OFF by default for Turing (precision issues). Enable with `USE_FLASH_ATTENTION=True`
- ARM64 (aarch64) supported for both CPU-only and CUDA (Blackwell 12.1)

## Key Takeaways for infer-please

- **CPU 지원**: TEI는 CPU에서도 동작 (x86_64, aarch64). macOS에서는 Homebrew 바이너리 또는 Docker CPU 이미지 사용
- **경량 모델 추천**: `BAAI/bge-small-en-v1.5` (미포함이지만 BERT 계열로 지원), `nomic-ai/nomic-embed-text-v1.5` (137M), `Qwen/Qwen3-Embedding-0.6B` (509M)
- **Reranker 제한**: XLM-RoBERTa, GTE, ModernBert 아키텍처만 지원. `BAAI/bge-reranker-v2-m3`는 XLM-RoBERTa 계열로 지원됨
- **Qwen3 Reranker**: `Qwen/Qwen3-Reranker-0.6B`는 Qwen3 아키텍처이므로 TEI 지원 여부 확인 필요 (reranker 테이블에 미포함)
