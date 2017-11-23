#!/bin/bash

github_changelog_generator suculent/thinx-device-api
git add CHANGELOG.md
git push origin master -m "Changelog updated (manual release)"
