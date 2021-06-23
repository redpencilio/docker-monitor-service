# Docker-monitor-service
This service keeps track of containers defined within the connected docker daemon and keeps their state up to date in the database.

## usage
This docker image needs access to a docker socket. If you are using a usernamespace, it is recommended to run this docker using the `--userns='host'` switch. On some systems it may also need the `--privileged` flag.

A typical docker compose file may look like this:

```
version: "3"
services:
  monitor:
    image: lblod/docker-monitor-service
    links:
      - database:database
    privileged: true
    userns_mode: "host"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
  database:
    image: tenforce/virtuoso:1.3.1-virtuoso7.2.4
    environment:
      SPARQL_UPDATE: "true"
      DEFAULT_GRAPH: "http://mu.semte.ch/application"
```

```
docker run -d --userns=host --privileged -v /var/run/docker.sock:/var/run/docker.sock lblod/docker-monitor-service
```

On startup the container updates the container metadata in the triplestore with the data fetched through the docker daemon about running **as well as stopped** containers. Hence, the more docker containers on the system, the longer the initialization procedure will take.

### configuration
The docker image can be configured using the following environment flags:

* `MONITOR_DOCKER_SOCKET`: default: `file:///var/run/docker.sock` specify a different url for the docker socket. currently supports the file and http scheme. For http use `http://IP_OR_DOMAIN:PORT`.
* `MONITOR_FILTER_LABEL`: default: none, if set only keep track of containers that have this label set.
* `MU_SPARQL_ENDPOINT`: default `'http://database:8890/sparql`, sparql endpoint to connect to
* `MONITOR_SYNC_INTERVAL`: default: `10000` is the interval in milliseconds between syncs of the docker daemon container state to the database resulting in deltas being sent (if any update to the containers on the system occurred).
