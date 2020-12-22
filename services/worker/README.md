# THiNX Remote BuildWorker

This component is responsible for communication with THiNX Build Server over websocket and performing build-jobs with motivation of offloading CPU power to adjacent nodes.

Builder connects to THiNX automatically using a websocket. In some cases, address of the main server should be given.

### Security Precautions

This container is mighty. It will perform any shell command submitted, after passing the validation (which is not a measure in open-source code).

__Be careful and *NEVER EXPOSE THIS CONTAINER's PORT TO PUBLIC*.__ Worker has no authentication, because it is supposed to be placed on internal swarm network and called only from the THiNX Device API.

Use the worker_secret variable to make sure worker cannot be called by unauthorized actor.

### Supported Environment Variables

| Name.                   | Usage.                                          |
|:------------------------|:------------------------------------------------|
| `THINX_SERVER`          | Build Server URL, defaults to localhost:3000    |
| `SQREEN_TOKEN`          | Authentication token for Sqreen.io (optional)   |
| `ROLLBAR_ACCESS_TOKEN`  | Authentication token for Rollbar (optional)     |
| `ROLLBAR_ENVIRONMENT`   | Enviroment for Rollbar (required if token set)  |
| `WORKER_SECRET`         | If set, jobs will be validated for this secret. |

### Building in Development

	docker build -t thinx/worker .
	
	docker run \
		-e THINX_SERVER=<recommended> \
		-e WORKER_SECRET=<recommended> \
		-e SQREEN_TOKEN=<optional> \
		-e ROLLBAR_ACCESS_TOKEN=<optional> \
		-e ROLLBAR_ENVIRONMENT=development \
		-ti thinx/worker
	
	