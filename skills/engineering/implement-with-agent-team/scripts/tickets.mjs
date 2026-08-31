#!/usr/bin/env node
// Every fact about a run comes from the tracker: the graph from native
// blocked-by links, progress from open/closed, and what is in flight from the
// marker comments this file both writes and reads. Nothing is cached between
// runs, so any agent asking the same question gets the same answer.

import { execFile } from "node:child_process";
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

const USAGE = `usage: tickets.mjs <command> [options]

  preflight     --epic <id> | --tickets <ids>   everything that must hold before dispatch
  frontier      --epic <id> | --tickets <ids>   what is takeable, and what each ticket needs
  watch         --epic <id> | --tickets <ids>   emit one line per change; exits when finished
  claim         --ticket <id> --model <m>       take a ticket, and print the branch to build on
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
  console.error("tickets: " + message + "\n\n" + USAGE);
  process.exit(1);
}

function parseReference(reference, what) {
  const match = /^([^/\s]+\/[^#\s]+)#(\d+)$/.exec(String(reference ?? "").trim());
  if (!match) usageError(what + " must look like owner/repo#123, got " + JSON.stringify(reference));
  return { repo: match[1], number: Number(match[2]) };
}

const asKey = (ticket) => ticket.repo + "#" + ticket.number;

async function gh(args, { tolerate = false } = {}) {
  try {
    const { stdout } = await execFileAsync("gh", args, { maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    if (tolerate) return null;
    const detail = String(error.stderr || error.message).trim().split("\n")[0];
    console.error("tickets: `gh " + args.slice(0, 2).join(" ") + "` failed: " + detail);
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
    defaultBranches.set(repo, (await api("repos/" + repo)).default_branch);
  }
  return defaultBranches.get(repo);
}

function slugOf(title) {
  return String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
}
const branchFor = (ticket) => "tkt-" + ticket.number + "-" + slugOf(ticket.title);

// ---------------------------------------------------------------- ticket set

async function ticketSet(options) {
  let tickets;
  if (options.tickets) {
    const references = options.tickets.split(",").map((one) => parseReference(one, "--tickets entry"));
    const issues = await Promise.all(references.map((one) => api("repos/" + one.repo + "/issues/" + one.number)));
    tickets = issues.map((issue, index) => ({
      repo: references[index].repo, number: references[index].number,
      title: issue.title, state: issue.state,
    }));
  } else {
    const epic = parseReference(options.epic, "--epic");
    const children = await api("repos/" + epic.repo + "/issues/" + epic.number + "/sub_issues", { paginate: true });
    if (!children.length) {
      console.error("tickets: " + options.epic + " has no sub-issues. Either it is not an epic, or it never " +
        "finished /to-tickets. Break it into linked tickets before dispatching.");
      process.exit(1);
    }
    tickets = children.map((child) => ({
      repo: child.repository ? child.repository.full_name : epic.repo,
      number: child.number, title: child.title, state: child.state,
    }));
  }
  if (options.repo) tickets = tickets.filter((ticket) => ticket.repo === options.repo);
  if (!tickets.length) usageError("no tickets left after --repo " + options.repo);
  return tickets.sort((a, b) => asKey(a).localeCompare(asKey(b), "en", { numeric: true }));
}

/** The marker comments, latest one wins, plus when the claim was made. */
async function claimRecord(ticket) {
  const comments = await api(
    "repos/" + ticket.repo + "/issues/" + ticket.number + "/comments?per_page=100", { paginate: true });
  const record = { status: null, branch: null, since: null, pr: null };
  for (const comment of comments) {
    const body = String(comment.body || "");
    for (const marker of MARKERS) {
      if (!body.includes(marker.lead)) continue;
      record.status = marker.status;
      record.since = comment.created_at;
      const branch = /Branch `([^`]+)`/.exec(body);
      if (branch) record.branch = branch[1];
      const pr = /PR #(\d+)/.exec(body);
      if (pr) record.pr = Number(pr[1]);
    }
  }
  return record;
}

async function resolveStatuses(tickets) {
  await Promise.all(tickets.map(async (ticket) => {
    ticket.branch = branchFor(ticket);
    if (ticket.state === "closed") { ticket.status = "DONE"; return; }
    const blockers = await api("repos/" + ticket.repo + "/issues/" + ticket.number + "/dependencies/blocked_by");
    ticket.blockers = blockers.map((blocker) => ({
      key: (blocker.repository ? blocker.repository.full_name : ticket.repo) + "#" + blocker.number,
      open: blocker.state !== "closed",
    }));
    ticket.openBlockers = ticket.blockers.filter((blocker) => blocker.open).map((blocker) => blocker.key);
    const record = await claimRecord(ticket);
    ticket.claim = record;
    if (record.branch) ticket.branch = record.branch;
    ticket.pr = record.pr;
    // STUCK outranks BLOCKED: a blocked ticket is expected to free itself, and
    // showing that for one that will not is the more expensive wrong answer.
    if (record.status === "STUCK") { ticket.status = "STUCK"; return; }
    if (ticket.openBlockers.length) { ticket.status = "BLOCKED"; return; }
    ticket.status = record.status || "READY";
    if (ticket.status === "BUILDING" && record.since) {
      ticket.claimedMinutes = Math.floor((Date.now() - Date.parse(record.since)) / 60000);
      if (ticket.claimedMinutes >= STALE_CLAIM_MINUTES && !record.pr) ticket.stale = true;
    }
  }));
  return tickets;
}

function printTable(tickets) {
  const width = Math.max(...tickets.map((ticket) => asKey(ticket).length));
  for (const ticket of tickets) {
    let note = "";
    if (ticket.status === "BLOCKED") note = "  blocked by " + ticket.openBlockers.join(", ");
    else if (ticket.stale) note = "  claimed " + ticket.claimedMinutes + " min ago, still no PR";
    else if (ticket.status === "READY") note = "  branch " + ticket.branch;
    else if (ticket.pr) note = "  PR #" + ticket.pr;
    console.log(ticket.status.padEnd(9) + asKey(ticket).padEnd(width + 2) + ticket.title + note);
  }
  console.log();
}

const countOf = (tickets, status) => tickets.filter((ticket) => ticket.status === status).length;

function summarise(tickets) {
  return ["READY", "BUILDING", "REVIEW", "BLOCKED", "STUCK", "DONE"]
    .map((status) => status.toLowerCase() + " " + countOf(tickets, status)).join(", ");
}

// ------------------------------------------------------------------ commands

async function commandFrontier(options) {
  const tickets = await resolveStatuses(await ticketSet(options));
  if (options.json) { console.log(JSON.stringify(tickets, null, 2)); }
  else printTable(tickets);

  const outstanding = tickets.filter((ticket) => ticket.status !== "DONE");
  if (!outstanding.length) {
    console.log("EPIC COMPLETE: " + tickets.length + " tickets, all closed.");
    return 0;
  }
  console.log("WORK REMAINS: " + summarise(tickets) + ".");
  const stale = tickets.filter((ticket) => ticket.stale);
  if (stale.length) {
    console.log("Re-dispatch: " + stale.map(asKey).join(", ") +
      ": claimed but no PR, so the teammate is gone. Claim again with --redispatch.");
  }
  if (countOf(tickets, "READY")) console.log("Dispatch every READY ticket now, in one message.");
  else if (countOf(tickets, "REVIEW")) console.log("Verify and merge the returned tickets, then run this again.");
  else if (countOf(tickets, "BUILDING")) console.log("Nothing takeable; teammates are out. Wait, then run this again.");
  else if (countOf(tickets, "STUCK")) console.log("Nothing takeable. What remains is stuck and needs a decision.");
  else console.log("Nothing takeable and nothing in flight: the remaining blockers sit outside this ticket set.");
  return 2;
}

async function commandPreflight(options) {
  const problems = [];
  const note = (line) => console.log("  " + line);

  const auth = await gh(["auth", "status"], { tolerate: true });
  console.log(auth === null ? "auth       NOT AUTHENTICATED" : "auth       ok");
  if (auth === null) problems.push("`gh` is not authenticated. Run `gh auth login`.");

  const tickets = await resolveStatuses(await ticketSet(options));
  console.log("tickets    " + tickets.length + " in the set");

  for (const repo of [...new Set(tickets.map((ticket) => ticket.repo))].sort()) {
    const branch = await defaultBranch(repo);
    console.log("base       " + repo + " -> " + branch);
  }

  // GitHub refuses any blocked-by edge that would close a cycle, including
  // across repositories, so the graph is a DAG by construction and needs no
  // check. What it cannot say is how much of it can run at once.
  const level = new Map();
  const depthOf = (key, seen = new Set()) => {
    if (level.has(key)) return level.get(key);
    if (seen.has(key)) return 0;
    seen.add(key);
    const ticket = tickets.find((one) => asKey(one) === key);
    const parents = (ticket?.blockers || []).map((blocker) => blocker.key)
      .filter((parent) => tickets.some((one) => asKey(one) === parent));
    const value = parents.length ? 1 + Math.max(...parents.map((parent) => depthOf(parent, seen))) : 0;
    level.set(key, value);
    return value;
  };
  for (const ticket of tickets) depthOf(asKey(ticket));
  const widths = [...level.values()].reduce((counts, value) =>
    counts.set(value, (counts.get(value) || 0) + 1), new Map());
  const widest = Math.max(...widths.values());
  console.log("shape      " + (Math.max(...level.values()) + 1) + " waves deep, " +
    widest + " ticket(s) can run at once at the widest point");
  if (widest === 1 && tickets.length > 2) {
    note("one long chain: teammates would only queue behind each other's merges");
  }

  const unlinked = tickets.filter((ticket) => ticket.status !== "DONE" && !(ticket.blockers || []).length);
  console.log("links      " + (tickets.length - unlinked.length) + " of " + tickets.length + " carry blocked-by links");
  if (unlinked.length === tickets.length && tickets.length > 1) {
    problems.push("No ticket declares a blocker. Either they are genuinely independent, or the set never " +
      "finished /to-tickets. Confirm before dispatching them all at once.");
  }

  const claimed = tickets.filter((ticket) => ["BUILDING", "REVIEW"].includes(ticket.status));
  console.log("in flight  " + claimed.length + (claimed.length ? " (" + claimed.map(asKey).join(", ") + ")" : ""));
  if (claimed.length) {
    note("a previous run left these claimed; frontier says whether to resume or re-dispatch each");
  }

  console.log();
  if (problems.length) {
    for (const problem of problems) console.log("- " + problem);
    console.log("PREFLIGHT FAILED (" + problems.length + ")");
    return 2;
  }
  console.log("PREFLIGHT OK");
  return 0;
}

async function onlyTicket(options) {
  const reference = parseReference(options.ticket, "--ticket");
  const issue = await api("repos/" + reference.repo + "/issues/" + reference.number);
  return { ...reference, title: issue.title, state: issue.state, id: issue.id };
}

async function postComment(ticket, body) {
  await gh(["api", "--method", "POST",
    "repos/" + ticket.repo + "/issues/" + ticket.number + "/comments", "-f", "body=" + body]);
}

async function commandClaim(options) {
  if (!options.model) usageError("claim needs --model, so the teammate does not inherit the lead's");
  const ticket = await onlyTicket(options);
  const record = await claimRecord(ticket);
  if (record.status === "BUILDING" && !options.redispatch) {
    console.log("ALREADY CLAIMED: " + asKey(ticket) + " is being built on `" + record.branch + "`.");
    console.log("Pass --redispatch only when that teammate is gone.");
    return 2;
  }
  const branch = record.branch || branchFor(ticket);
  const base = await defaultBranch(ticket.repo);
  await postComment(ticket,
    MARKERS[0].lead + "\n\nBranch `" + branch + "`, off `" + base + "`. Model " + options.model + ".");
  console.log("branch " + branch);
  console.log("base   " + base);
  console.log("CLAIMED " + asKey(ticket));
  return 0;
}

async function commandReturn(options) {
  if (!options.pr) usageError("return needs --pr <number>");
  const ticket = await onlyTicket(options);
  await postComment(ticket, MARKERS[1].lead + "\n\nPR #" + options.pr +
    (options.note ? "\n\n" + options.note : ""));
  console.log("RECORDED " + asKey(ticket) + " returned with PR #" + options.pr);
  return 0;
}

async function commandHandBack(options) {
  if (!options.reason) usageError("hand-back needs --reason: what was tried, and what would unblock it");
  const ticket = await onlyTicket(options);
  if (options.blockedOn) {
    const blocker = parseReference(options.blockedOn, "--blocked-on");
    const blockerIssue = await api("repos/" + blocker.repo + "/issues/" + blocker.number);
    await gh(["api", "--method", "POST",
      "repos/" + ticket.repo + "/issues/" + ticket.number + "/dependencies/blocked_by",
      "-F", "issue_id=" + blockerIssue.id]);
    await postComment(ticket, MARKERS[3].lead + "\n\nBlocked on " + asKey(blocker) +
      ", now recorded as a dependency.\n\n" + options.reason);
    console.log("EDGE RECORDED: " + asKey(ticket) + " now blocked by " + asKey(blocker) +
      ", and released. It becomes takeable again when that blocker closes.");
    return 0;
  }
  if (!options.stuck) usageError("hand-back needs either --blocked-on <id> or --stuck");
  await postComment(ticket, MARKERS[2].lead + "\n\n" + options.reason);
  console.log("STUCK " + asKey(ticket) + ". The run continues without it.");
  return 0;
}

async function pullRequestFor(ticket) {
  const record = await claimRecord(ticket);
  const branch = record.branch || branchFor(ticket);
  const found = JSON.parse(await gh(["pr", "list", "--repo", ticket.repo, "--head", branch,
    "--state", "all", "--json", "number,state,baseRefName,mergeable,isDraft,url", "--limit", "5"]));
  return { branch, pull: found[0] || null };
}

async function commandCheckPr(options) {
  const ticket = await onlyTicket(options);
  const { branch, pull } = await pullRequestFor(ticket);
  const problems = [];
  if (!pull) {
    console.log("CHECK FAILED: no pull request from branch `" + branch + "` in " + ticket.repo + ".");
    console.log("The teammate reported work it did not push. Re-dispatch the ticket.");
    return 2;
  }
  console.log("pr         #" + pull.number + " " + pull.state + "  " + pull.url);

  // GitHub's own parse of the closing keyword, not a regex over the body.
  const linked = JSON.parse(await gh(["api", "graphql", "-f", "query=" +
    "query($owner:String!,$repo:String!,$pr:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$pr){" +
    "commits{totalCount} closingIssuesReferences(first:20){nodes{number}} " +
    "statusCheckRollup:commits(last:1){nodes{commit{statusCheckRollup{state}}}}}}}",
    "-F", "owner=" + ticket.repo.split("/")[0], "-F", "repo=" + ticket.repo.split("/")[1],
    "-F", "pr=" + pull.number]));
  const node = linked.data.repository.pullRequest;
  const closes = node.closingIssuesReferences.nodes.map((one) => one.number);
  const rollup = node.statusCheckRollup.nodes[0]?.commit?.statusCheckRollup?.state || "NONE";

  console.log("closes     " + (closes.length ? closes.map((one) => "#" + one).join(", ") : "nothing"));
  if (!closes.includes(ticket.number)) {
    problems.push("PR #" + pull.number + " does not close #" + ticket.number + ". Merging it would leave the " +
      "ticket open and the run would never advance past it. Add `Closes #" + ticket.number + "` to the PR body.");
  }

  const base = await defaultBranch(ticket.repo);
  console.log("base       " + pull.baseRefName);
  if (pull.baseRefName !== base) {
    problems.push("PR #" + pull.number + " targets `" + pull.baseRefName + "`, not `" + base + "`. Retarget it.");
  }

  console.log("commits    " + node.commits.totalCount);
  if (!node.commits.totalCount) problems.push("PR #" + pull.number + " has no commits. Nothing was built.");

  console.log("checks     " + rollup);
  if (rollup === "FAILURE" || rollup === "ERROR") {
    problems.push("Checks are red on PR #" + pull.number + ". Send it back to a teammate before merging.");
  } else if (rollup === "PENDING") {
    problems.push("Checks are still running on PR #" + pull.number + ". Wait, then run this again.");
  }

  console.log("mergeable  " + pull.mergeable + (pull.isDraft ? "  (draft)" : ""));
  if (pull.mergeable === "CONFLICTING") {
    problems.push("PR #" + pull.number + " conflicts with `" + base + "`. Send it back to a teammate to rebase.");
  }
  if (pull.isDraft) problems.push("PR #" + pull.number + " is still a draft. Mark it ready before merging.");

  console.log();
  if (problems.length) {
    for (const problem of problems) console.log("- " + problem);
    console.log("CHECK FAILED (" + problems.length + ")");
    return 2;
  }
  console.log("PR OK: #" + pull.number + " closes #" + ticket.number + ", green, and mergeable.");
  return 0;
}

async function commandCheckMerged(options) {
  const ticket = await onlyTicket(options);
  const { pull } = await pullRequestFor(ticket);
  const issue = await api("repos/" + ticket.repo + "/issues/" + ticket.number);
  console.log("pr         " + (pull ? "#" + pull.number + " " + pull.state : "none found"));
  console.log("ticket     " + issue.state + (issue.state_reason ? " (" + issue.state_reason + ")" : ""));
  console.log();
  if (pull && pull.state === "MERGED" && issue.state === "closed") {
    console.log("MERGED: #" + ticket.number + " is closed, and whatever it blocked is now takeable.");
    return 0;
  }
  if (pull && pull.state === "MERGED" && issue.state === "open") {
    console.log("- PR #" + pull.number + " merged but #" + ticket.number + " is still open, so the run will " +
      "never advance past it. Close the ticket, and add a closing keyword to the next PR.");
  } else if (!pull || pull.state !== "MERGED") {
    console.log("- Nothing merged for #" + ticket.number + " yet. Run check-pr, then merge.");
  }
  console.log("NOT MERGED (" + asKey(ticket) + ")");
  return 2;
}

// A change feed for Monitor: one line per thing the lead would act on, and it
// exits when the set is finished, which ends the watch.
async function commandWatch(options) {
  const interval = Math.max(30, Number(options.interval || 60)) * 1000;
  const etags = new Map();
  let previous = null;

  const repoChanged = async (repo) => {
    const args = ["api", "repos/" + repo + "/issues?state=all&per_page=1", "--include"];
    if (etags.has(repo)) args.push("-H", "If-None-Match: " + etags.get(repo));
    const stdout = await gh(args, { tolerate: true });
    if (stdout === null) return true;
    if (/^HTTP\/[\d.]+ 304/m.test(stdout)) return false;
    const etag = /^etag: *(.+)$/im.exec(stdout);
    if (etag) etags.set(repo, etag[1].trim());
    return true;
  };

  for (;;) {
    const tickets = await ticketSet(options);
    const repos = [...new Set(tickets.map((ticket) => ticket.repo))];
    // Most ticks answer 304 for every repo and cost nothing against the limit.
    const changed = previous === null
      || (await Promise.all(repos.map(repoChanged))).some(Boolean);

    if (changed) {
      await resolveStatuses(tickets);
      const now = new Map(tickets.map((ticket) => [asKey(ticket), ticket]));
      if (previous) {
        for (const [key, ticket] of now) {
          const before = previous.get(key);
          if (!before) continue;
          if (before.status !== ticket.status) {
            const detail = ticket.status === "BLOCKED" ? "blocked by " + ticket.openBlockers.join(", ")
              : ticket.pr ? "PR #" + ticket.pr : "";
            console.log(ticket.status.padEnd(9) + key + "  " + ticket.title + (detail ? "  " + detail : ""));
          }
          if (ticket.stale && !before.stale) {
            console.log("STALE    " + key + "  " + ticket.title +
              "  claimed " + ticket.claimedMinutes + " min ago, still no PR");
          }
        }
      }
      previous = now;
      if (![...now.values()].some((ticket) => ticket.status !== "DONE")) {
        console.log("EPIC COMPLETE: " + tickets.length + " tickets, all closed.");
        return 0;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

// ---------------------------------------------------------------------- main

const argv = process.argv.slice(2);
const command = argv.shift();
if (!command || command === "--help" || command === "-h") { console.log(USAGE); process.exit(0); }

const options = {};
const FLAGS = {
  "--epic": "epic", "--tickets": "tickets", "--repo": "repo", "--ticket": "ticket",
  "--model": "model", "--pr": "pr", "--reason": "reason", "--blocked-on": "blockedOn",
  "--note": "note", "--interval": "interval",
};
for (let index = 0; index < argv.length; index++) {
  const flag = argv[index];
  if (FLAGS[flag]) options[FLAGS[flag]] = argv[++index];
  else if (flag === "--json") options.json = true;
  else if (flag === "--stuck") options.stuck = true;
  else if (flag === "--redispatch") options.redispatch = true;
  else usageError("unknown option " + flag);
}

const setCommands = new Set(["preflight", "frontier", "watch"]);
if (setCommands.has(command) && !options.epic === !options.tickets) {
  usageError(command + " needs exactly one of --epic or --tickets");
}
if (!setCommands.has(command) && !options.ticket) usageError(command + " needs --ticket owner/repo#123");

const commands = {
  preflight: commandPreflight, frontier: commandFrontier, watch: commandWatch,
  claim: commandClaim, return: commandReturn, "hand-back": commandHandBack,
  "check-pr": commandCheckPr, "check-merged": commandCheckMerged,
};
if (!commands[command]) usageError("unknown command " + command);
process.exit(await commands[command](options));
