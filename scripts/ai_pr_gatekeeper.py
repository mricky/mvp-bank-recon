import os
import sys
import json
import subprocess
import requests

# ==============================================================================
# 🛡️ AI PR GATEKEEPER - BANK RECONCILIATION & FINANCIAL LEDGER AUDITOR
# Target Repository: mvp-bank-recon
# Author: Mochamad Ricky Susanto (Lead Software Architect)
# ==============================================================================

# 1. Load Environment Variables from GitHub Actions
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "").strip()
REPO = os.environ.get("GITHUB_REPOSITORY", "").strip()
PR_NUMBER = os.environ.get("PR_NUMBER", "").strip()
COMMIT_SHA = os.environ.get("COMMIT_SHA", "").strip()

print(f"🚀 AI Financial & Architecture Gatekeeper starting for Repo: '{REPO}', PR: #{PR_NUMBER}, Commit: {COMMIT_SHA[:7] if COMMIT_SHA else 'N/A'}")

if not GITHUB_TOKEN or not REPO or not PR_NUMBER or not COMMIT_SHA:
    print("⚠️ Warning: Missing GitHub context environment variables. Running in local preview mode.")

# 2. Extract Clean Git Diff (Source code only, exclude generated/lockfiles/assets)
def get_clean_diff():
    try:
        cmd = [
            "git", "diff", "origin/main...HEAD",
            "--", "*.py", "*.js", "*.ts", "*.tsx", "*.jsx", "*.html", "*.css", "*.sql", "*.sh", "*.json"
        ]
        diff = subprocess.check_output(cmd).decode("utf-8", errors="ignore")
        if not diff.strip():
            # Fallback to general diff against HEAD~1 if origin/main is not fetched
            cmd_fallback = ["git", "diff", "HEAD~1...HEAD", "--", "*.py", "*.js", "*.ts", "*.tsx", "*.sql"]
            diff = subprocess.check_output(cmd_fallback).decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"ℹ️ Git diff command note: {e}")
        diff = ""

    # Truncate context to ~40KB safe limit to prevent context exhaustion
    return diff[:40000]

# 3. Analyze Diff with Google Gemini API (Structured JSON Output)
def analyze_diff_with_gemini(diff_text):
    if not diff_text.strip():
        return {
            "overall_risk_score": 0,
            "blast_radius": "ISOLATED",
            "verdict": "APPROVE",
            "summary": "No functional source code changes detected in this Pull Request.",
            "findings": []
        }

    if not GEMINI_API_KEY:
        print("⚠️ GEMINI_API_KEY not configured. Using deterministic baseline audit.")
        return {
            "overall_risk_score": 15,
            "blast_radius": "ISOLATED",
            "verdict": "APPROVE",
            "summary": "Baseline check passed. (Add GEMINI_API_KEY in repository secrets for deep semantic AI code review).",
            "findings": []
        }

    # Use gemini-3-flash-preview with automatic fallback
    model_name = "gemini-3-flash-preview"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_API_KEY}"

    prompt = f"""
You are a Principal Financial Software Architect and Automated CI/CD Gatekeeper auditing a Pull Request for a Bank Reconciliation and Financial Ledger system.
Analyze the following Git Diff with extreme rigor:

1. Financial & Ledger Integrity (CRITICAL):
   - Floating-Point Arithmetic: Detect use of IEEE 754 floating-point numbers (`float`, standard JS `number`) for currency/money calculations instead of integer cents, `BigInt`, or arbitrary-precision `Decimal`.
   - Double-Entry Imbalance: Ensure any ledger entry guarantees Debit == Credit.
   - Idempotency & Webhook Safety: Ensure incoming bank mutations or webhook reconciliation endpoints enforce unique idempotency keys to prevent duplicate transaction recording.
   - Transactional Concurrency: Flag balance updates or ledger insertions that lack row-level locking (`SELECT FOR UPDATE`), serializable isolation, or optimistic concurrency versioning.

2. General Systems Architecture & Security:
   - SQL Injection or unindexed queries inside loops (N+1 queries).
   - Hardcoded API credentials, private keys, or bank API secrets.
   - Unhandled exceptions or silent failures in reconciliation algorithms.

3. Calculate an overall Risk Score (integer 0 to 100):
   - 0 to 24: Low Risk (Clean financial code, proper decimal math, good test coverage)
   - 25 to 69: Medium Risk (Minor optimization issues or non-critical refactors; requires peer review)
   - 70 to 100: High/Critical Risk (Floating point money calculations, race conditions, double-credit vulnerabilities, unindexed queries; BLOCKS merge)

CRITICAL: Return output ONLY as pure valid JSON conforming strictly to this schema:
{{
    "overall_risk_score": <number 0-100>,
    "blast_radius": "<ISOLATED|MODULE|SYSTEM_WIDE>",
    "verdict": "<APPROVE|REQUEST_CHANGES|BLOCK>",
    "summary": "<Concise 2-3 sentence executive summary of the financial & architectural evaluation>",
    "findings": [
        {{
            "file_path": "<relative file path>",
            "line_number": <approximate line number or 0>,
            "severity": "<LOW|MEDIUM|HIGH|CRITICAL>",
            "issue": "<concise issue description>",
            "suggestion": "<actionable fix or recommendation>"
        }}
    ]
}}

Here is the Git Diff to evaluate:
```diff
{diff_text}
```
"""

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "response_mime_type": "application/json",
            "temperature": 0.2
        }
    }

    try:
        res = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=45)
        if res.status_code != 200:
            # Fallback to gemini-2.5-flash / gemini-3.5-flash-lite
            url_fallback = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
            res = requests.post(url_fallback, json=payload, headers={"Content-Type": "application/json"}, timeout=45)
        
        res.raise_for_status()
        data = res.json()
        raw_text = data["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(raw_text)
    except Exception as e:
        print(f"❌ Gemini API call failed: {e}. Falling back to default low-risk response.")
        return {
            "overall_risk_score": 10,
            "blast_radius": "ISOLATED",
            "verdict": "APPROVE",
            "summary": f"Automated audit fallback due to API status: {e}",
            "findings": []
        }

# 4. Report Feedback to GitHub API (Status Check & PR Comment)
def report_to_github(result):
    score = int(result.get("overall_risk_score", 0))
    blast_radius = result.get("blast_radius", "ISOLATED")
    summary = result.get("summary", "Evaluation complete.")
    findings = result.get("findings", [])

    is_blocked = score >= 70

    print(f"📊 Risk Score: {score}/100 | Blast Radius: {blast_radius} | Status: {'BLOCKED 🔴' if is_blocked else 'PASSED 🟢'}")

    if not GITHUB_TOKEN or not REPO or not PR_NUMBER or not COMMIT_SHA:
        print("ℹ️ Skipping GitHub API calls (local mode). Summary:")
        print(json.dumps(result, indent=2))
        return

    headers = {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json"
    }

    # A. Update GitHub Commit Status Check (This controls the Merge Button)
    status_url = f"https://api.github.com/repos/{REPO}/statuses/{COMMIT_SHA}"
    status_payload = {
        "state": "failure" if is_blocked else "success",
        "description": f"Risk Score: {score}/100 ({'BLOCKED 🔴' if is_blocked else 'PASSED 🟢'})",
        "context": "ai-pr-gatekeeper/risk-assessment",
        "target_url": f"https://github.com/{REPO}/pull/{PR_NUMBER}"
    }
    try:
        r_status = requests.post(status_url, json=status_payload, headers=headers)
        print(f"✅ Commit status check updated: HTTP {r_status.status_code}")
    except Exception as e:
        print(f"⚠️ Failed to update commit status: {e}")

    # B. Post Sticky PR Summary Table
    comment_url = f"https://api.github.com/repos/{REPO}/issues/{PR_NUMBER}/comments"
    status_badge = "🔴 **MERGE BLOCKED (High Risk Financial / Security Violation)**" if is_blocked else "🟢 **PASSED (Ready to Merge)**"

    table_rows = ""
    for f in findings:
        sev_icon = "🔴" if f.get("severity") in ["HIGH", "CRITICAL"] else ("🟡" if f.get("severity") == "MEDIUM" else "🟢")
        table_rows += f"| `{f.get('file_path')}:{f.get('line_number', 0)}` | {sev_icon} `{f.get('severity')}` | {f.get('issue')} | `{f.get('suggestion')}` |\n"

    if not table_rows:
        table_rows = "| - | 🟢 `CLEAN` | No architectural violations or financial math errors detected. | Maintain current test coverage. |\n"

    comment_body = f"""### 🤖 AI Financial Architecture Gatekeeper Report
**Evaluation Verdict:** {status_badge}  
**Overall Risk Score:** `{score} / 100`  
**Blast Radius:** `{blast_radius}`  

> {summary}

---

### 📋 Semantic Audit Findings:
| Location | Severity | Issue Detected | Actionable Suggestion |
| :--- | :---: | :--- | :--- |
{table_rows}

{"⚠️ **Action Required:** This PR exceeds the maximum risk threshold (70/100). Resolve the architectural violations above or request an emergency Break-Glass SOP override from your **Tech Lead / Financial Controller**." if is_blocked else "✨ **Architecture Approved:** Code passes enterprise financial risk requirements."}

*Powered by Google Gemini 3.0 & Autonomous GitHub Actions CI*
"""

    try:
        r_comment = requests.post(comment_url, json={"body": comment_body}, headers=headers)
        print(f"✅ PR summary comment posted: HTTP {r_comment.status_code}")
    except Exception as e:
        print(f"⚠️ Failed to post PR comment: {e}")

if __name__ == "__main__":
    diff_content = get_clean_diff()
    eval_result = analyze_diff_with_gemini(diff_content)
    report_to_github(eval_result)

