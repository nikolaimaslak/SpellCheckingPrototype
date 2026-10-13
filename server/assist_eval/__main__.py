"""Usage:
  npm run eval:completion:build -- <input> --name <set> [--plain [--split sentences]] [--per-category N] [--seed N] [--limit N]
  npm run eval:completion -- --set <set> [--samples N] [--concurrency N] [--allow-fake]
  npm run eval:polish:build -- <csv> --name <set> [--source-column C --target-column C [--type-column C]] [--limit N] [--seed N]
  npm run eval:polish -- --set <set> [--samples N] [--concurrency N] [--allow-fake]
"""

from __future__ import annotations

import argparse
import sys


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="assist_eval", description="Local completion eval (workspace: eval/local/completion/).")
    sub = p.add_subparsers(dest="command", required=True)
    b = sub.add_parser("build", help="build a test set from chat text or plain text")
    b.add_argument("input", help="input file (a path, or a name under eval/local/completion/sources/)")
    b.add_argument("--name", required=True, help="set name: written to sets/<name>.jsonl")
    b.add_argument("--plain", action="store_true", help="plain text: every paragraph is an agent message")
    b.add_argument("--split", choices=["paragraphs", "sentences"], default="paragraphs", help="with --plain: messages by paragraph or sentence")
    b.add_argument("--per-category", type=int, default=1, help="cuts per category and message (default 1)")
    b.add_argument("--seed", type=int, default=1, help="random seed for choosing cuts (default 1)")
    b.add_argument("--limit", type=int, default=None, help="keep only the first N cases")
    r = sub.add_parser("run", help="run a test set through the completion program")
    r.add_argument("--set", required=True, help="set name under eval/local/completion/sets/")
    r.add_argument("--samples", type=int, default=3, help="samples per case (default 3)")
    r.add_argument("--concurrency", type=int, default=4, help="requests in flight (default 4)")
    r.add_argument("--allow-fake", action="store_true", help="allow the offline test model (for testing the tool)")
    pb = sub.add_parser("polish-build", help="import a GEC sentence-pair CSV as a polish test set")
    pb.add_argument("input", help="CSV file (a path, or a name under eval/local/polish/sources/)")
    pb.add_argument("--name", required=True, help="set name: written to eval/local/polish/sets/<name>.jsonl")
    pb.add_argument("--source-column", default=None, help="column holding the draft (other layouts)")
    pb.add_argument("--target-column", default=None, help="column holding the reference correction (other layouts)")
    pb.add_argument("--type-column", default=None, help="column holding the error type (optional)")
    pb.add_argument("--limit", type=int, default=None, help="keep N cases, chosen with --seed")
    pb.add_argument("--seed", type=int, default=1, help="random seed for --limit (default 1)")
    pr = sub.add_parser("polish-run", help="run a polish test set through the polish program")
    pr.add_argument("--set", required=True, help="set name under eval/local/polish/sets/")
    pr.add_argument("--samples", type=int, default=1, help="samples per case (default 1)")
    pr.add_argument("--concurrency", type=int, default=4, help="requests in flight (default 4; use 1 for a single local GPU)")
    pr.add_argument("--allow-fake", action="store_true", help="allow the offline test model (for testing the tool)")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    if args.command == "build":
        from .cases import build_command

        return build_command(args)
    if args.command == "polish-build":
        from .polish_cases import build_command as polish_build

        return polish_build(args)
    if args.command == "polish-run":
        from .polish_run import run_command as polish_run

        return polish_run(args)
    from .run import run_command

    return run_command(args)


if __name__ == "__main__":
    sys.exit(main())
