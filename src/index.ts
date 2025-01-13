import { Context, Probot } from "probot";
import yaml from "js-yaml";
import * as Task from "./task.js";
import { Config } from "./common.js";
import * as Student from "./student.js";
import { handle_mentor_cmd } from "./mentor.js";


export default (app: Probot) => {
    app.log.info(`api endpoint: ${process.env.API_ENDPOINT}`);

    app.on(["issue_comment.created", "issue_comment.edited"], async (context) => {
        const comment = context.payload.comment;
        const config = await fetchConfig(context);
        if (comment.user.type === "Bot") {
            context.log.debug("This comment was posted by a bot!");
            return
        }
        const labels = context.payload.issue.labels;
        const hasLabel = labels.some((label) => label.name.startsWith("r2cn"));
        const creator = context.payload.issue.user.login;
        const repo_full_name = context.payload.repository.full_name;

        if (hasLabel && config !== null) {
            const repo = config.repos.find((repo) => repo.name === repo_full_name);
            if (!repo) {
                await context.octokit.issues.createComment(context.issue({
                    body: config.project.noneProjectComment,
                }));
                return
            }

            if (!repo.maintainers.includes(creator)) {
                await context.octokit.issues.createComment(context.issue({
                    body: config.project.noneMaintainerComment,
                }));
                return
            }
            const task = await Task.getTask(context.payload.issue.id);
            if (task == null) {
                const checkRes: Task.CheckTaskResults = await Task.checkTask(context.payload.repository, context.payload.issue, config);
                if (checkRes.result) {
                    const newTaskRes = await Task.newTask(context.payload.repository, context.payload.issue, checkRes.score);
                    if (newTaskRes) {
                        await context.octokit.issues.createComment(context.issue({
                            body: "Task created successfully."
                        }));
                    }
                } else {
                    await context.octokit.issues.createComment(context.issue({
                        body: checkRes.message
                    }));
                }
            } else {
                const comment = context.payload.comment.body.trim();

                if (comment.startsWith("/request")) {
                    let res = await Student.handle_stu_cmd(context.payload.comment.user, comment, config, task);
                    context.octokit.issues.createComment(context.issue({
                        body: res.message
                    }));
                } else if (comment.startsWith("/intern")) {
                    let res = await handle_mentor_cmd(context.payload.comment.user, comment, config, task);
                    context.octokit.issues.createComment(context.issue({
                        body: res.message
                    }));
                } else {
                    context.log.debug("Normal Comment, skipping...")
                }
            }
        } else {
            context.log.error("R2cn label not found or config parsing error")
        }
    });
};


async function fetchConfig(context: Context) {
    const response = await context.octokit.repos.getContent({
        owner: "r2cn-dev",
        repo: "organization",
        path: "organization.yaml",
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
