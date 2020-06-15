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
      const prefix = getInput('tag-prefix');
      const releases = await octokit.repos.listReleases({ owner, repo });

      let body = '';
      const lastRelease = releases.data.find((t) => t.tag_name.startsWith(prefix || 'production'));

      if (lastRelease) {
        console.info(`Found previous release ${lastRelease.tag_name}`);
        const comparison = await octokit.repos.compareCommits({
          owner,
          repo,
          base: lastRelease.target_commitish,
          head: sha,
        });
        const commitPrefixRgx = /^(?:\w+)(?:\((\w+)\)\:)/i;
        const commits = comparison.data.commits
          .filter((c) => {
            const prefixMatches = c.commit.message.match(commitPrefixRgx);
            return prefixMatches ? prefixMatches[1] === prefix : true;
          })
          .map((c) => `* ${c.commit.message}`)
          .slice(0, 20);
        console.info(`Generating list of ${commits.length}.`);
        body = encodeURIComponent(commits.join('\n'));
      }

      const tag = ['production', now];
      if (prefix) tag.unshift(prefix);

      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Create production release' },
            style: 'primary',
            url: `https://github.com/${payload.repository?.full_name}/releases/new?tag=${tag.join(
              '-',
            )}&target=${sha}&body=${body}`,
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
