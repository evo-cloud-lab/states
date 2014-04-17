/** @fileoverview
 * Provide ConnectorStates
 */

var Class  = require('js-class'),
    States = require('./States');

/** @class ConnectorStates
 * Connector-adapted States
 */
var ConnectorStates = Class(States, {
    constructor: function (connectorClient, logger, options) {
        States.prototype.constructor.call(this, this, logger, options);
        (this._connector = connectorClient)
            .on('state', this.onNodeState.bind(this))
            .on('update', this.onClusterUpdate.bind(this))
            .on('message', this.onClusterMessage.bind(this))
            .on('request', this.onClusterRequest.bind(this))
        ;
    },

    // cluster events
    onNodeState: function (state) {
        this.mode = ['master', 'announcing'].indexOf(state) >= 0 ? States.MASTER : States.SLAVE;
    },

    onClusterUpdate: function (clusterInfo) {
        var nodeIds = clusterInfo.nodes.map(function (node) { return node.id });
        this.nodesUpdate(nodeIds);
    },

    onClusterMessage: function (msg, src) {
        this.clusterMessage(msg.event, msg.data, src);
    },

    onClusterRequest: function (req) {
        this.clusterRequest(req.event, req.data, req.origin.src, req.done);
    },

    // implement IClusterConnector

    get localId () {
        return this._connector.localId;
    },

    /** @function
     * @description send message to cluster
     */
    message: function (event, data, dst) {
        this._connector.send({ event: event, data: data }, dst);
    },

    /** @function
     * @description remote request to master
     */
    request: function (event, data, callback) {
        this._connector.remoteRequest({ event: event, data: data }, 'master', callback);
    }
});

module.exports = ConnectorStates;
