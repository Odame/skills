#!/usr/bin/env node
// Every fact about a run comes from the tracker: the graph from native
// blocked-by links, progress from open/closed, and what is in flight from the
// marker comments this file both writes and reads. Nothing is cached between
// runs, so any agent asking the same question gets the same answer.

import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Owned here and nowhere else. A caller that writes one of these by hand can
// word it differently, and the reader below would stop seeing it.
const MARKERS = [
  { status: "BUILDING", lead: "**Dispatched to an implementation agent.**" },
  { status: "REVIEW", lead: "**Implementation returned.**" },
  { status: "STUCK", lead: "**Stuck.**" },
  { status: null, lead: "**Released.**" },
];

const STALE_CLAIM_MINUTES = 25;
const NO_CLAIM = {
  status: null,
  branch: null,
  base: null,
  since: null,
  pr: null,
};

const USAGE = `usage: tickets.mjs <command> [options]

  preflight     --epic <id> | --tickets <ids>   everything that must hold before dispatch
  frontier      --epic <id> | --tickets <ids>   what is takeable, and what each ticket needs
  watch         --epic <id> | --tickets <ids>   emit one line per change; exits when finished
  claim         --ticket <id> --model <m>       take a ticket, and print the branch to build on
                [--base <branch>]              land the run on an integration branch, not the default
  return        --ticket <id> --pr <n>          record that a teammate returned
  hand-back     --ticket <id> --stuck --reason <text>
  hand-back     --ticket <id> --blocked-on <id> --reason <text>
  check-pr      --ticket <id>                   verify the work without trusting the report
  check-merged  --ticket <id>                   verify the merge actually closed the ticket

  <id> is owner/repo#123. --tickets takes a comma-separated list.
  --repo <owner/repo> keeps only tickets in that repository.
  --json emits fields instead of a table, where a command supports it.

The lifecycle is recorded as marker comments on the ticket itself, written and
read only by this file: a dispatch, a return, a release with the dependency that
caused it, and a stuck ticket. Nothing else writes them, so nothing else can
word one differently and go unread.

exit 0  the command's condition holds
exit 2  it does not; the last line says what to do
exit 1  usage, auth, or tracker error`;

function usageError(message) {
  console.error(`tickets: ${message}\n\n${USAGE}`);
  process.exit(1);
}

// ------------------------------------------------------------------ tracker

function parseReference(reference, what) {
  const match = /^([^/\s]+\/[^#\s]+)#(\d+)$/.exec(
    String(reference ?? "").trim(),
  );
  if (!match) {
    usageError(
      `${what} must look like owner/repo#123, got ${JSON.stringify(reference)}`,
    );
  }
  return { repo: match[1], number: Number(match[2]) };
}

const asKey = (ticket) => `${ticket.repo}#${ticket.number}`;
const issuePath = (ticket, suffix = "") =>
  `repos/${ticket.repo}/issues/${ticket.number}${suffix}`;

async function gh(args, { tolerate = false } = {}) {
  try {
    const { stdout } = await execFileAsync("gh", args, {
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout;
  } catch (error) {
    if (tolerate) return null;
    const detail = String(error.stderr || error.message)
      .trim()
      .split("\n")[0];
    console.error(
      `tickets: \`gh ${args.slice(0, 2).join(" ")}\` failed: ${detail}`,
    );
    process.exit(1);
  }
}

async function api(path, { paginate = false, tolerate = false } = {}) {
  const args = ["api", path, "-H", "Accept: application/vnd.github+json"];
  if (paginate) args.push("--paginate", "--slurp");

  const stdout = await gh(args, { tolerate });
  if (stdout === null) return null;

  const parsed = JSON.parse(stdout || "[]");
  return paginate ? parsed.flat() : parsed;
}

const defaultBranches = new Map();

async function defaultBranch(repo) {
  if (!defaultBranches.has(repo)) {
    defaultBranches.set(repo, (await api(`repos/${repo}`)).default_branch);
  }
  return defaultBranches.get(repo);
}

async function branchExists(repo, branch) {
  const found = await api(
    `repos/${repo}/branches/${encodeURIComponent(branch)}`,
    {
      tolerate: true,
    },
  );
  return found !== null;
}

async function postComment(ticket, body) {
  await gh([
    "api",
    "--method",
    "POST",
    issuePath(ticket, "/comments"),
    "-f",
    `body=${body}`,
  ]);
}

// -------------------------------------------------------------- ticket sets

function slugOf(title) {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

const branchFor = (ticket) => `tkt-${ticket.number}-${slugOf(ticket.title)}`;

const asTicket = (repo, issue) => ({
  repo,
  number: issue.number,
  title: issue.title,
  state: issue.state,
});

async function ticketsFromList(list) {
  const references = list
    .split(",")
    .map((one) => parseReference(one, "--tickets entry"));
  const issues = await Promise.all(
    references.map((one) => api(issuePath(one))),
  );
  return issues.map((issue, index) => asTicket(references[index].repo, issue));
}

async function ticketsFromEpic(epicReference) {
  const epic = parseReference(epicReference, "--epic");
  const children = await api(issuePath(epic, "/sub_issues"), {
    paginate: true,
  });

  if (!children.length) {
    console.error(
      `tickets: ${epicReference} has no sub-issues. Either it is not an epic, or it never ` +
        `finished /to-tickets. Break it into linked tickets before dispatching.`,
    );
    process.exit(1);
  }

  // Sub-issues can live in other repositories than the epic does.
  return children.map((child) =>
    asTicket(child.repository ? child.repository.full_name : epic.repo, child),
  );
}

async function ticketSet(options) {
  const all = options.tickets
    ? await ticketsFromList(options.tickets)
    : await ticketsFromEpic(options.epic);

  const tickets = options.repo
    ? all.filter((one) => one.repo === options.repo)
    : all;
  if (!tickets.length)
    usageError(`no tickets left after --repo ${options.repo}`);

  return tickets.sort((a, b) =>
    asKey(a).localeCompare(asKey(b), "en", { numeric: true }),
  );
}

// ------------------------------------------------------------------- claims

/** What one comment records, or null when it carries no marker. */
function readMarker(comment) {
  const body = String(comment.body || "");
  const marker = MARKERS.find((one) => body.includes(one.lead));
  if (!marker) return null;

  const found = { status: marker.status, since: comment.created_at };
  const capture = (key, pattern, cast = String) => {
    const match = pattern.exec(body);
    if (match) found[key] = cast(match[1]);
  };

  capture("branch", /Branch `([^`]+)`/);
  capture("base", /off `([^`]+)`/);
  capture("pr", /PR #(\d+)/, Number);
  return found;
}

/**
 * Later comments supersede earlier ones field by field, rather than wholesale:
 * a return records the pull request without repeating the branch its dispatch
 * already named. Spreading `null` is a no-op, so a comment carrying no marker
 * leaves the record untouched.
 */
async function claimRecord(ticket) {
  const comments = await api(issuePath(ticket, "/comments?per_page=100"), {
    paginate: true,
  });
  return comments.reduce(
    (record, comment) => ({ ...record, ...readMarker(comment) }),
    { ...NO_CLAIM },
  );
}

/** The base a ticket is built on: what it was claimed against, else the repo default. */
async function baseFor(ticket, record) {
  return record?.base || (await defaultBranch(ticket.repo));
}

async function openBlockersOf(ticket) {
  const blockers = await api(issuePath(ticket, "/dependencies/blocked_by"));
  return blockers.map((blocker) => ({
    key: `${blocker.repository ? blocker.repository.full_name : ticket.repo}#${blocker.number}`,
    open: blocker.state !== "closed",
  }));
}

async function resolveStatus(ticket) {
  ticket.branch = branchFor(ticket);

  if (ticket.state === "closed") {
    ticket.status = "DONE";
    return;
  }

  ticket.blockers = await openBlockersOf(ticket);
  ticket.openBlockers = ticket.blockers
    .filter((one) => one.open)
    .map((one) => one.key);

  const record = await claimRecord(ticket);
  ticket.claim = record;
  ticket.base = record.base;
  ticket.pr = record.pr;
  if (record.branch) ticket.branch = record.branch;

  // STUCK outranks BLOCKED: a blocked ticket is expected to free itself, and
  // showing that for one that will not is the more expensive wrong answer.
  if (record.status === "STUCK") {
    ticket.status = "STUCK";
    return;
  }
  if (ticket.openBlockers.length) {
    ticket.status = "BLOCKED";
    return;
  }

  ticket.status = record.status || "READY";

  if (ticket.status === "BUILDING" && record.since) {
    ticket.claimedMinutes = Math.floor(
      (Date.now() - Date.parse(record.since)) / 60000,
    );
    ticket.stale = ticket.claimedMinutes >= STALE_CLAIM_MINUTES && !record.pr;
  }
}

async function resolveStatuses(tickets) {
  await Promise.all(tickets.map(resolveStatus));
  return tickets;
}

// ---------------------------------------------------------------- reporting

function noteFor(ticket) {
  if (ticket.status === "BLOCKED")
    return `  blocked by ${ticket.openBlockers.join(", ")}`;
  if (ticket.stale)
    return `  claimed ${ticket.claimedMinutes} min ago, still no PR`;
  if (ticket.status === "READY") return `  branch ${ticket.branch}`;
  if (ticket.pr) return `  PR #${ticket.pr}`;
  return "";
}

function printTable(tickets) {
  const width = Math.max(...tickets.map((one) => asKey(one).length));

  for (const ticket of tickets) {
    const onIntegration =
      ticket.base && ticket.base !== defaultBranches.get(ticket.repo);
    const trailer =
      noteFor(ticket) + (onIntegration ? `  onto ${ticket.base}` : "");
    console.log(
      ticket.status.padEnd(9) +
        asKey(ticket).padEnd(width + 2) +
        ticket.title +
        trailer,
    );
  }
  console.log();
}

const countOf = (tickets, status) =>
  tickets.filter((one) => one.status === status).length;

const summarise = (tickets) =>
  ["READY", "BUILDING", "REVIEW", "BLOCKED", "STUCK", "DONE"]
    .map((status) => `${status.toLowerCase()} ${countOf(tickets, status)}`)
    .join(", ");

function nextMove(tickets) {
  if (countOf(tickets, "READY"))
    return "Dispatch every READY ticket now, in one message.";
  if (countOf(tickets, "REVIEW"))
    return "Verify and merge the returned tickets, then run this again.";
  if (countOf(tickets, "BUILDING"))
    return "Nothing takeable; teammates are out. Wait, then run this again.";
  if (countOf(tickets, "STUCK"))
    return "Nothing takeable. What remains is stuck and needs a decision.";
  return "Nothing takeable and nothing in flight: the remaining blockers sit outside this ticket set.";
}

// ----------------------------------------------------------------- frontier

async function commandFrontier(options) {
  const tickets = await resolveStatuses(await ticketSet(options));

  // The default branch is what "not an integration branch" is measured against,
  // so it has to be known before anything is compared to it.
  await Promise.all(
    [...new Set(tickets.map((one) => one.repo))].map(defaultBranch),
  );

  if (options.json) console.log(JSON.stringify(tickets, null, 2));
  else printTable(tickets);

  const bases = [
    ...new Set(tickets.filter((one) => one.base).map((one) => one.base)),
  ].sort();
  const integration = bases.filter(
    (base) => base !== defaultBranches.get(tickets[0].repo),
  );

  if (bases.length > 1) {
    console.log(
      `MIXED BASES: claimed tickets target ${bases.join(" and ")}. ` +
        `One run lands in one place, so retarget the odd PRs before merging anything.`,
    );
  }

  const outstanding = tickets.filter((one) => one.status !== "DONE");

  if (!outstanding.length) {
    console.log(`EPIC COMPLETE: ${tickets.length} tickets, all closed.`);
    if (integration.length === 1) {
      console.log(
        `The work is on \`${integration[0]}\`, not the default branch. ` +
          `Open one PR from it to land the run.`,
      );
    }
    return bases.length > 1 ? 2 : 0;
  }

  console.log(`WORK REMAINS: ${summarise(tickets)}.`);

  const stale = tickets.filter((one) => one.stale);
  if (stale.length) {
    console.log(
      `Re-dispatch: ${stale.map(asKey).join(", ")}: claimed but no PR, so the teammate is gone. ` +
        `Claim again with --redispatch.`,
    );
  }

  console.log(nextMove(tickets));
  return 2;
}

// ---------------------------------------------------------------- preflight

/**
 * How many waves deep the graph runs, and how wide it gets. The tracker refuses
 * any blocked-by edge that would close a cycle, including across repositories,
 * so the graph is a DAG by construction and needs no check.
 */
function graphShape(tickets) {
  const inSet = (key) => tickets.some((one) => asKey(one) === key);
  const level = new Map();

  const depthOf = (key, seen = new Set()) => {
    if (level.has(key)) return level.get(key);
    if (seen.has(key)) return 0;
    seen.add(key);

    const ticket = tickets.find((one) => asKey(one) === key);
    const parents = (ticket?.blockers || [])
      .map((one) => one.key)
      .filter(inSet);
    const depth = parents.length
      ? 1 + Math.max(...parents.map((one) => depthOf(one, seen)))
      : 0;

    level.set(key, depth);
    return depth;
  };

  for (const ticket of tickets) depthOf(asKey(ticket));

  const perLevel = [...level.values()].reduce(
    (counts, value) => counts.set(value, (counts.get(value) || 0) + 1),
    new Map(),
  );
  return {
    waves: Math.max(...level.values()) + 1,
    widest: Math.max(...perLevel.values()),
  };
}

async function commandPreflight(options) {
  const problems = [];
  const note = (line) => console.log(`  ${line}`);

  const auth = await gh(["auth", "status"], { tolerate: true });
  console.log(`auth       ${auth === null ? "NOT AUTHENTICATED" : "ok"}`);
  if (auth === null)
    problems.push("`gh` is not authenticated. Run `gh auth login`.");

  const tickets = await resolveStatuses(await ticketSet(options));
  console.log(`tickets    ${tickets.length} in the set`);

  for (const repo of [...new Set(tickets.map((one) => one.repo))].sort()) {
    const branch = options.base || (await defaultBranch(repo));
    const missing = options.base && !(await branchExists(repo, options.base));
    console.log(
      `base       ${repo} -> ${branch}${missing ? "   MISSING" : ""}`,
    );
    if (missing) {
      problems.push(
        `\`${options.base}\` does not exist in ${repo}. Every repository in the run ` +
          `needs the branch before a ticket can be claimed against it.`,
      );
    }
  }
  if (options.base) {
    note(
      "on an integration branch a merge does not close its ticket, so each one is closed by " +
        "hand; check-merged holds the run until that happens",
    );
  }

  const { waves, widest } = graphShape(tickets);
  console.log(
    `shape      ${waves} waves deep, ${widest} ticket(s) can run at once at the widest point`,
  );
  if (widest === 1 && tickets.length > 2) {
    note(
      "one long chain: teammates would only queue behind each other's merges",
    );
  }

  // A closed ticket never had its blockers fetched, so it cannot be judged
  // unlinked; only an open one with no blockers counts against the set.
  const unlinked = tickets.filter(
    (one) => one.status !== "DONE" && !(one.blockers || []).length,
  );
  const linked = tickets.length - unlinked.length;
  console.log(
    `links      ${linked} of ${tickets.length} carry blocked-by links`,
  );
  if (unlinked.length === tickets.length && tickets.length > 1) {
    problems.push(
      "No ticket declares a blocker. Either they are genuinely independent, or the set never " +
        "finished /to-tickets. Confirm before dispatching them all at once.",
    );
  }

  const claimed = tickets.filter((one) =>
    ["BUILDING", "REVIEW"].includes(one.status),
  );
  console.log(
    `in flight  ${claimed.length}${claimed.length ? ` (${claimed.map(asKey).join(", ")})` : ""}`,
  );
  if (claimed.length) {
    note(
      "a previous run left these claimed; frontier says whether to resume or re-dispatch each",
    );
  }

  console.log();
  if (problems.length) {
    for (const problem of problems) console.log(`- ${problem}`);
    console.log(`PREFLIGHT FAILED (${problems.length})`);
    return 2;
  }
  console.log("PREFLIGHT OK");
  return 0;
}

// ------------------------------------------------------------ single ticket

async function onlyTicket(options) {
  const reference = parseReference(options.ticket, "--ticket");
  const issue = await api(issuePath(reference));
  return { ...reference, title: issue.title, state: issue.state, id: issue.id };
}

async function commandClaim(options) {
  if (!options.model) {
    usageError(
      "claim needs --model, so the teammate does not inherit the lead's",
    );
  }

  const ticket = await onlyTicket(options);
  const record = await claimRecord(ticket);

  if (record.status === "BUILDING" && !options.redispatch) {
    console.log(
      `ALREADY CLAIMED: ${asKey(ticket)} is being built on \`${record.branch}\`.`,
    );
    console.log("Pass --redispatch only when that teammate is gone.");
    return 2;
  }

  const branch = record.branch || branchFor(ticket);
  const base =
    options.base || record.base || (await defaultBranch(ticket.repo));

  if (!(await branchExists(ticket.repo, base))) {
    console.log(`NO SUCH BASE: \`${base}\` does not exist in ${ticket.repo}.`);
    console.log(
      "Create it and push it before claiming, or drop --base to build on the default branch.",
    );
    return 2;
  }

  await postComment(
    ticket,
    `${MARKERS[0].lead}\n\nBranch \`${branch}\`, off \`${base}\`. Model ${options.model}.`,
  );

  console.log(`branch ${branch}`);
  console.log(`base   ${base}`);
  if (base !== (await defaultBranch(ticket.repo))) {
    console.log(
      `note   merging into \`${base}\` will not close #${ticket.number} on its own, ` +
        `so close it after the merge; check-merged holds the run until you do.`,
    );
  }
  console.log(`CLAIMED ${asKey(ticket)}`);
  return 0;
}

async function commandReturn(options) {
  if (!options.pr) usageError("return needs --pr <number>");

  const ticket = await onlyTicket(options);
  const extra = options.note ? `\n\n${options.note}` : "";
  await postComment(ticket, `${MARKERS[1].lead}\n\nPR #${options.pr}${extra}`);

  console.log(`RECORDED ${asKey(ticket)} returned with PR #${options.pr}`);
  return 0;
}

async function commandHandBack(options) {
  if (!options.reason) {
    usageError(
      "hand-back needs --reason: what was tried, and what would unblock it",
    );
  }
  const ticket = await onlyTicket(options);

  if (options.blockedOn) {
    const blocker = parseReference(options.blockedOn, "--blocked-on");
    const blockerIssue = await api(issuePath(blocker));

    // The tracker refuses a duplicate edge, which is the state being asked for
    // rather than a failure, so confirm the edge instead of trusting the call.
    const added = await gh(
      [
        "api",
        "--method",
        "POST",
        issuePath(ticket, "/dependencies/blocked_by"),
        "-F",
        `issue_id=${blockerIssue.id}`,
      ],
      { tolerate: true },
    );
    if (added === null) {
      const existing = await api(issuePath(ticket, "/dependencies/blocked_by"));
      if (!existing.some((one) => one.number === blocker.number)) {
        console.log(
          `COULD NOT RECORD: ${asKey(ticket)} is not blocked by ${asKey(blocker)}, and the tracker ` +
            `refused the link. Add it by hand, then release the ticket.`,
        );
        return 2;
      }
    }
    await postComment(
      ticket,
      `${MARKERS[3].lead}\n\nBlocked on ${asKey(blocker)}, now recorded as a dependency.` +
        `\n\n${options.reason}`,
    );

    console.log(
      `EDGE RECORDED: ${asKey(ticket)} now blocked by ${asKey(blocker)}, and released. ` +
        `It becomes takeable again when that blocker closes.`,
    );
    return 0;
  }

  if (!options.stuck)
    usageError("hand-back needs either --blocked-on <id> or --stuck");

  await postComment(ticket, `${MARKERS[2].lead}\n\n${options.reason}`);
  console.log(`STUCK ${asKey(ticket)}. The run continues without it.`);
  return 0;
}

// ------------------------------------------------------------ verifying work

async function pullRequestFor(ticket, record) {
  const branch = record?.branch || branchFor(ticket);
  const found = JSON.parse(
    await gh([
      "pr",
      "list",
      "--repo",
      ticket.repo,
      "--head",
      branch,
      "--state",
      "all",
      "--json",
      "number,state,baseRefName,mergeable,isDraft,url",
      "--limit",
      "5",
    ]),
  );
  return { branch, pull: found[0] || null };
}

/** GitHub's own reading of the pull request, rather than a regex over its body. */
async function pullRequestFacts(ticket, number) {
  const [owner, name] = ticket.repo.split("/");
  const query =
    "query($owner:String!,$repo:String!,$pr:Int!){repository(owner:$owner,name:$repo){" +
    "pullRequest(number:$pr){commits{totalCount} closingIssuesReferences(first:20){nodes{number}} " +
    "statusCheckRollup:commits(last:1){nodes{commit{statusCheckRollup{state}}}}}}}";

  const response = JSON.parse(
    await gh([
      "api",
      "graphql",
      "-f",
      `query=${query}`,
      "-F",
      `owner=${owner}`,
      "-F",
      `repo=${name}`,
      "-F",
      `pr=${number}`,
    ]),
  );
  const node = response.data.repository.pullRequest;

  return {
    commits: node.commits.totalCount,
    closes: node.closingIssuesReferences.nodes.map((one) => one.number),
    checks:
      node.statusCheckRollup.nodes[0]?.commit?.statusCheckRollup?.state ||
      "NONE",
  };
}

async function commandCheckPr(options) {
  const ticket = await onlyTicket(options);
  const record = await claimRecord(ticket);
  const { branch, pull } = await pullRequestFor(ticket, record);

  if (!pull) {
    console.log(
      `CHECK FAILED: no pull request from branch \`${branch}\` in ${ticket.repo}.`,
    );
    console.log(
      "The teammate reported work it did not push. Re-dispatch the ticket.",
    );
    return 2;
  }

  const problems = [];
  const base = await baseFor(ticket, record);
  const onDefault = base === (await defaultBranch(ticket.repo));
  const { commits, closes, checks } = await pullRequestFacts(
    ticket,
    pull.number,
  );

  console.log(`pr         #${pull.number} ${pull.state}  ${pull.url}`);

  // A closing keyword is only recorded for a pull request targeting the default
  // branch, so off one there is nothing to read and its absence proves nothing.
  // The branch ties the pull request to its ticket either way.
  if (onDefault) {
    console.log(
      `closes     ${closes.length ? closes.map((one) => `#${one}`).join(", ") : "nothing"}`,
    );
    if (!closes.includes(ticket.number)) {
      problems.push(
        `PR #${pull.number} does not close #${ticket.number}. Merging it would leave the ticket ` +
          `open and the run would never advance past it. Add \`Closes #${ticket.number}\` to the PR body.`,
      );
    }
  } else {
    console.log(
      `closes     not recorded off the default branch; close #${ticket.number} after merging`,
    );
  }

  console.log(
    `base       ${pull.baseRefName}${pull.baseRefName === base ? "" : `  (claimed on ${base})`}`,
  );
  if (pull.baseRefName !== base) {
    problems.push(
      `PR #${pull.number} targets \`${pull.baseRefName}\`, not \`${base}\`. Retarget it.`,
    );
  }

  console.log(`commits    ${commits}`);
  if (!commits)
    problems.push(`PR #${pull.number} has no commits. Nothing was built.`);

  console.log(`checks     ${checks}`);
  if (checks === "FAILURE" || checks === "ERROR") {
    problems.push(
      `Checks are red on PR #${pull.number}. Send it back to a teammate before merging.`,
    );
  } else if (checks === "PENDING") {
    problems.push(
      `Checks are still running on PR #${pull.number}. Wait, then run this again.`,
    );
  }

  console.log(`mergeable  ${pull.mergeable}${pull.isDraft ? "  (draft)" : ""}`);
  if (pull.mergeable === "CONFLICTING") {
    problems.push(
      `PR #${pull.number} conflicts with \`${base}\`. Send it back to a teammate to rebase.`,
    );
  }
  if (pull.isDraft)
    problems.push(
      `PR #${pull.number} is still a draft. Mark it ready before merging.`,
    );

  console.log();
  if (problems.length) {
    for (const problem of problems) console.log(`- ${problem}`);
    console.log(`CHECK FAILED (${problems.length})`);
    return 2;
  }

  const ending = onDefault
    ? `closes #${ticket.number} on merge.`
    : `targets \`${base}\`, so close #${ticket.number} yourself after merging.`;
  console.log(`PR OK: #${pull.number} is green and mergeable, and ${ending}`);
  return 0;
}

async function commandCheckMerged(options) {
  const ticket = await onlyTicket(options);
  const record = await claimRecord(ticket);
  const { pull } = await pullRequestFor(ticket, record);
  const issue = await api(issuePath(ticket));

  console.log(
    `pr         ${pull ? `#${pull.number} ${pull.state}` : "none found"}`,
  );
  console.log(
    `ticket     ${issue.state}${issue.state_reason ? ` (${issue.state_reason})` : ""}`,
  );
  console.log();

  const merged = pull && pull.state === "MERGED";

  if (merged && issue.state === "closed") {
    console.log(
      `MERGED: #${ticket.number} is closed, and whatever it blocked is now takeable.`,
    );
    return 0;
  }

  if (merged) {
    // The closing keyword only fires on the default branch, so do not diagnose
    // from the keyword. Require the end state and name the remedy for it.
    const base = await baseFor(ticket, record);
    const onDefault = base === (await defaultBranch(ticket.repo));

    console.log(
      `- PR #${pull.number} merged but #${ticket.number} is still open, so nothing it blocks ` +
        `can start. Close it now: gh issue close ${ticket.number} --repo ${ticket.repo}`,
    );
    console.log(
      onDefault
        ? "- Then add a closing keyword to the next PR, so the merge does this itself."
        : `- Expected on \`${base}\`: a closing keyword only fires when the PR merges into the ` +
            `default branch, so every ticket on an integration branch is closed by hand.`,
    );
  } else {
    console.log(
      `- Nothing merged for #${ticket.number} yet. Run check-pr, then merge.`,
    );
  }

  console.log(`NOT MERGED (${asKey(ticket)})`);
  return 2;
}

// -------------------------------------------------------------------- watch

/**
 * A change feed for a background monitor: one line per thing the lead would act
 * on, exiting when the set is finished. Most ticks answer 304 for every
 * repository and cost nothing against the rate limit.
 */
async function commandWatch(options) {
  const interval = Math.max(30, Number(options.interval || 60)) * 1000;
  const etags = new Map();
  let previous = null;

  const repoChanged = async (repo) => {
    const args = [
      "api",
      `repos/${repo}/issues?state=all&per_page=1`,
      "--include",
    ];
    if (etags.has(repo)) args.push("-H", `If-None-Match: ${etags.get(repo)}`);

    const stdout = await gh(args, { tolerate: true });
    if (stdout === null) return true;
    if (/^HTTP\/[\d.]+ 304/m.test(stdout)) return false;

    const etag = /^etag: *(.+)$/im.exec(stdout);
    if (etag) etags.set(repo, etag[1].trim());
    return true;
  };

  const report = (now) => {
    for (const [key, ticket] of now) {
      const before = previous.get(key);
      if (!before) continue;

      if (before.status !== ticket.status) {
        const detail =
          ticket.status === "BLOCKED"
            ? `blocked by ${ticket.openBlockers.join(", ")}`
            : ticket.pr
              ? `PR #${ticket.pr}`
              : "";
        console.log(
          ticket.status.padEnd(9) +
            key +
            "  " +
            ticket.title +
            (detail ? `  ${detail}` : ""),
        );
      }

      if (ticket.stale && !before.stale) {
        console.log(
          `STALE    ${key}  ${ticket.title}  claimed ${ticket.claimedMinutes} min ago, still no PR`,
        );
      }
    }
  };

  for (;;) {
    const tickets = await ticketSet(options);
    const repos = [...new Set(tickets.map((one) => one.repo))];
    const changed =
      previous === null ||
      (await Promise.all(repos.map(repoChanged))).some(Boolean);

    if (changed) {
      await resolveStatuses(tickets);
      const now = new Map(tickets.map((one) => [asKey(one), one]));

      if (previous) report(now);
      previous = now;

      if (![...now.values()].some((one) => one.status !== "DONE")) {
        console.log(`EPIC COMPLETE: ${tickets.length} tickets, all closed.`);
        return 0;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

// --------------------------------------------------------------------- main

const FLAGS = {
  "--epic": "epic",
  "--tickets": "tickets",
  "--repo": "repo",
  "--ticket": "ticket",
  "--model": "model",
  "--pr": "pr",
  "--reason": "reason",
  "--blocked-on": "blockedOn",
  "--base": "base",
  "--note": "note",
  "--interval": "interval",
};

const SWITCHES = {
  "--json": "json",
  "--stuck": "stuck",
  "--redispatch": "redispatch",
};

const COMMANDS = {
  preflight: commandPreflight,
  frontier: commandFrontier,
  watch: commandWatch,
  claim: commandClaim,
  return: commandReturn,
  "hand-back": commandHandBack,
  "check-pr": commandCheckPr,
  "check-merged": commandCheckMerged,
};

const SET_COMMANDS = new Set(["preflight", "frontier", "watch"]);

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (FLAGS[flag]) options[FLAGS[flag]] = argv[++index];
    else if (SWITCHES[flag]) options[SWITCHES[flag]] = true;
    else usageError(`unknown option ${flag}`);
  }
  return options;
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv.shift();

  if (!command || command === "--help" || command === "-h") {
    console.log(USAGE);
    process.exit(0);
  }
  if (!COMMANDS[command]) usageError(`unknown command ${command}`);

  const options = parseArguments(argv);

  if (SET_COMMANDS.has(command) && !options.epic === !options.tickets) {
    usageError(`${command} needs exactly one of --epic or --tickets`);
  }
  if (!SET_COMMANDS.has(command) && !options.ticket) {
    usageError(`${command} needs --ticket owner/repo#123`);
  }

  process.exit(await COMMANDS[command](options));
}

// import.meta.main is undefined on Node < 22.12 (still active on this
// machine), where it reads as falsy and the CLI would silently never run.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

export {
  parseReference,
  asKey,
  issuePath,
  slugOf,
  branchFor,
  asTicket,
  readMarker,
  noteFor,
  countOf,
  summarise,
  nextMove,
  graphShape,
};
