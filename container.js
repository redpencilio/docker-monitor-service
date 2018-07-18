import { query, update, sparqlEscapeUri, sparqlEscapeString, uuid } from 'mu';

const PREFIXES = `
PREFIX docker: <https://w3.org/ns/bde/docker#>
`;
class Container {
  constructor({id, name, uri, status, stateURI, labels}){
    this.id = id;
    this.name  = name;
    this.uri = uri;
    this.status = status;
    this.stateURI = stateURI;
    this.labels = labels;
  }

  async setStatus(status) {
    this.status = status;
    await this.save();
  }

  async remove() {
    await update(`
        PREFIX docker: <http://w3.org/ns/bde/docker#>
        WITH ${sparqlEscapeUri(process.env.MU_APPLICATION_GRAPH)}
        DELETE {
           ${sparqlEscapeUri(this.uri)} a docker:Container;
                     docker:id ${sparqlEscapeString(this.id)};
                     docker:name ${sparqlEscapeString(this.name)};
                     docker:state ${sparqlEscapeUri(this.stateURI)}.
          ${sparqlEscapeUri(this.stateURI)} docker:status ${sparqlEscapeString(this.status)}.
          ${sparqlEscapeUri(this.uri)} docker:label ?label.
          ?label ?p ?o.
        }
        WHERE {
          ${sparqlEscapeUri(this.uri)} a docker:Container.
          OPTIONAL {
             ${sparqlEscapeUri(this.uri)} docker:label ?label.
             ?label ?p ?o.
          }
        }`);
  }

    static async findAll() {
    const result = await query(`
        ${PREFIXES}
        SELECT ?uri ?id ?name ?stateURI ?status
        FROM ${sparqlEscapeUri(process.env.MU_APPLICATION_GRAPH)}
        WHERE {
          ?uri a docker:Container;
               docker:id ?id;
               docker:name ?name;
               docker:state ?stateURI.
          ?stateURI docker:status ?status.
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
    // for (let obj of objects) {
    //   obj.labels = await Container.getLabels(obj.uri);
    // }
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
    this.id = newInformation.id;
    this.name = newInformation.name;
    this.status = newInformation.status;
    this.labels = newInformation.labels;
  }

  async save() {
    if (this.uri) {
      // assume it already exists in the database if we have a uri
      await update(`
      ${PREFIXES}
      WITH ${sparqlEscapeUri(process.env.MU_APPLICATION_GRAPH)}
      DELETE {
          ${sparqlEscapeUri(this.uri)} a docker:Container;
                   docker:id ?id;
                   docker:name ?name;
                   docker:state ?stateURI;
                   docker:label ?label.
                   ?stateURI docker:status ?status.
          ?label a docker:ContainerLabel;
                 docker:key ?labelKey;
                 docker:value ?labelValue.
      }
      INSERT {
          ${sparqlEscapeUri(this.uri)} a docker:Container;
                   docker:id ${sparqlEscapeString(this.id)};
                   docker:name ${sparqlEscapeString(this.name)};
                   docker:state ?stateURI.
                   ?stateURI docker:status ${sparqlEscapeString(this.status)}.
          ${this.labelTriples().join("\n")}
      }
      WHERE {
          ${sparqlEscapeUri(this.uri)} a docker:Container;
                   docker:id ?id;
                   docker:name ?name;
                   docker:state ?stateURI.
          ?stateURI docker:status ?status.
          OPTIONAL {
            ${sparqlEscapeUri(this.uri)} docker:label ?label.
            ?label a docker:ContainerLabel;
                   docker:key ?labelKey;
                   docker:value ?labelValue.
          }

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
                   docker:state ${sparqlEscapeUri(stateURI)}.
          ${sparqlEscapeUri(stateURI)} docker:status ${sparqlEscapeString(this.status)}.
          ${this.labelTriples(containerURI).join("\n")}
        }
      }
      `);
    }
  }

  labelTriples(objUri=this.uri) {
    const triples = new Array();
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
