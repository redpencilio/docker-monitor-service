import { query, update, sparqlEscapeUri, sparqlEscapeString, uuid } from 'mu';

const PREFIXES = `
PREFIX docker: <https://w3.org/ns/bde/docker#>
`;
class Container {
  constructor({id, name, uri, status, labels, image}){
    this.id = id;
    this.name  = name;
    this.uri = uri;
    this.status = status;
    this.labels = labels;
    this.image = image;
    this._dirty = false;
  }

  async setStatus(status) {
    if(this.status != status) {
      this.status = status;
      await this.save(true);
    }
  }

  async remove() {
    this.setStatus('removed');
  }

  static async findAll() {
    // Note that this does not fetch labels, as those are immutable.
    // We also don't fetch removed containers, as a removed container
    // no longer exists in Docker and can thus never show up again.
    const result = await query(`
        ${PREFIXES}
        SELECT ?uri ?id ?name ?status
        FROM ${sparqlEscapeUri(process.env.MU_APPLICATION_GRAPH)}
        WHERE {
          ?uri a docker:Container;
               docker:id ?id;
               docker:name ?name;
               docker:state/docker:status ?status.
        }

    `);
    const bindingKeys = result.head.vars;
    const objects =  result.results.bindings.map( (r) => {
      let obj = {};
      bindingKeys.forEach((key) => {
        if (r[key])
          obj[key] = r[key].value;
      });
      return new this(obj);
    });
    return objects;
  }

  static async getLabels(uri) {
     const result = await query(`
           ${PREFIXES}
           SELECT ?label ?labelKey ?labelValue
           FROM ${sparqlEscapeUri(process.env.MU_APPLICATION_GRAPH)}
           WHERE {
            ${sparqlEscapeUri(uri)} docker:label ?label.
            ?label docker:key ?labelKey.
            ?label docker:value ?labelValue.
          }
    `);
    const labels = {};
    for (let result of result.results.bindings) {
      labels[result.labelKey.value] = { uri: result.label.value, value: result.labelValue.value};
    }
    return labels;
  }

  update(newInformation) {
    // Name and status are the only two properties of a running container (that we keep track of) that can change.
    if(this.name != newInformation.name) {
      this.name = newInformation.name;
      this._dirty = true;
    }
    if(this.status != newInformation.status) {
      this.status = newInformation.status;
      this._dirty = true;
    }
  }

  async save(force=false) {
    // Don't update if nothing has changed.
    if (!this._dirty && !force) {
      console.debug("Not dirty, skipping save for " + this.id);
      return;
    }
    if (this.uri) {
      // assume it already exists in the database if we have a uri
      await update(`
      ${PREFIXES}
      WITH ${sparqlEscapeUri(process.env.MU_APPLICATION_GRAPH)}
      DELETE {
          ${sparqlEscapeUri(this.uri)} docker:name ?name.
          ?stateURI docker:status ?status.
      }
      INSERT {
          ${sparqlEscapeUri(this.uri)} docker:name ${sparqlEscapeString(this.name)}.
          ?stateURI docker:status ${sparqlEscapeString(this.status)}.
      }
      WHERE {
          ${sparqlEscapeUri(this.uri)} a docker:Container;
                   docker:id ?id;
                   docker:name ?name;
                   docker:state ?stateURI.
          ?stateURI docker:status ?status.
      }`);
    }
    else {
      // it's not persisted yet
      const stateURI = `http://data.lblod.info/id/docker-state/${uuid()}`;
      const containerURI = `http://data.lblod.info/id/docker-container/${this.id}`;
      await update(`
      ${PREFIXES}
      INSERT DATA {
        GRAPH ${sparqlEscapeUri(process.env.MU_APPLICATION_GRAPH)} {
          ${sparqlEscapeUri(containerURI)} a docker:Container;
                   docker:id ${sparqlEscapeString(this.id)};
                   docker:name ${sparqlEscapeString(this.name)};
                   docker:image ${sparqlEscapeString(this.image)};
                   docker:state ${sparqlEscapeUri(stateURI)}.

          ${sparqlEscapeUri(stateURI)} a docker:State;
                                       docker:status ${sparqlEscapeString(this.status)}.

          ${this.labelTriples(containerURI).join("\n")}
        }
      }
      `);
    }
    this._dirty = false;
  }

  labelTriples(objUri=this.uri) {
    const triples = new Array();
    if (!this.labels && this.uri)
      this.labels = Container.getLabels(this.uri);
    for (let key of Object.keys(this.labels)) {
      let value = this.labels[key];
      let uri = value.uri ? value.uri : `http://data.lblod.info/id/container-label/${uuid()}`;
      triples.push(`
        ${sparqlEscapeUri(objUri)} docker:label ${sparqlEscapeUri(uri)}.
        ${sparqlEscapeUri(uri)} a docker:ContainerLabel;
                                docker:key ${sparqlEscapeString(key)};
                                docker:value ${sparqlEscapeString(value.value)}.
      `);
    }
  return triples;
  }
}
export default Container;
