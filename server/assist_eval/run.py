"""Running a test set through the server's completion program, in process."""

from __future__ import annotations

import asyncio
import json
import os
import time
from collections.abc import Mapping
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from assist.complete import CompletionDeps, complete
from assist.lm import build_lm, configure_cache
from assist.programs import build_programs
from assist.settings import ROOT, Settings, load_dotenv, load_settings

from .cases import Case, read_set
from .paths import WORKSPACE, set_path, workspace

# The eval never uses canned responses or the knowledge base, and always sends the conversation.
SOURCES = {"transcript": True, "canned": False, "kb": False}


@dataclass
class Sample:
    case: str
    sample: int
    completion: str
    edit: dict | None
    withheld: str | None
    error: str | None
    latencyMs: int


def eval_settings(env: Mapping[str, str] | None = None) -> Settings:
    """The server's settings, with the LLM cache forced off."""
    if env is None:
        load_dotenv(ROOT / ".env")
        env = os.environ
    return load_settings({**env, "ASSIST_LLM_CACHE": "off"})


def build_deps(settings: Settings) -> CompletionDeps:
    configure_cache(False)
    program, _ = build_programs(settings.max_turns, fake=settings.model.lm_id == "fake")
    lm = build_lm(settings.model, cache=False)
    # An empty library and knowledge base as well as the source flags: no canned text can reach the model.
    return CompletionDeps(program, lm, settings.model.lm_id is not None, settings.model.name or "none", library=[], kb=[])


async def run_cases(cases: list[Case], deps: CompletionDeps, samples: int, concurrency: int, out: Path) -> list[Sample]:
    sem = asyncio.Semaphore(max(1, concurrency))
    results: list[Sample] = []

    async def one(case: Case, n: int) -> None:
        async with sem:
            started = time.perf_counter()
            try:
                status, body = await complete({"prefix": case.prefix, "transcript": case.transcript, "sources": SOURCES}, deps)
                error = None if status == 200 else f"HTTP {status}: {body.get('error', '')}"
            except Exception as err:  # noqa: BLE001 - an unexpected failure counts as an error, never stops the run
                body, error = {}, f"{type(err).__name__}"
            sample = Sample(
                case=case.id,
                sample=n,
                completion=body.get("completion", "") if not error else "",
                edit=body.get("edit"),
                withheld=body.get("withheld"),
                error=error,
                latencyMs=round((time.perf_counter() - started) * 1000),
            )
            results.append(sample)
            with (out / "samples.jsonl").open("a", encoding="utf-8") as f:
                f.write(json.dumps(asdict(sample), ensure_ascii=False) + "\n")

    await asyncio.gather(*(one(case, n) for case in cases for n in range(samples)))
    return results


def run_dir(set_name: str, model: str, root: Path = WORKSPACE) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = workspace(root) / "runs" / f"{stamp}-{set_name}-{model.replace('/', '_').replace(':', '_')}"
    path.mkdir(parents=True, exist_ok=False)
    return path


def run_command(args, root: Path = WORKSPACE, env: Mapping[str, str] | None = None) -> int:
    from .report import write_report

    path = set_path(args.set, root)
    if not path.exists():
        print(f"✖ set not found: {path} (build it with npm run eval:completion:build)")
        return 1
    settings = eval_settings(env)
    model = settings.model
    if model.lm_id is None:
        print("✖ no model available (COMPLETION_MODEL=gemini needs GEMINI_API_KEY)")
        return 1
    if model.lm_id == "fake" and not args.allow_fake:
        print("✖ a live model is needed: set GEMINI_API_KEY or COMPLETION_MODEL (the offline test model needs --allow-fake)")
        return 1
    if model.external:
        print(f"note: the set's text is sent outside this machine ({model.name}): it must contain no personal data")
    cases = read_set(path)
    print(f"{len(cases)} cases × {args.samples} samples = {len(cases) * args.samples} requests to {model.name}, concurrency {args.concurrency}")
    out = run_dir(args.set, model.name or "none", root)
    started = time.perf_counter()
    samples = asyncio.run(run_cases(cases, build_deps(settings), args.samples, args.concurrency, out))
    seconds = time.perf_counter() - started
    meta_path = path.with_suffix(".meta.json")
    meta = json.loads(meta_path.read_text("utf-8")) if meta_path.exists() else {}
    info = {"set": args.set, "model": model.name, "samples": args.samples, "seed": meta.get("seed"), "input": meta.get("input"), "seconds": round(seconds, 1)}
    report = write_report(out, cases, samples, info)
    print(report.summary)
    print(f"report → {out / 'report.md'}")
    return 0
