import { app, query, sparqlEscapeUri } from 'mu';
import Docker from 'dockerode';
import Container from './container';

const docker = new Docker({ socketPath: process.env.MONITOR_DOCKER_SOCKET });

const listContainers = function() {
  return new Promise(function(resolve, reject) {
    docker.listContainers(
      { all : true },
      function(err, containers) {
        if (err)
          reject(err);
        else
          resolve(containers);
    });
  });
};

const getCurrentContainers = async function() {
  let filter = process.env.MONITOR_FILTER_LABEL ? {filter: process.env.MONITOR_FILTER_LABEL } : {};
  let containers = await listContainers();
  return containers.map( (container) => {
    const labels = {};
    for (let key of Object.keys(container["Labels"])) {
      labels[key] = {value: container["Labels"][key]};
    }
    return {
      id: container["Id"],
      name: container["Names"][0],
      status: container["State"],
      image: container["Image"],
      labels: labels
    };
  });
};


function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
};

const awaitGeneric = async function(successMessage, errorMessage, call) {
  let delay = 1;
  while (true) {
    try {
      const list = await call();
      console.info(successMessage);
      return;
    }
    catch(e) {
      console.warn(e);
      console.warn(`ERROR: ${errorMessage}, waiting ${delay} seconds and retrying`);
      await timeout(1000*delay);
      delay = delay * 2;
    }

  }
}
const awaitDb = async function() {
  let call = async function () {
    await query('ASK {?s ?p ?o}');
  };
  await awaitGeneric('successfully connected to database', 'failed to connect to database', call);
};
const awaitDocker = async function() {
  await awaitGeneric('successfully connected to docker daemon', 'failed to connect to docker daemon', listContainers);
};

const syncState = async function() {
  console.log(`Syncing container state in triplestore with containers running on the system`);
  let containers = await getCurrentContainers(docker);
  console.log(`Found ${containers.length} docker containers running on the system`);
  let stale_containers = await Container.findAll();
  console.log(`Found ${stale_containers.length} docker containers in the triplestore.`);
  // update stale_information
  for (let container of stale_containers) {
    let index = containers.findIndex( (c) => c.id === container.id);
    if (index > -1) {
      let current_container_info = containers[index];
      container.update(current_container_info);
      await container.save();
      containers.splice(index, 1);
    }
    else if (container.status != "removed") {
      console.log(`Set container ${container.name} status to removed because it is no longer running.`);
      await container.remove();
    }
  }

  // create missing containers
  for (let newContainer of containers) {
    console.log(`New container found: ${newContainer.name}.`);
    await (new Container(newContainer)).save(true);
  }
};

awaitDb().then( () => awaitDocker().then( () => setInterval(syncState, process.env.MONITOR_SYNC_INTERVAL)));
