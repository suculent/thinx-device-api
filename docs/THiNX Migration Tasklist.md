# THiNX Migration Issues

## Container Security Review

| Container    | State     | Owner | Security
|:-------------|:----------|:------|:----------
| api          | published | THiNX | Tested 719 dependencies for known issues, found 3 issues.
| alpine-gulp  | published | THiNX | OK
| base         | published | THiNX | Tested 192 dependencies for known issues, found 165 issues.
| broker       | published | OSS   | Tested 100 dependencies for known issues, found 73 issues in vendor base image.
| console      | custom-built | User | needs custom build, prefixed using `thinx/` which is private namespace; currently fails on primordials
| couchdb      | published | OSS   | Tested 134 dependencies for known issues, found 92 issues in vendor base image. 
| redis        | published | OSS   | Tested 92 dependencies for known issues, found 69 issues in vendor base image.
| transformer  | published | THiNX | OK
| worker       | published | THiNX | OK
| TODO: builders | published | THiNX | Unknown



## THiNX Architecture - Main Components

THiNX can be deployed using bare Docker containers (well, we have not tried that for a while), using Docker Compose or Docker Swarm with extended deployment tags for Swarmpit.

K8s or other container orchestrator compatibility is not yet supported. Fell free to request it.

| Service Name | Purpose   
|:-------------|:-----------
| Traefik      | Ingress Router and SSL manager
| Swarmpit     | Container Orcherstrator / Monitoring
| |
| API          | REST API
| Console      | Single-page UI App
| |
| Broker       | Message Queue
| Transformer  | Lambda Execution Sandbox
| Worker       | Build Dispatcher
| |
| Redis        | High-speed User Data and Session Storage
| CouchDB      | Medium-speed User Data Storage
| |
| Builders     | TODO: 5+ different one-shot containers (hardcoded for security)