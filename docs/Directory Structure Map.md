Directory Structure Map

/thinx-device-api/  --- conf/
					--- data/
					--- data/
					--- repos/					
					--- statistics/
					--- tools/
					--- repositories/	--- {owner_id}/	--- {device_id}/ --- {build_id}/	--- {git_user}/{git_repo}/ --- THIS_IS_THE_GIT_REPOSITORY_PATH

There should be symlink to last build in /mnt/data/repositories/oid/udid/recent.

# Build start bash script

RECENT_SYMLINK='../../recent'
if [[ -f $RECENT_SYMLINK ]]; then
	unlink ../../recent
fi
ln -s . $RECENT_SYMLINK
