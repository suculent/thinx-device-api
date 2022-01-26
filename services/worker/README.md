# THiNX Remote BuildWorker

This component is responsible for communication with THiNX Build Server over websocket and performing build-jobs with motivation of offloading CPU power to adjacent nodes.

Builder connects to THiNX automatically using a websocket. In some cases, address of the main server should be given.

## Security Precautions

This container is mighty. It will perform any shell command submitted, after passing the validation (which is not a measure in open-source code).

Use the `WORKER_SECRET` variable on boths sides (API/Worker) to make sure worker cannot be used by unauthorized actor.

## Supported Environment Variables

| Name.                   | Usage.                                          |
|:------------------------|:------------------------------------------------|
| `THINX_SERVER`          | Build Server URL, defaults to localhost:3000    |
| `SQREEN_TOKEN`          | Authentication token for Sqreen.io (optional)   |
| `ROLLBAR_ACCESS_TOKEN`  | Authentication token for Rollbar (optional)     |
| `ROLLBAR_ENVIRONMENT`   | Enviroment for Rollbar (required if token set)  |
| `WORKER_SECRET`         | If set, jobs will be validated for this secret. |

## Building in Development

```bash

 docker build -t thinxcloud/worker .
 
 docker run \
  -e THINX_SERVER=<required> \
  -e WORKER_SECRET=<required> \
  -e SQREEN_TOKEN=<optional> \
  -e ROLLBAR_ACCESS_TOKEN=<optional> \
  -e ROLLBAR_ENVIRONMENT=production \
  -ti thinxcloud/worker

```
