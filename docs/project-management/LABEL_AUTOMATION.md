# CrownFi label automation

CrownFi uses one issue type, one open-item status, and the optional `submission-critical` marker.

## Status lifecycle

Open issues and pull requests should have exactly one of:

- `status: ready`
- `status: in-progress`
- `status: in-review`
- `status: awaiting-human-test`
- `status: blocked`
- `status: deferred`

Closed issues and pull requests intentionally have **no status label**. GitHub's closed or merged state is the source of truth after completion.

## Automatic behavior

The `Label status bot` workflow:

- removes every status label when an issue or pull request closes;
- restores `status: ready` when an issue is opened or reopened without a status;
- uses `status: in-progress` for draft pull requests;
- uses `status: in-review` when a pull request is opened ready for review or leaves draft state;
- makes a newly applied recognized status exclusive by removing conflicting status labels;
- runs a weekly and manually dispatchable repository audit;
- fills missing statuses and removes stale statuses from closed items during audits;
- reports issues with missing or multiple type labels and pull requests carrying issue-only type labels.

The workflow uses only the repository-scoped `GITHUB_TOKEN`. It does not check out or execute pull-request code.

## Comment commands

Repository owners, members, and collaborators can set the exclusive status on an issue or pull request by commenting one of:

```text
/status ready
/status in-progress
/status in-review
/status awaiting-human-test
/status blocked
/status deferred
```

A successful command receives a celebration reaction from the bot.

## Issue type policy

Open issues should have exactly one of:

- `type: tracker`
- `type: concern`
- `type: bug`

Pull requests should not carry issue type labels. The bot reports type-policy problems during audits but does not guess an issue's type.

## Submission marker

`submission-critical` is independent of status and type. Keep it only when failure of the item would block the judged submission, primary demonstration, or production promotion.
