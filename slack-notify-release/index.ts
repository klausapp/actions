import { setFailed, getInput } from '@actions/core';
import * as github from '@actions/github';
import { WebClient, ActionsBlock, SectionBlock, ContextBlock } from '@slack/web-api';
import template from 'lodash.template';

async function run(): Promise<void> {
  try {
    const { sha, payload } = github.context;
    const isProdRelease = github.context.eventName === 'release';
    const environment = isProdRelease ? 'production' : 'staging';
    const { owner, repo } = github.context.repo;

    const octokit = github.getOctokit(getInput('repo-token'));
    const commit = await octokit.rest.repos.getCommit({ owner, repo, ref: sha });
    const commitLink = `<${commit.data.html_url}|${payload.repository?.name}@${sha.substring(0, 7)}> - ${
      commit.data.commit.message
    }`;
    const compiledTemplate = template(getInput('template'));

    let blocks: (SectionBlock | ActionsBlock | ContextBlock)[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${commitLink}\n${compiledTemplate({ payload, context: github.context, environment })}`,
        },
      },
      {
        type: 'context',
        elements: payload.release
          ? [
              { type: 'image', image_url: payload.release.author.avatar_url, alt_text: 'Avatar' },
              { type: 'mrkdwn', text: `*<${payload.release.author.html_url}|${payload.release.author.login}>*` },
            ]
          : [{ type: 'mrkdwn', text: ':robot_face: *Github Actions*' }],
      },
    ];

    if (isProdRelease === false) {
      const tagParts = ['production', Math.round(Date.now() / 1000)];
      const prefix = getInput('tag-prefix');
      if (prefix) tagParts.unshift(prefix);
      const tag = tagParts.join('-');

      const notes = await octokit.rest.repos.generateReleaseNotes({
        owner,
        repo,
        tag_name: tag,
        target_commitish: sha,
      });

      const title = encodeURIComponent(notes.data.name);
      const body = encodeURIComponent(notes.data.body);

      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Create production release' },
            style: 'primary',
            url: `https://github.com/${owner}/${repo}/releases/new?tag=${tag}&target=${sha}&title=${title}&body=${body}`,
          },
        ],
      });
    }

    const slackToken = getInput('token');
    const slack = new WebClient(slackToken);
    const channel = getInput('channel');
    await slack.chat.postMessage({ channel, blocks, text: 'Release', username: 'Release', icon_emoji: ':rocket:' });
    console.log(`Notified to ${channel}`);
  } catch (error: any) {
    setFailed(error.message);
  }
}

run();
