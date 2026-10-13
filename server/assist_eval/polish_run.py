"""Running a polish test set through the server's polish endpoint function, in process."""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import Mapping
from dataclasses import asdict, dataclass
from pathlib import Path

from assist.lm import build_lm, configure_cache
from assist.polish import PolishDeps, polish
from assist.programs import build_programs
from assist.settings import Settings

from .paths import POLISH_WORKSPACE, set_path
from .polish_cases import PolishCase, read_cases
from .run import eval_settings, run_dir


@dataclass
class PolishSample:
    case: str
    sample: int
    polished: str | None  # None when the request failed
    changed: bool
    reason: str | None
    error: str | None
    latencyMs: int


def build_deps(settings: Settings) -> PolishDeps:
    configure_cache(False)
    _, program = build_programs(settings.max_turns, fake=settings.model.lm_id == "fake")
    lm = build_lm(settings.model, cache=False)
    return PolishDeps(program, lm, settings.model.lm_id is not None, settings.model.name or "none")


async def run_cases(cases: list[PolishCase], deps: PolishDeps, samples: int, concurrency: int, out: Path) -> list[PolishSample]:
    sem = asyncio.Semaphore(max(1, concurrency))
    results: list[PolishSample] = []

    async def one(case: PolishCase, n: int) -> None:
        async with sem:
            started = time.perf_counter()
            try:
                status, body = await polish({"text": case.source}, deps)
                error = None if status == 200 else f"HTTP {status}: {body.get('error', '')}"
            except Exception as err:  # noqa: BLE001 - an unexpected failure counts as an error, never stops the run
                body, error = {}, type(err).__name__
            sample = PolishSample(
                case=case.id,
                sample=n,
                polished=None if error else body.get("polished"),
                changed=bool(body.get("changed")) if not error else False,
                reason=body.get("reason") if not error else None,
                error=error,
                latencyMs=round((time.perf_counter() - started) * 1000),
            )
            results.append(sample)
            with (out / "samples.jsonl").open("a", encoding="utf-8") as f:
                f.write(json.dumps(asdict(sample), ensure_ascii=False) + "\n")

    await asyncio.gather(*(one(case, n) for case in cases for n in range(samples)))
    return results


def run_command(args, root: Path = POLISH_WORKSPACE, env: Mapping[str, str] | None = None) -> int:
    from .polish_report import write_report

    path = set_path(args.set, root)
    if not path.exists():
        print(f"✖ set not found: {path} (import it with npm run eval:polish:build)")
        return 1
    settings = eval_settings(env)
    model = settings.model
    meta_path = path.with_suffix(".meta.json")
    meta = json.loads(meta_path.read_text("utf-8")) if meta_path.exists() else {}
    if meta.get("localOnly") and model.external:
        print(f"✖ set {args.set} is local-only: {model.name} sends text outside this machine (use a local model, see docs/REMOTE-OLLAMA.md)")
        return 1
    if model.lm_id is None:
        print("✖ no model available (COMPLETION_MODEL=gemini needs GEMINI_API_KEY)")
        return 1
    if model.lm_id == "fake" and not args.allow_fake:
        print("✖ a live model is needed: set GEMINI_API_KEY or COMPLETION_MODEL (the offline test model needs --allow-fake)")
        return 1
    if model.external:
        print(f"note: the set's text is sent outside this machine ({model.name}): use it only if the dataset's terms allow that")
    cases = read_cases(path)
    print(f"{len(cases)} cases × {args.samples} samples = {len(cases) * args.samples} requests to {model.name}, concurrency {args.concurrency}")
    out = run_dir(args.set, model.name or "none", root)
    started = time.perf_counter()
    samples = asyncio.run(run_cases(cases, build_deps(settings), args.samples, args.concurrency, out))
    seconds = time.perf_counter() - started
    info = {"set": args.set, "model": model.name, "samples": args.samples, "input": meta.get("input"), "seconds": round(seconds, 1)}
    report = write_report(out, cases, samples, info)
    print(report.summary)
    print(f"report → {out / 'report.md'}")
    return 0
