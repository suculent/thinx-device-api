# Remote THiNX Management (RTM) Console

[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2Fsuculent%2Fthinx-console.svg?type=shield)](https://app.fossa.io/projects/git%2Bgithub.com%2Fsuculent%2Fthinx-console?ref=badge_shield)[![Total alerts](https://img.shields.io/lgtm/alerts/g/suculent/thinx-console.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/suculent/thinx-console/alerts/)

AngularJS web application to manage IoT devices via [THiNX API](https://github.com/suculent/thinx-device-api).

## Usage

You need to **BUILD YOUR OWN CONSOLE** Docker image, because the build injects various static variables specific for your environment (e.g. API Keys) into HTML on build (see .circleci/config.yml for list of required build-args until this is documented).

For that reason, no pre-built public thinxcloud/console Docker Hub Image is/will be available.

## License

[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2Fsuculent%2Fthinx-console.svg?type=large)](https://app.fossa.io/projects/git%2Bgithub.com%2Fsuculent%2Fthinx-console?ref=badge_large)
