"""Few-shot spoken-intent matching harness."""
import os
from pathlib import Path

# Keep every download (models, hub metadata) inside research/data/, and never send a stored token:
# all artefacts used here are public.
_HF = Path(__file__).resolve().parents[3] / "data" / "hf_cache"
os.environ["HF_HOME"] = str(_HF)
os.environ["HF_HUB_DISABLE_IMPLICIT_TOKEN"] = "1"
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
