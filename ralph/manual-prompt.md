# REPO

You're in the repo at the workspace root. To confirm repo identity, run: `gh repo view --json nameWithOwner -q .nameWithOwner` or `git rev-parse --show-toplevel`.

https://github.com/pschwagler/beach-kings

# FETCH CONTEXT (run these first)

You are working off of https://github.com/pschwagler/beach-kings/issues/46. Run `gh issue view 46 --repo pschwagler/beach-kings --json title,body,comments` and use the JSON to get the issues with bodies and comments.

**Pull latest code** Pull latest feature/ps/seo branch from remote.

**Last 10 RALPH commits:** Run `git log --grep='RALPH' -n 10 --format='%H%n%ad%n%B---' --date=short` from the repo root. Use the output to understand what work has been done (or write it to e.g. `ralph/previous-commits.txt` and read that file).

# TASK BREAKDOWN

Break down the issues into tasks. An issue may contain a single task (a small bugfix or visual tweak) or many, many tasks (a PRD or a large refactor).

Make each task the smallest possible unit of work. We don't want to outrun our headlights. Aim for one small change per task.

# TASK SELECTION

Pick the next task. Prioritize tasks in this order:

1. Critical bugfixes
2. Development infrastructure

Getting development infrastructure like tests and types and dev scripts ready is an important precursor to building features.

3. Tracer bullets for new features

Tracer bullets comes from the Pragmatic Programmer. When building systems, you want to write code that gets you feedback as quickly as possible. Tracer bullets are small slices of functionality that go through all layers of the system, allowing you to test and validate your approach early. This helps in identifying potential issues and ensures that the overall architecture is sound before investing significant time in development.

TL;DR - build a tiny, end-to-end slice of the feature first, then expand it out.

4. Polish and quick wins
5. Refactors

If there are no more tasks, output <promise>NO MORE TASKS</promise>.

# EXPLORATION

Explore the repo and fill your context window with relevant information that will allow you to complete the task.

# EXECUTION

Complete the task.

If you find that the task is larger than you expected (for instance, requires a refactor first), output "HANG ON A SECOND".

Then, find a way to break it into a smaller chunk and only do that chunk (i.e. complete the smaller refactor).


## Visual Verification with Playwright MCP

When working on UI changes, use the Playwright MCP server to verify the application visually:

1. Start the dev server if not already running (`make dev`)
2. Use Playwright MCP to navigate to the relevant page
3. Take screenshots to verify the UI looks correct
4. Test interactive elements (buttons, forms, navigation) work as expected

Example usage:

- "Use playwright mcp to navigate to http://localhost:3000 and take a screenshot"
- "Use playwright mcp to click the login button and verify the form appears"
- "Use playwright mcp to fill in the form and submit it"

This visual verification helps catch UI regressions and ensures changes look correct before committing.

# COMMIT

Make a git commit. The commit message must:

1. Start with `RALPH:` prefix
2. Include task completed + PRD reference
3. Key decisions made
4. Files changed
5. Blockers or notes for next iteration

Keep it concise.

# THE ISSUE

When the task is complete, leave a comment on the GitHub issue with what was done and what's remaining.

# FINAL RULES

ONLY WORK ON A SINGLE TASK.
