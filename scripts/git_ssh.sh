#!/bin/sh
# Workaround: GIT_SSH_COMMAND isn't supported by Git < 2.3
exec ${GIT_SSH_COMMAND:-ssh} "$@"

# https://stackoverflow.com/questions/14220929/git-clone-with-custom-ssh-using-git-ssh-error
