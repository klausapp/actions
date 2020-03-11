import { setFailed, getInput } from '@actions/core';
import { context, GitHub } from '@actions/github';
import { WebClient, ActionsBlock, SectionBlock, ContextBlock } from '@slack/web-api';
import template from 'lodash.template';

const now = Math.round(Date.now() / 1000);

async function run(): Promise<void> {
  try {
    const { sha, payload } = context;
    const isProdRelease = context.eventName === 'release';
    const environment = isProdRelease ? 'production' : 'staging';
    const { owner, repo } = context.repo;

    const octokit = new GitHub(getInput('repo-token'));
    const commit = await octokit.repos.getCommit({ owner, repo, ref: sha });
    const commitLink = `<${commit.data.html_url}|${payload.repository?.name}@${sha.substring(0, 7)}> - ${
      commit.data.commit.message
    }`;
    const compiledTemplate = template(getInput('template'));

    let blocks: (SectionBlock | ActionsBlock | ContextBlock)[] = [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `${commitLink}\n${compiledTemplate({ payload, context, environment })}` },
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
      const previousRelease = await octokit.repos.getLatestRelease({ owner, repo });
      const comparison = await octokit.repos.compareCommits({
        owner,
        repo,
        base: previousRelease.data.target_commitish,
        head: sha,
      });
      const commits = comparison.data.commits.map(c => `* ${c.commit.message}`).slice(0, 20);
      const body = encodeURIComponent(commits.join('\n'));

      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Create production release' },
            style: 'primary',
            url: `https://github.com/${payload.repository?.full_name}/releases/new?tag=production-${now}&target=${sha}&body=${body}`,
          },
        ],
      });
    }

    const slackToken = getInput('token');
    const slack = new WebClient(slackToken);
    const channel = getInput('channel');
    await slack.chat.postMessage({ channel, blocks, text: 'Release', username: 'Release', icon_emoji: ':rocket:' });
    console.log(`Notified to ${channel}`);
  } catch (error) {
    setFailed(error.message);
  }
}

run();
