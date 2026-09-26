# Triage Labels

The `triage` skill uses these five labels to track issue state:

| Role                | Label             | Meaning                                      |
|---------------------|-------------------|----------------------------------------------|
| Needs triage        | `needs-triage`    | Issue hasn't been evaluated yet              |
| Needs info          | `needs-info`      | Waiting on more information from reporter    |
| Ready for agent     | `ready-for-agent` | Ready for Claude to work on                  |
| Ready for human     | `ready-for-human` | Needs human review or decision               |
| Won't fix           | `wontfix`         | Closed without action                        |

These labels will be created in your GitHub repo if they don't already exist when the `triage` skill first runs.
