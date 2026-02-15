---
description: In-depth code review (last commit or branch diff)
argument-hint: "[last | branch | <custom-diff-target>]"
allowed-tools: Bash(git diff:*), Bash(git log:*), Bash(git rev-parse:*), Bash(git branch:*), Bash(git show:*), Read, Glob, Grep, Task
---

# Code Review

You are a senior code reviewer. Perform a thorough, multi-agent code review on the requested diff.

## Step 1: Determine Diff Target

Based on `$ARGUMENTS`:
- **Empty or `last`**: Review the last commit. Use `git diff HEAD~1`.
- **`branch`**: Review the full branch diff from main. Use `git diff main...HEAD`.
- **Anything else**: Use the argument as a literal diff target, e.g. `git diff $ARGUMENTS`.

## Step 2: Gather Context (Haiku Agent)

Launch a **haiku** Task agent to gather:
1. The full diff output (from the target determined above)
2. The list of changed files (`--name-only`)
3. The commit message(s) involved (`git log --oneline` for the relevant range)
4. Read any `CLAUDE.md` files in directories containing changed files

Return all gathered context as a single text block.

## Step 3: Parallel Review (3 Sonnet Agents)

Launch **3 parallel sonnet Task agents**. Pass each agent the **full diff** and **changed file list** from Step 2. Each agent must review the diff against its assigned guidelines below and return a list of issues.

Each issue must include:
- **Severity**: HIGH / MEDIUM / LOW
- **File + line**: `path/to/file:line_number`
- **Category**: Which guideline area
- **Description**: What's wrong and why
- **Suggested fix**: Concrete, actionable code or approach

---

### Agent 1 — Code Quality

Review the diff against these guidelines:

**Constants Over Magic Numbers**
- Replace hard-coded values with named constants
- Use descriptive constant names that explain the value's purpose
- Keep constants at the top of the file or in a dedicated constants file

**Meaningful Names**
- Variables, functions, and classes should reveal their purpose
- Names should explain why something exists and how it's used
- Avoid abbreviations unless universally understood

**Smart Comments**
- Don't comment on what the code does — make the code self-documenting
- Use comments to explain *why* something is done a certain way
- Document APIs, complex algorithms, and non-obvious side effects

**Single Responsibility**
- Each function should do exactly one thing
- Functions should be small and focused
- If a function needs a comment to explain what it does, it should be split

**DRY (Don't Repeat Yourself)**
- Extract repeated code into reusable functions
- Share common logic through proper abstraction
- Maintain single sources of truth

**Clean Structure**
- Keep related code together
- Organize code in a logical hierarchy
- Use consistent file and folder naming conventions

**Encapsulation**
- Hide implementation details
- Expose clear interfaces
- Move nested conditionals into well-named functions

---

### Agent 2 — Production Readiness

Review the diff against these guidelines:

**Refactor-First Principle**
- Before adding: scan the area for duplication, inconsistent patterns, or tech debt — refactor or extract first
- When touching code: leave it cleaner than you found it
- When fixing bugs: address root cause and surrounding fragility, not just the symptom
- When implementing features: prefer solid abstractions over quick copy-paste

**No Shortcuts**
- Don't ship "good enough for now" if a cleaner solution is 20% more effort
- Avoid TODO/FIXME as a substitute for doing it right — resolve or ticket properly
- Resist one-off hacks; generalize when the pattern will recur

**Quality Bar**
- Code: DRY, well-named, single-responsibility, with docstrings where behavior isn't obvious
- Tests: unit tests for logic; integration tests for flows. Fix or extend tests when changing behavior
- UI: modern, accessible, consistent with the design system. No inline magic numbers or ad-hoc styles

**Error Handling**
- Create custom exception classes where appropriate
- Use proper try-except blocks
- Return proper error responses
- Handle edge cases properly

**Security**
- Implement proper input validation
- Follow OWASP guidelines
- No secrets or credentials in code
- Proper CORS and security headers

**Test Coverage**
- Write tests before fixing bugs
- Test edge cases and error conditions
- Keep tests readable and maintainable

---

### Agent 3 — Framework Best Practices

Review the diff against the relevant guidelines based on file type.

**For `.tsx` / `.jsx` files — React:**

- Use functional components over class components
- Keep components small and focused; extract reusable logic into custom hooks
- Use composition over inheritance
- Follow the Rules of Hooks; use appropriate dependency arrays in useEffect
- Implement cleanup in useEffect when needed
- Keep state as close to where it's used as possible; avoid prop drilling
- Implement proper memoization (useMemo, useCallback) only when needed
- Use React.memo for expensive components; avoid unnecessary re-renders
- Use proper key props in lists
- Use controlled components for form inputs with proper validation
- Handle form submission states (loading, error, success)
- Implement Error Boundaries; handle async errors properly
- Use semantic HTML elements; implement proper ARIA attributes
- Ensure keyboard navigation; handle focus management

**For `.py` files — Python / FastAPI:**

- Follow PEP 8 naming: snake_case functions/vars, PascalCase classes, UPPER_CASE constants
- Use type hints for all function parameters and returns
- Use Pydantic models for request/response validation
- Use proper HTTP methods and status codes
- Use proper dependency injection
- Implement proper async operations
- Use SQLAlchemy ORM properly with proper transactions
- Use Google-style docstrings
- Document all public APIs
- Implement proper connection pooling and query optimization

**If no `.py` or `.tsx/.jsx` files are in the diff, skip this agent.**

---

## Step 4: Score & Filter (Parallel Haiku Agents)

For each issue found across all 3 agents, launch a **parallel haiku Task agent** that:
1. Reads the issue description and the actual code context (read the file at the referenced line)
2. Scores confidence 0–100: "How likely is this a real, actionable problem?"
3. Returns the score

**Discard issues scoring below 70.** Keep the rest.

To keep this efficient, batch issues into groups of ~5 per agent rather than one agent per issue.

## Step 5: Final Output

Compile and present the final review in this exact format:

```
## Code Review Summary

Reviewed: <last commit SHA + message | branch diff from main (N commits)>
Files changed: N

### Issues Found (M)

#### 1. [HIGH] Brief description
**File:** path/to/file.py:42
**Category:** Code Quality | Production Readiness | Framework Best Practices
**Why:** Explanation of the problem
**Fix:** Concrete suggestion or code snippet

#### 2. [MEDIUM] Brief description
...

### Strengths
- Brief positive callouts about the code (1-3 items)
```

**Rules:**
- Sort issues by severity (HIGH → MEDIUM → LOW)
- Use actual file:line references from the diff
- Keep descriptions concise but specific
- "Strengths" should be genuine, not filler — skip if nothing stands out
- If zero issues survive filtering, say "No significant issues found" and still list strengths
