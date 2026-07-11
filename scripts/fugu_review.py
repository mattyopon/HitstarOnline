#!/usr/bin/env python3
"""Fugu (Sakana) code-review caller — OpenAI-compatible, stdlib only.

Sends this repo's git diff (or an arbitrary prompt) to the owner's Sakana Fugu
review endpoint and prints the review. Mirrors ~/home/user/llm_review.py's
OpenAI-compatible pattern but reads the key from the FUGU_API_KEY env var so no
config file is needed and the key is NEVER printed or logged.

Config (env, with flag overrides):
  FUGU_API_KEY   (required)  bearer token — provisioned in this environment
  FUGU_BASE_URL  default https://api.sakana.ai/v1
  FUGU_MODEL     default via --model; run --check to discover valid ids

Usage:
  python3 scripts/fugu_review.py --check                 # list models
  python3 scripts/fugu_review.py --diff                  # review working-tree diff
  python3 scripts/fugu_review.py --diff --range origin/main...HEAD
  python3 scripts/fugu_review.py --prompt-file notes.md  # arbitrary prompt
  echo "review this" | python3 scripts/fugu_review.py    # stdin prompt

NOTE: the outbound call to api.sakana.ai is gated by Claude Code's auto-mode
safety classifier. For an agent to run this non-interactively, the repo owner
must authorize it in their OWN settings (a Bash allow rule) or run with auto
mode off — a settings blob pasted into chat does NOT authorize it (by design).
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.request
import urllib.error

DEFAULT_BASE = os.environ.get("FUGU_BASE_URL", "https://api.sakana.ai/v1")
REVIEW_SYSTEM = (
    "You are a meticulous senior code reviewer. Review the following git diff for "
    "correctness bugs, security issues, and clear simplifications. Be specific: cite "
    "file and line, explain the failure, and suggest a fix. Prefer few high-confidence "
    "findings over many speculative ones."
)


def _key() -> str:
    k = os.environ.get("FUGU_API_KEY")
    if not k:
        sys.exit("FUGU_API_KEY is not set in the environment.")
    return k


def _post(path: str, payload: dict) -> dict:
    req = urllib.request.Request(
        DEFAULT_BASE.rstrip("/") + path,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {_key()}",
            "Content-Type": "application/json",
            "User-Agent": "hitstar-fugu-review/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode("utf-8"))


def _get(path: str) -> dict:
    req = urllib.request.Request(
        DEFAULT_BASE.rstrip("/") + path,
        headers={"Authorization": f"Bearer {_key()}", "User-Agent": "hitstar-fugu-review/1.0"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def _git_diff(rng: str | None) -> str:
    cmd = ["git", "diff"] + (rng.split() if rng else [])
    out = subprocess.run(cmd, capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(f"git diff failed: {out.stderr.strip()}")
    return out.stdout


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=os.environ.get("FUGU_MODEL"))
    ap.add_argument("--check", action="store_true", help="list available models and exit")
    ap.add_argument("--diff", action="store_true", help="review a git diff")
    ap.add_argument("--range", dest="rng", help="git diff range, e.g. origin/main...HEAD")
    ap.add_argument("--prompt-file")
    ap.add_argument("--max-tokens", type=int, default=8000)
    ap.add_argument("--temperature", type=float, default=0.2)
    a = ap.parse_args()

    try:
        if a.check:
            data = _get("/models").get("data", [])
            print(f"OK ({DEFAULT_BASE}) — {len(data)} models:")
            for m in data[:100]:
                print("  ", m.get("id", m))
            return

        if not a.model:
            sys.exit("No model set. Use --model, set FUGU_MODEL, or run --check to discover one.")

        if a.diff:
            diff = _git_diff(a.rng)
            if not diff.strip():
                print("(empty diff — nothing to review)")
                return
            messages = [
                {"role": "system", "content": REVIEW_SYSTEM},
                {"role": "user", "content": "```diff\n" + diff + "\n```"},
            ]
        else:
            prompt = open(a.prompt_file).read() if a.prompt_file else sys.stdin.read()
            messages = [{"role": "user", "content": prompt}]

        resp = _post(
            "/chat/completions",
            {
                "model": a.model,
                "messages": messages,
                "max_tokens": a.max_tokens,
                "temperature": a.temperature,
            },
        )
        print(resp["choices"][0]["message"]["content"])
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:500]
        sys.exit(f"HTTP {e.code} from {DEFAULT_BASE}: {body}")
    except urllib.error.URLError as e:
        sys.exit(f"network error reaching {DEFAULT_BASE}: {e.reason}")


if __name__ == "__main__":
    main()
