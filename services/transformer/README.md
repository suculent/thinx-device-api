# thinx-node-transformer

[![pipeline status](https://gitlab.com/thinx/thinx-node-transformer/badges/master/pipeline.svg)](https://gitlab.com/thinx/thinx-node-transformer/commits/master)

Instance of NodeJS process [thinx-node-transformer](https://github.com/suculent/thinx-node-tranformer) safely enclosed inside a docker image. Takes jobs as HTTP posts and executes JavaScript code from job locally.

**Before first run**

1. Register at Sqreen.io and add your details as environment variables `SQREEN_APP_NAME` and `SQREEN_TOKEN`
2. Register at Rollbar.io and your Access Token as `POST_SERVER_ITEM_ACCESS_TOKEN` environment variable

See example expected code at [THiNX Wiki](https://suculent/thinx-device-api)

### Exceptionally dumb

This instance does not support anything more than bare node.js express server with https support. **Please, ask for required extensions or provide PR with usage example.**

### Security Note

In production, it's advised to track your Transformer using [Rollbar](https://rollbar.com/) as implemented in example.

If you're running this in open-source production server, you can use free [Sqreen](https://www.sqreen.com) RASP protection to prevent various attacks on your Transformer.

First of all, generate your own Rollbar token, or remove the Rollbar implementation if you don't want to track what's going on inside your Transformer.

This instance must be firewalled. Must not be accessible except on localhost, where it is expected to execute primitive JavaScript in sandbox. Expected to run in Docker as a non-root user. Supports outgoing HTTPS.

### Roadmap

* Provide API for Slack, Influx,...

### Supported Modules (Public)

_Feel free to submit proposals for adding more modules. Intention is to keep it small and safe._

`base-64` : processed JavaScript must be safely encoded when transferred

`ssl-root-cas` : https support


### Notes

Instance should accept only local HTTP requests. Make sure neither port 7475 nor 7474 is exposed on host machine firewall.

`docker run --user=transformer RollbarToken=<your-rollbar-token> -d -p 7475:7474 -v /var/logs:/logs -v /$(pwd):/app suculent/thinx-node-transformer`

### Building the container

`docker build -t suculent/thinx-node-transformer .`


## Job Request Format

HTTP POST BODY:

```
{
  jobs: [
    {
        id: "transaction-identifier",
        owner: "owner-id",
        codename: "status-transformer-alias",
        code: base64.encode("function transformer(status, device) { return status; };"),
        params: {
          status: "Battery 100.0V",
          device: {
            owner: "owner-id",
            id: "device-id"
          }
        }
    }
  ]
}
```
