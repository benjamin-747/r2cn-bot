import { Context, Probot } from "probot";
import yaml from "js-yaml";

interface Config {
  traceRepos: string[];
  taskMaintainers: string[];
  noneProjectComment: string,
  noneAdminComment: string,
}

export default (app: Probot) => {
  app.on("issues.opened", async (context) => {
    const issueComment = context.issue({
      body: "Thanks for opening this issue!",
    });

    context.log.info("This issue is about context");
    app.log.info("This issue is about app");
    await context.octokit.issues.createComment(issueComment);
  });

  app.on(["issue_comment.created", "issue_comment.edited"], async (context) => {
    const comment = context.payload.comment;
    const config = await loadConfig(context);
    if (comment.user.type === "Bot") {
      context.log.debug("This comment was posted by a bot!");
      return
    }
    const labels = context.payload.issue.labels;
    const hasLabel = labels.some((label) => label.name === "r2cn");
    const creator = context.payload.issue.user.login;
    const full_name = context.payload.repository.full_name;

    if (hasLabel && config !== null) {
      if (!config.taskMaintainers.includes(creator)) {
        context.log.debug("none admin")
        await context.octokit.issues.createComment(context.issue({
          body: config.noneAdminComment,
        }));
        return
      }
      if (!config.traceRepos.includes(full_name)) {
        context.log.debug("none project")
        await context.octokit.issues.createComment(context.issue({
          body: config.noneProjectComment,
        }));
        return
      }
      // call api check task status and points.
      await context.octokit.issues.createComment(context.issue({
        body: "Task created successfully.",
      }));
    } else {
      context.log.info("didn't have r2cn label")
    }
  });
};


async function loadConfig(context: Context) {
  const response = await context.octokit.repos.getContent({
    owner: "r2cn-dev",
    repo: "organization",
    path: ".github/config.yaml",
  });

  if ("type" in response.data && response.data.type === "file") {
    // 如果是文件，解码内容
    const content = Buffer.from(response.data.content || "", "base64").toString("utf8");
    context.log.debug("Config file content:", content);
    const config: Config = yaml.load(content) as Config;
    return config;
  } else {
    context.log.error("The path is not a file.");
    return null;
  }
}