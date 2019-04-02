#!/bin/bash


echo "------- INPUTS -----"

# TEST I:
GIT_REPO="https://github.com/suculent/keyguru-firmware-zion.git"

# TEST II:
#GIT_REPO="git@github.com:suculent/keyguru-firmware-zion.git"

echo "GIT_REPO: $GIT_REPO"
echo

echo "------- PROCESS -----"

# extract the protocol
proto="$(echo $GIT_REPO | grep :// | sed -e's,^\(.*://\).*,\1,g')"
if [[ -z $proto ]]; then
  proto="git-ssl"
fi
echo "proto: $proto"

## Following works for the HTTPS protocol, not GIT+SSL
# remove the protocol
url="$(echo ${GIT_REPO/$proto/})"
echo "url: $url"

user="$(echo $url | grep @ | cut -d@ -f1)"
echo "user: $user"

host="$(echo ${url/$user@/} | cut -d/ -f1)"
echo "host: $host"

# by request - try to extract the port; support custom git ports in future
port="$(echo $host | sed -e 's,^.*:,:,g' -e 's,.*:\([0-9]*\).*,\1,g' -e 's,[^0-9],,g')"
if [[ -z $port ]]; then
  port=22
fi
echo "port: $port"

REPO_PATH="$(echo $url | grep / | cut -d/ -f2-)"
echo "REPO_PATH: $REPO_PATH"

# will be overridden in git mode
REPO_NAME="$(echo $url | grep / | cut -d/ -f3-)"
if [[ ! -z $REPO_NAME ]]; then
  echo "REPO_NAME A: $REPO_NAME"
fi

echo

if [[ "$user" == "git" ]]; then
  echo "Overriding for user git and git-ssl..."
	proto="git-ssl"
	len=${#REPO_NAME}
	OLDHOST=$host

  echo "host-x:        $host"

	GIT_PATH=$REPO_PATH
	REPO_PATH="$(sed 's/.git//g' <<< $GIT_PATH)"
	REPO_NAME="$(echo $url | grep / | cut -d/ -f2-)"
  echo "REPO_NAME C:   $REPO_NAME"
	user="$(echo $OLDHOST | grep : | cut -d: -f2-)"
	#host="$(echo $OLDHOST | grep @ | cut -d: -f1)"
  host="$(echo $OLDHOST | grep : | cut -d: -f1)"
	# host="$(echo $url | grep @ | cut -d: -f2-)" # - returns suculent/keyguru-firmware-zion.git
else
	echo "In git-https mode, user is also from url..."
  user=$(echo $url | grep / | cut -d/ -f2-)
  echo $user
  user=$(echo $user | grep / | cut -d/ -f1)
  echo $user
fi

echo

echo "------- RESULTS -----"

echo "GIT_REPO:    $GIT_REPO"
echo "proto:       $proto"
echo "url:         $url"
echo "user:        $user"
echo "host:        $host"
echo "port:        $port"
echo "REPO_PATH:   $REPO_PATH"
echo "REPO_NAME:   $REPO_NAME"
