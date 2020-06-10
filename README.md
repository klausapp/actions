# Custom Github Actions

## Development

In the repo's root, install the dependencies (since we use yarn workspaces)

```
yarn
```

## Contributing

Before commiting, also build the modified actions, e.g.

```
/slack-notify-release $ yarn build
```

Then open a PR. Once it gets merged, make sure to bump the action's version, e.g.

```
/slack-notify-release $ yarn version --new-version minor
/slack-notify-release $ git push
```
